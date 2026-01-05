//! Veritas Server - REST API for quantum-authenticated media sealing
//!
//! Exposes veritas-core functionality via HTTP endpoints:
//! - POST /seal - Create a seal for uploaded content
//! - POST /verify - Verify a seal against content

use axum::{
    extract::Multipart,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use veritas_core::{
    generate_keypair, AnuQrng, MediaType, MockQrng, SealBuilder, VeritasSeal,
};

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
                file_data = Some(field.bytes().await.map_err(|e| ApiError {
                    status: StatusCode::BAD_REQUEST,
                    message: format!("Failed to read file: {}", e),
                })?.to_vec());
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
                file_data = Some(field.bytes().await.map_err(|e| ApiError {
                    status: StatusCode::BAD_REQUEST,
                    message: format!("Failed to read file: {}", e),
                })?.to_vec());
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
        (true, format!(
            "Seal valid. Media type: {:?}, QRNG source: {:?}, Captured: {}",
            seal.media_type,
            seal.qrng_source,
            chrono::DateTime::from_timestamp_millis(seal.capture_timestamp_utc as i64)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| "unknown".to_string())
        ))
    } else if !signature_valid {
        (false, "Signature verification failed - seal may be tampered".into())
    } else {
        (false, "Content hash mismatch - file has been modified since sealing".into())
    };

    Ok(Json(VerifyResponse { authentic, details }))
}

/// Health check endpoint
async fn health() -> &'static str {
    "OK"
}

#[tokio::main]
async fn main() {
    println!("╔════════════════════════════════════════════╗");
    println!("║     VERITAS-Q Truth API Server v0.1.0      ║");
    println!("║   Quantum-Authenticated Media Sealing      ║");
    println!("╚════════════════════════════════════════════╝");

    // Configure CORS to allow all origins (for development)
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Request body limit: 50MB
    let body_limit = RequestBodyLimitLayer::new(50 * 1024 * 1024);

    // Build router
    let app = Router::new()
        .route("/seal", post(seal_handler))
        .route("/verify", post(verify_handler))
        .route("/health", axum::routing::get(health))
        .layer(cors)
        .layer(body_limit);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("\nListening on http://{}", addr);
    println!("\nEndpoints:");
    println!("  POST /seal   - Create seal (multipart: file, media_type?, mock?)");
    println!("  POST /verify - Verify seal (multipart: file, seal_data)");
    println!("  GET  /health - Health check");
    println!("\nExample:");
    println!("  curl -X POST http://127.0.0.1:3000/seal \\");
    println!("    -F 'file=@image.jpg' \\");
    println!("    -F 'media_type=image'");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
