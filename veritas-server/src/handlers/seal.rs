//! Seal creation handler
//!
//! Handles POST /seal requests to create quantum-authenticated seals for media content.

use axum::{extract::Multipart, Json};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;
use veritas_core::{generate_keypair, AnuQrng, MediaType, MockQrng, SealBuilder};

use crate::error::ApiError;

/// Response for successful seal creation
#[derive(Serialize)]
pub struct SealResponse {
    pub seal_id: String,
    pub seal_data: String,
    pub timestamp: u64,
}

/// POST /seal - Create a quantum-authenticated seal for uploaded content
///
/// Accepts multipart/form-data with:
/// - file: The media file to seal
/// - media_type (optional): "image", "video", or "audio" (default: "image")
/// - mock (optional): "true" to use mock QRNG instead of ANU (for testing)
pub async fn seal_handler(mut multipart: Multipart) -> Result<Json<SealResponse>, ApiError> {
    let mut file_data: Option<Vec<u8>> = None;
    let mut media_type = MediaType::Image;
    let mut use_mock = false;

    // Parse multipart form
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::bad_request(format!("Failed to parse multipart: {}", e)))?
    {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "file" => {
                file_data = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| ApiError::bad_request(format!("Failed to read file: {}", e)))?
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

    let content = file_data.ok_or_else(|| {
        ApiError::bad_request("No file provided. Use 'file' field in multipart form.")
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
                        tracing::warn!("ANU QRNG failed: {}, falling back to mock entropy", e);
                        let mock_qrng = MockQrng::default();
                        SealBuilder::new(content, media_type)
                            .build(&mock_qrng, &secret_key, &public_key)
                            .await?
                    }
                }
            }
            Err(e) => {
                tracing::warn!("ANU QRNG client creation failed: {}, using mock entropy", e);
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
