//! Veritas Server - REST API for quantum-authenticated media sealing
//!
//! Exposes veritas-core functionality via HTTP endpoints:
//! - POST /seal - Create a seal for uploaded content
//! - POST /verify - Verify a seal against content
//! - GET /health - Health check

use veritas_server::{create_router_with_config, Config};

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

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

    let app = create_router_with_config(&config).await;

    tracing::info!("Listening on http://{}", addr);
    tracing::info!("Endpoints: POST /seal, POST /verify, GET /health, GET /ready");
    tracing::info!("OpenAPI: GET /docs (Swagger UI), GET /api-docs/openapi.json");
    tracing::info!(
        "Timeout: {}s | Body limit: {}MB",
        config.timeout_secs,
        config.body_limit_mb
    );

    println!("\nListening on http://{}", addr);
    println!("\nEndpoints:");
    println!("  POST /seal   - Create seal (multipart: file, media_type?, mock?)");
    println!("  POST /verify - Verify seal (multipart: file, seal_data)");
    println!("  GET  /health - Health check (JSON: status, version, qrng_available)");
    println!("  GET  /ready  - Kubernetes readiness probe");
    println!("\nDocumentation:");
    println!("  GET  /docs   - Swagger UI (interactive API documentation)");
    println!("  GET  /api-docs/openapi.json - OpenAPI 3.0 specification");
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
    println!("  PORT, HOST, ALLOWED_ORIGINS, BODY_LIMIT_MB, MAX_FILE_SIZE_MB,");
    println!("  REQUEST_TIMEOUT_SECS, RATE_LIMIT_ENABLED, RATE_LIMIT_PER_SEC, RATE_LIMIT_BURST");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .unwrap();

    tracing::info!("Server shutdown complete");
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    use tower::ServiceExt;
    use veritas_server::create_router;

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
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        // Verify required fields are present
        assert!(json.get("status").is_some());
        assert!(json.get("version").is_some());
        assert!(json.get("qrng_available").is_some());
        assert!(json.get("service").is_some());
        assert_eq!(json["service"], "veritas-server");
    }

    #[tokio::test]
    async fn test_ready_endpoint() {
        let app = create_router();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/ready")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(json["ready"], true);
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

    #[tokio::test]
    async fn test_cors_headers_present() {
        let app = create_router();

        let response = app
            .oneshot(
                Request::builder()
                    .method("OPTIONS")
                    .uri("/seal")
                    .header("Origin", "http://localhost:3001")
                    .header("Access-Control-Request-Method", "POST")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // CORS preflight should return 200
        assert_eq!(response.status(), StatusCode::OK);

        // Check CORS headers are present
        assert!(response
            .headers()
            .contains_key("access-control-allow-origin"));
        assert!(response
            .headers()
            .contains_key("access-control-allow-methods"));
    }

    #[tokio::test]
    async fn test_request_id_header_propagated() {
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

        // x-request-id should be set on response
        assert!(
            response.headers().contains_key("x-request-id"),
            "x-request-id header should be present"
        );

        // Should be a valid UUID
        let request_id = response.headers().get("x-request-id").unwrap();
        let id_str = request_id.to_str().unwrap();
        assert!(
            uuid::Uuid::parse_str(id_str).is_ok(),
            "x-request-id should be a valid UUID"
        );
    }

    /// Helper to create multipart with specific file content type
    fn create_seal_multipart_with_content_type(
        content: &[u8],
        file_content_type: &str,
    ) -> (String, Vec<u8>) {
        let boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
        let mut body = Vec::new();

        // File field with specific content type
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(
            b"Content-Disposition: form-data; name=\"file\"; filename=\"test.bin\"\r\n",
        );
        body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", file_content_type).as_bytes());
        body.extend_from_slice(content);
        body.extend_from_slice(b"\r\n");

        // Mock field (always use mock for tests)
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(b"Content-Disposition: form-data; name=\"mock\"\r\n\r\n");
        body.extend_from_slice(b"true");
        body.extend_from_slice(b"\r\n");

        // End boundary
        body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

        let content_type = format!("multipart/form-data; boundary={}", boundary);
        (content_type, body)
    }

    #[tokio::test]
    async fn test_seal_rejects_unsupported_content_type() {
        let app = create_router();
        let content = b"<html><body>Not a media file</body></html>";
        let (content_type, body) = create_seal_multipart_with_content_type(content, "text/html");

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
            .contains("Unsupported Content-Type"));
    }

    #[tokio::test]
    async fn test_seal_accepts_valid_content_types() {
        let valid_types = [
            "image/jpeg",
            "image/png",
            "video/mp4",
            "audio/mpeg",
            "application/octet-stream",
        ];

        for file_type in valid_types {
            let app = create_router();
            let content = b"Test content";
            let (content_type, body) = create_seal_multipart_with_content_type(content, file_type);

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
                "Should accept Content-Type: {}",
                file_type
            );
        }
    }

    #[tokio::test]
    async fn test_health_returns_json_with_required_fields() {
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

        // Check Content-Type is JSON
        let content_type = response.headers().get("content-type").unwrap();
        assert!(content_type.to_str().unwrap().contains("application/json"));

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        // Verify all required fields
        assert!(json["status"].is_string());
        assert!(json["version"].is_string());
        assert!(json["qrng_available"].is_boolean());
        assert_eq!(json["service"], "veritas-server");
    }
}
