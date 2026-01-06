//! Router configuration module
//!
//! Configures all routes, middleware layers, and creates the application router.

use std::{sync::Arc, time::Duration};

use axum::{
    http::{header, Method, StatusCode},
    routing::{get, post},
    Router,
};
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

use crate::config::Config;
use crate::handlers::{health, seal_handler, verify_handler};

/// Create the application router with default config (for testing)
pub fn create_router() -> Router {
    create_router_with_config(&Config::default())
}

/// Create the application router with custom configuration
pub fn create_router_with_config(config: &Config) -> Router {
    // Configure CORS based on allowed_origins
    let cors = match &config.allowed_origins {
        Some(origins) if !origins.is_empty() => {
            let origins: Vec<_> = origins.iter().filter_map(|o| o.parse().ok()).collect();
            tracing::info!("CORS: Restricting to {} origin(s)", origins.len());
            CorsLayer::new()
                .allow_origin(origins)
                .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
                .allow_headers([header::CONTENT_TYPE, header::ACCEPT])
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

    // Base router with common layers
    let router = Router::new()
        .route("/seal", post(seal_handler))
        .route("/verify", post(verify_handler))
        .route("/health", get(health))
        .layer(cors)
        .layer(body_limit)
        .layer(timeout);

    // Conditionally apply rate limiting (disabled in tests, enabled in production)
    if config.rate_limit_enabled {
        let governor_conf = GovernorConfigBuilder::default()
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
            .layer(TraceLayer::new_for_http())
    } else {
        tracing::warn!("Rate limiting: DISABLED");
        router.layer(TraceLayer::new_for_http())
    }
}
