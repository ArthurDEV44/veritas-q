//! Veritas Server - REST API for quantum-authenticated media sealing
//!
//! Exposes veritas-core functionality via HTTP endpoints:
//! - POST /seal - Create a seal for uploaded content
//! - POST /verify - Verify a seal against content

use axum::{
    extract::Multipart,
    http::{header, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;
use std::{net::SocketAddr, sync::Arc, time::Duration};
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use veritas_core::{generate_keypair, AnuQrng, MediaType, MockQrng, SealBuilder, VeritasSeal};

/// Server configuration loaded from environment variables
#[derive(Debug, Clone)]
pub struct Config {
    /// Server port (default: 3000)
    pub port: u16,
    /// Server host (default: 127.0.0.1)
    pub host: [u8; 4],
    /// Allowed CORS origins, comma-separated (default: allow all in dev)
    pub allowed_origins: Option<Vec<String>>,
    /// Request body limit in MB (default: 50)
    pub body_limit_mb: usize,
    /// Request timeout in seconds (default: 30)
    pub timeout_secs: u64,
    /// Enable rate limiting (default: false for tests, true when loaded from env)
    pub rate_limit_enabled: bool,
    /// Rate limit: requests per second (default: 10)
    pub rate_limit_per_sec: u64,
    /// Rate limit: burst size (default: 20)
    pub rate_limit_burst: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: 3000,
            host: [127, 0, 0, 1],
            allowed_origins: None, // None = allow all (dev mode)
            body_limit_mb: 50,
            timeout_secs: 30,
            rate_limit_enabled: false, // Disabled by default (for tests)
            rate_limit_per_sec: 10,
            rate_limit_burst: 20,
        }
    }
}

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> Self {
        let port = std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000);

        let host = std::env::var("HOST")
            .ok()
            .map(|h| {
                if h == "0.0.0.0" {
                    [0, 0, 0, 0]
                } else {
                    [127, 0, 0, 1]
                }
            })
            .unwrap_or([127, 0, 0, 1]);

        let allowed_origins = std::env::var("ALLOWED_ORIGINS").ok().map(|origins| {
            origins
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        });

        let body_limit_mb = std::env::var("BODY_LIMIT_MB")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(50);

        let timeout_secs = std::env::var("REQUEST_TIMEOUT_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(30);

        let rate_limit_per_sec = std::env::var("RATE_LIMIT_PER_SEC")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(10);

        let rate_limit_burst = std::env::var("RATE_LIMIT_BURST")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(20);

        // Rate limiting enabled by default in production, can be disabled with RATE_LIMIT_ENABLED=false
        let rate_limit_enabled = std::env::var("RATE_LIMIT_ENABLED")
            .map(|v| v.to_lowercase() != "false")
            .unwrap_or(true);

        Self {
            port,
            host,
            allowed_origins,
            body_limit_mb,
            timeout_secs,
            rate_limit_enabled,
            rate_limit_per_sec,
            rate_limit_burst,
        }
    }

    /// Get socket address from config
    pub fn socket_addr(&self) -> SocketAddr {
        SocketAddr::from((self.host, self.port))
    }
}

/// Response for successful seal creation
#[derive(Serialize)]
struct SealResponse {
    seal_id: String,
    seal_data: String,
    timestamp: u64,
}

/// Response for verification
#[derive(Serialize)]
struct VerifyResponse {
    authentic: bool,
    details: String,
}

/// API error type
#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        tracing::error!(status = %self.status, error = %self.message, "API error");
        let body = serde_json::json!({
            "error": self.message
        });
        (self.status, Json(body)).into_response()
    }
}

impl From<veritas_core::VeritasError> for ApiError {
    fn from(err: veritas_core::VeritasError) -> Self {
        ApiError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: err.to_string(),
        }
    }
}

/// POST /seal - Create a quantum-authenticated seal for uploaded content
///
/// Accepts multipart/form-data with:
/// - file: The media file to seal
/// - media_type (optional): "image", "video", or "audio" (default: "image")
/// - mock (optional): "true" to use mock QRNG instead of ANU (for testing)
async fn seal_handler(mut multipart: Multipart) -> Result<Json<SealResponse>, ApiError> {
    let mut file_data: Option<Vec<u8>> = None;
    let mut media_type = MediaType::Image;
    let mut use_mock = false;

    // Parse multipart form
    while let Some(field) = multipart.next_field().await.map_err(|e| ApiError {
        status: StatusCode::BAD_REQUEST,
        message: format!("Failed to parse multipart: {}", e),
    })? {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "file" => {
                file_data = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| ApiError {
                            status: StatusCode::BAD_REQUEST,
                            message: format!("Failed to read file: {}", e),
                        })?
                        .to_vec(),
                );
            }
            "media_type" => {
                let value = field.text().await.unwrap_or_default();
                media_type = match value.to_lowercase().as_str() {
                    "video" => MediaType::Video,
                    "audio" => MediaType::Audio,
                    _ => MediaType::Image,
                };
            }
            "mock" => {
                let value = field.text().await.unwrap_or_default();
                use_mock = value.to_lowercase() == "true";
            }
            _ => {}
        }
    }

    let content = file_data.ok_or_else(|| ApiError {
        status: StatusCode::BAD_REQUEST,
        message: "No file provided. Use 'file' field in multipart form.".into(),
    })?;

    // Generate keypair for this seal (in production, use persistent keys from TEE)
    let (public_key, secret_key) = generate_keypair();

    // Create seal with appropriate QRNG source
    let seal = if use_mock {
        let qrng = MockQrng::default();
        SealBuilder::new(content, media_type)
            .build(&qrng, &secret_key, &public_key)
            .await?
    } else {
        // Try ANU QRNG first, fall back to mock if unavailable
        match AnuQrng::new() {
            Ok(qrng) => {
                match SealBuilder::new(content.clone(), media_type)
                    .build(&qrng, &secret_key, &public_key)
                    .await
                {
                    Ok(seal) => seal,
                    Err(e) => {
                        eprintln!("ANU QRNG failed: {}, falling back to mock entropy", e);
                        let mock_qrng = MockQrng::default();
                        SealBuilder::new(content, media_type)
                            .build(&mock_qrng, &secret_key, &public_key)
                            .await?
                    }
                }
            }
            Err(e) => {
                eprintln!("ANU QRNG client creation failed: {}, using mock entropy", e);
                let mock_qrng = MockQrng::default();
                SealBuilder::new(content, media_type)
                    .build(&mock_qrng, &secret_key, &public_key)
                    .await?
            }
        }
    };

    // Serialize seal to CBOR and encode as base64
    let seal_cbor = seal.to_cbor()?;
    let seal_data = BASE64.encode(&seal_cbor);
    let seal_id = uuid::Uuid::new_v4().to_string();

    Ok(Json(SealResponse {
        seal_id,
        seal_data,
        timestamp: seal.capture_timestamp_utc,
    }))
}

/// POST /verify - Verify a seal against content
///
/// Accepts multipart/form-data with:
/// - file: The media file to verify
/// - seal_data: Base64-encoded CBOR seal
async fn verify_handler(mut multipart: Multipart) -> Result<Json<VerifyResponse>, ApiError> {
    let mut file_data: Option<Vec<u8>> = None;
    let mut seal_data: Option<String> = None;

    // Parse multipart form
    while let Some(field) = multipart.next_field().await.map_err(|e| ApiError {
        status: StatusCode::BAD_REQUEST,
        message: format!("Failed to parse multipart: {}", e),
    })? {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "file" => {
                file_data = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| ApiError {
                            status: StatusCode::BAD_REQUEST,
                            message: format!("Failed to read file: {}", e),
                        })?
                        .to_vec(),
                );
            }
            "seal_data" => {
                seal_data = Some(field.text().await.map_err(|e| ApiError {
                    status: StatusCode::BAD_REQUEST,
                    message: format!("Failed to read seal_data: {}", e),
                })?);
            }
            _ => {}
        }
    }

    let content = file_data.ok_or_else(|| ApiError {
        status: StatusCode::BAD_REQUEST,
        message: "No file provided. Use 'file' field in multipart form.".into(),
    })?;

    let seal_b64 = seal_data.ok_or_else(|| ApiError {
        status: StatusCode::BAD_REQUEST,
        message: "No seal_data provided.".into(),
    })?;

    // Decode seal from base64
    let seal_cbor = BASE64.decode(&seal_b64).map_err(|e| ApiError {
        status: StatusCode::BAD_REQUEST,
        message: format!("Invalid base64 in seal_data: {}", e),
    })?;

    // Deserialize seal from CBOR
    let seal = VeritasSeal::from_cbor(&seal_cbor).map_err(|e| ApiError {
        status: StatusCode::BAD_REQUEST,
        message: format!("Invalid seal format: {}", e),
    })?;

    // Verify the signature
    let signature_valid = seal.verify().map_err(|e| ApiError {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        message: format!("Verification error: {}", e),
    })?;

    // Verify content hash matches
    let content_hash = veritas_core::ContentHash::from_bytes(&content);
    let content_matches = content_hash.crypto_hash == seal.content_hash.crypto_hash;

    let (authentic, details) = if signature_valid && content_matches {
        (
            true,
            format!(
                "Seal valid. Media type: {:?}, QRNG source: {:?}, Captured: {}",
                seal.media_type,
                seal.qrng_source,
                chrono::DateTime::from_timestamp_millis(seal.capture_timestamp_utc as i64)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_else(|| "unknown".to_string())
            ),
        )
    } else if !signature_valid {
        (
            false,
            "Signature verification failed - seal may be tampered".into(),
        )
    } else {
        (
            false,
            "Content hash mismatch - file has been modified since sealing".into(),
        )
    };

    Ok(Json(VerifyResponse { authentic, details }))
}

/// Health check endpoint
async fn health() -> &'static str {
    "OK"
}

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
        .route("/health", axum::routing::get(health))
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

/// Graceful shutdown signal handler
///
/// Waits for Ctrl+C or SIGTERM (Unix) to initiate graceful shutdown.
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("Shutdown signal received, draining connections...");
}

#[tokio::main]
async fn main() {
    // Initialize tracing subscriber with env filter (RUST_LOG)
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "veritas_server=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration from environment
    let config = Config::from_env();
    let addr = config.socket_addr();

    println!("╔════════════════════════════════════════════╗");
    println!("║     VERITAS-Q Truth API Server v0.1.0      ║");
    println!("║   Quantum-Authenticated Media Sealing      ║");
    println!("╚════════════════════════════════════════════╝");

    let app = create_router_with_config(&config);

    tracing::info!("Listening on http://{}", addr);
    tracing::info!("Endpoints: POST /seal, POST /verify, GET /health");
    tracing::info!(
        "Timeout: {}s | Body limit: {}MB",
        config.timeout_secs,
        config.body_limit_mb
    );

    println!("\nListening on http://{}", addr);
    println!("\nEndpoints:");
    println!("  POST /seal   - Create seal (multipart: file, media_type?, mock?)");
    println!("  POST /verify - Verify seal (multipart: file, seal_data)");
    println!("  GET  /health - Health check");
    println!("\nConfiguration:");
    println!(
        "  Timeout: {}s | Body limit: {}MB",
        config.timeout_secs, config.body_limit_mb
    );
    if config.rate_limit_enabled {
        println!(
            "  Rate limit: {} req/s (burst: {})",
            config.rate_limit_per_sec, config.rate_limit_burst
        );
    } else {
        println!("  Rate limit: DISABLED");
    }
    println!("\nEnvironment variables:");
    println!("  PORT, HOST, ALLOWED_ORIGINS, BODY_LIMIT_MB, REQUEST_TIMEOUT_SECS,");
    println!("  RATE_LIMIT_ENABLED, RATE_LIMIT_PER_SEC, RATE_LIMIT_BURST");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();

    tracing::info!("Server shutdown complete");
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;

    /// Helper to create multipart body for seal request
    fn create_seal_multipart(content: &[u8], media_type: &str, mock: bool) -> (String, Vec<u8>) {
        let boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
        let mut body = Vec::new();

        // File field
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(
            b"Content-Disposition: form-data; name=\"file\"; filename=\"test.bin\"\r\n",
        );
        body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
        body.extend_from_slice(content);
        body.extend_from_slice(b"\r\n");

        // Media type field
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(b"Content-Disposition: form-data; name=\"media_type\"\r\n\r\n");
        body.extend_from_slice(media_type.as_bytes());
        body.extend_from_slice(b"\r\n");

        // Mock field
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(b"Content-Disposition: form-data; name=\"mock\"\r\n\r\n");
        body.extend_from_slice(if mock { b"true" } else { b"false" });
        body.extend_from_slice(b"\r\n");

        // End boundary
        body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

        let content_type = format!("multipart/form-data; boundary={}", boundary);
        (content_type, body)
    }

    /// Helper to create multipart body for verify request
    fn create_verify_multipart(content: &[u8], seal_data: &str) -> (String, Vec<u8>) {
        let boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
        let mut body = Vec::new();

        // File field
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(
            b"Content-Disposition: form-data; name=\"file\"; filename=\"test.bin\"\r\n",
        );
        body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
        body.extend_from_slice(content);
        body.extend_from_slice(b"\r\n");

        // Seal data field
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(b"Content-Disposition: form-data; name=\"seal_data\"\r\n\r\n");
        body.extend_from_slice(seal_data.as_bytes());
        body.extend_from_slice(b"\r\n");

        // End boundary
        body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

        let content_type = format!("multipart/form-data; boundary={}", boundary);
        (content_type, body)
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let app = create_router();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert_eq!(&body[..], b"OK");
    }

    #[tokio::test]
    async fn test_seal_endpoint_with_mock_qrng() {
        let app = create_router();
        let content = b"Test content for sealing";
        let (content_type, body) = create_seal_multipart(content, "image", true);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/seal")
                    .header("content-type", content_type)
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert!(json.get("seal_id").is_some());
        assert!(json.get("seal_data").is_some());
        assert!(json.get("timestamp").is_some());

        // Verify seal_id is a valid UUID
        let seal_id = json["seal_id"].as_str().unwrap();
        assert!(uuid::Uuid::parse_str(seal_id).is_ok());

        // Verify seal_data is valid base64
        let seal_data = json["seal_data"].as_str().unwrap();
        assert!(BASE64.decode(seal_data).is_ok());
    }

    #[tokio::test]
    async fn test_seal_and_verify_roundtrip() {
        let content = b"Test content for seal and verify roundtrip";

        // Step 1: Create a seal
        let app = create_router();
        let (content_type, body) = create_seal_multipart(content, "image", true);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/seal")
                    .header("content-type", content_type)
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let seal_response: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        let seal_data = seal_response["seal_data"].as_str().unwrap();

        // Step 2: Verify the seal with original content
        let app = create_router();
        let (content_type, body) = create_verify_multipart(content, seal_data);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/verify")
                    .header("content-type", content_type)
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let verify_response: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();

        assert_eq!(verify_response["authentic"], true);
        assert!(verify_response["details"]
            .as_str()
            .unwrap()
            .contains("Seal valid"));
    }

    #[tokio::test]
    async fn test_verify_detects_tampered_content() {
        let original_content = b"Original content";
        let tampered_content = b"Tampered content";

        // Step 1: Create a seal with original content
        let app = create_router();
        let (content_type, body) = create_seal_multipart(original_content, "image", true);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/seal")
                    .header("content-type", content_type)
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let seal_response: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        let seal_data = seal_response["seal_data"].as_str().unwrap();

        // Step 2: Try to verify with tampered content
        let app = create_router();
        let (content_type, body) = create_verify_multipart(tampered_content, seal_data);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/verify")
                    .header("content-type", content_type)
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let verify_response: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();

        assert_eq!(verify_response["authentic"], false);
        assert!(verify_response["details"]
            .as_str()
            .unwrap()
            .contains("Content hash mismatch"));
    }

    #[tokio::test]
    async fn test_seal_without_file_returns_error() {
        let app = create_router();
        let boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
        let body = format!("--{}--\r\n", boundary);
        let content_type = format!("multipart/form-data; boundary={}", boundary);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/seal")
                    .header("content-type", content_type)
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error_response: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();

        assert!(error_response["error"]
            .as_str()
            .unwrap()
            .contains("No file provided"));
    }

    #[tokio::test]
    async fn test_verify_without_seal_data_returns_error() {
        let app = create_router();
        let content = b"Some content";
        let boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";

        let mut body = Vec::new();
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(
            b"Content-Disposition: form-data; name=\"file\"; filename=\"test.bin\"\r\n",
        );
        body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
        body.extend_from_slice(content);
        body.extend_from_slice(b"\r\n");
        body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

        let content_type = format!("multipart/form-data; boundary={}", boundary);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/verify")
                    .header("content-type", content_type)
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error_response: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();

        assert!(error_response["error"]
            .as_str()
            .unwrap()
            .contains("No seal_data provided"));
    }

    #[tokio::test]
    async fn test_verify_with_invalid_base64_returns_error() {
        let app = create_router();
        let content = b"Some content";
        let (content_type, body) = create_verify_multipart(content, "not-valid-base64!!!");

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/verify")
                    .header("content-type", content_type)
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error_response: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();

        assert!(error_response["error"]
            .as_str()
            .unwrap()
            .contains("Invalid base64"));
    }

    #[tokio::test]
    async fn test_seal_with_different_media_types() {
        for media_type in &["image", "video", "audio"] {
            let app = create_router();
            let content = format!("Content for {} type", media_type);
            let (content_type, body) = create_seal_multipart(content.as_bytes(), media_type, true);

            let response = app
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/seal")
                        .header("content-type", content_type)
                        .body(Body::from(body))
                        .unwrap(),
                )
                .await
                .unwrap();

            assert_eq!(
                response.status(),
                StatusCode::OK,
                "Failed for media_type: {}",
                media_type
            );
        }
    }
}
