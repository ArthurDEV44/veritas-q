//! Router configuration module
//!
//! Configures all routes, middleware layers, and creates the application router.

use std::{sync::Arc, time::Duration};

use axum::{
    http::{header, Method, StatusCode},
    routing::{get, post},
    Router,
};
use sqlx::postgres::PgPoolOptions;
use tower_governor::{
    governor::GovernorConfigBuilder, key_extractor::SmartIpKeyExtractor, GovernorLayer,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::auth::JwksCache;
use crate::config::Config;
use crate::db::{SealRepository, UserRepository};
#[cfg(feature = "c2pa")]
use crate::handlers::{c2pa_embed_handler, c2pa_verify_handler};
use crate::handlers::{
    delete_user_handler, export_seal_handler, get_current_user_handler, get_user_seal_handler,
    health, list_user_seals_handler, ready, resolve_handler, seal_handler, sync_user_handler,
    verify_handler,
};
use crate::manifest_store::PostgresManifestStore;
use crate::openapi::ApiDoc;
use crate::state::AppState;
use crate::webauthn::{
    finish_authentication, finish_registration, start_authentication, start_registration,
    WebAuthnState, WebAuthnStorage,
};

/// Create the application router with default config (for testing)
/// Uses in-memory storage for WebAuthn.
pub fn create_router() -> Router {
    create_router_with_config_sync(&Config::default())
}

/// Create the application router with in-memory WebAuthn storage (sync version for tests)
pub fn create_router_with_config_sync(config: &Config) -> Router {
    create_router_internal(config, WebAuthnStorage::in_memory(), None, None, None, None)
}

/// Create the application router with custom configuration (async version)
/// Uses PostgreSQL storage if DATABASE_URL is set.
pub async fn create_router_with_config(config: &Config) -> Router {
    // Initialize stores if DATABASE_URL is set
    let (storage, manifest_store, user_repo, seal_repo) = match std::env::var("DATABASE_URL") {
        Ok(url) => {
            // Create shared pool with configured connection limits
            let pool = match PgPoolOptions::new()
                .max_connections(config.database_max_connections)
                .min_connections(config.database_min_connections)
                .connect(&url)
                .await
            {
                Ok(pool) => {
                    tracing::info!(
                        "Database pool connected (min: {}, max: {})",
                        config.database_min_connections,
                        config.database_max_connections
                    );

                    // Run migrations
                    if let Err(e) = sqlx::migrate!("./migrations").run(&pool).await {
                        tracing::error!("Failed to run migrations: {}", e);
                        None
                    } else {
                        tracing::info!("Database migrations applied");
                        Some(pool)
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to connect to database: {}", e);
                    None
                }
            };

            // Initialize all components using shared pool
            let storage = pool
                .as_ref()
                .map(|p| WebAuthnStorage::from_pool(p.clone()))
                .unwrap_or_else(WebAuthnStorage::in_memory);

            let manifest_store = pool.as_ref().map(|p| {
                tracing::info!("Manifest store initialized with shared pool");
                Arc::new(PostgresManifestStore::from_pool(p.clone()))
            });

            let user_repo = pool.as_ref().map(|p| {
                tracing::info!("User repository initialized with shared pool");
                Arc::new(UserRepository::new(p.clone()))
            });

            let seal_repo = pool.map(|p| {
                tracing::info!("Seal repository initialized with shared pool");
                Arc::new(SealRepository::new(p))
            });

            (storage, manifest_store, user_repo, seal_repo)
        }
        Err(_) => {
            tracing::info!("DATABASE_URL not set, database features disabled");
            (WebAuthnStorage::in_memory(), None, None, None)
        }
    };

    // Initialize JWKS cache for JWT validation if Clerk JWKS URL is configured
    let jwks_cache = config.clerk_jwks_url.as_ref().map(|url| {
        tracing::info!("JWT authentication enabled (CLERK_JWKS_URL set)");
        Arc::new(JwksCache::new(url.clone()))
    });

    create_router_internal(
        config,
        storage,
        manifest_store,
        user_repo,
        seal_repo,
        jwks_cache,
    )
}

/// Internal router creation with provided storage
fn create_router_internal(
    config: &Config,
    webauthn_storage: WebAuthnStorage,
    manifest_store: Option<Arc<PostgresManifestStore>>,
    user_repo: Option<Arc<UserRepository>>,
    seal_repo: Option<Arc<SealRepository>>,
    jwks_cache: Option<Arc<JwksCache>>,
) -> Router {
    // Configure CORS based on allowed_origins
    let cors = match &config.allowed_origins {
        Some(origins) if !origins.is_empty() => {
            let origins: Vec<_> = origins.iter().filter_map(|o| o.parse().ok()).collect();
            tracing::info!("CORS: Restricting to {} origin(s)", origins.len());
            CorsLayer::new()
                .allow_origin(origins)
                .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
                .allow_headers([
                    header::CONTENT_TYPE,
                    header::ACCEPT,
                    header::AUTHORIZATION,
                    header::ORIGIN,
                ])
                .allow_credentials(true)
        }
        _ => {
            tracing::warn!("CORS: Allowing all origins (dev mode)");
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any)
        }
    };

    // Request body limit
    let body_limit = RequestBodyLimitLayer::new(config.body_limit_mb * 1024 * 1024);

    // Request timeout
    let timeout = TimeoutLayer::with_status_code(
        StatusCode::REQUEST_TIMEOUT,
        Duration::from_secs(config.timeout_secs),
    );

    // Request ID header name
    let x_request_id = axum::http::HeaderName::from_static("x-request-id");

    // Trace layer with request ID in spans
    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(DefaultMakeSpan::new().include_headers(true))
        .on_response(DefaultOnResponse::new().include_headers(true));

    // Initialize WebAuthn state with provided storage
    let webauthn_config =
        crate::webauthn::WebAuthnConfig::from_env().expect("WebAuthn config must be valid");

    let webauthn_state = Arc::new(WebAuthnState {
        config: webauthn_config,
        storage: webauthn_storage,
    });

    // WebAuthn routes (require state)
    let webauthn_router = Router::new()
        .route("/register/start", post(start_registration))
        .route("/register/finish", post(finish_registration))
        .route("/authenticate/start", post(start_authentication))
        .route("/authenticate/finish", post(finish_authentication))
        .with_state(webauthn_state);

    // Create app state for shared resources
    let app_state = AppState {
        manifest_store,
        user_repo,
        seal_repo,
        jwks_cache,
        allow_mock_qrng: config.allow_mock_qrng,
    };

    // Routes that require app state (seal, resolve, users, seals, c2pa)
    let mut stateful_router = Router::new()
        .route("/seal", post(seal_handler))
        .route("/resolve", post(resolve_handler))
        // User routes (v1 API)
        .route("/api/v1/users/sync", post(sync_user_handler))
        .route(
            "/api/v1/users/me",
            get(get_current_user_handler).delete(delete_user_handler),
        )
        // Seals routes (v1 API) - user's seal history
        .route("/api/v1/seals", get(list_user_seals_handler))
        .route("/api/v1/seals/{seal_id}", get(get_user_seal_handler))
        .route("/api/v1/seals/{seal_id}/export", get(export_seal_handler));

    // Add C2PA routes if feature enabled (needs AppState for mock QRNG gating)
    #[cfg(feature = "c2pa")]
    {
        stateful_router = stateful_router
            .route("/c2pa/embed", post(c2pa_embed_handler))
            .route("/c2pa/verify", post(c2pa_verify_handler));
    }

    let stateful_router = stateful_router.with_state(app_state);

    // Base router with common layers
    let router = Router::new()
        .merge(stateful_router)
        .route("/verify", post(verify_handler))
        .route("/health", get(health))
        .route("/ready", get(ready))
        .nest("/webauthn", webauthn_router);

    let router = router
        // OpenAPI documentation endpoints
        .merge(SwaggerUi::new("/docs").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .layer(cors)
        .layer(body_limit)
        .layer(timeout)
        // Request ID layers - set ID on incoming request, propagate to response
        .layer(PropagateRequestIdLayer::new(x_request_id.clone()))
        .layer(SetRequestIdLayer::new(x_request_id, MakeRequestUuid));

    // Conditionally apply rate limiting (disabled in tests, enabled in production)
    if config.rate_limit_enabled {
        // Use SmartIpKeyExtractor to support proxies (X-Forwarded-For, X-Real-Ip)
        // and fall back to direct connection IP
        let governor_conf = GovernorConfigBuilder::default()
            .key_extractor(SmartIpKeyExtractor)
            .per_second(config.rate_limit_per_sec)
            .burst_size(config.rate_limit_burst)
            .finish()
            .expect("Failed to build rate limiter config");

        tracing::info!(
            "Rate limiting: {} req/s (burst: {})",
            config.rate_limit_per_sec,
            config.rate_limit_burst
        );

        router
            .layer(GovernorLayer::new(Arc::new(governor_conf)))
            .layer(trace_layer)
    } else {
        tracing::warn!("Rate limiting: DISABLED");
        router.layer(trace_layer)
    }
}
