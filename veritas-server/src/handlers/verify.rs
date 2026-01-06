//! Seal verification handler
//!
//! Handles POST /verify requests to verify seals against content.

use axum::{extract::Multipart, Json};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;
use veritas_core::{ContentHash, VeritasSeal};

use crate::error::ApiError;
use crate::validation::{validate_content_type, validate_file_size, DEFAULT_MAX_FILE_SIZE};

/// Response for verification
#[derive(Serialize)]
pub struct VerifyResponse {
    pub authentic: bool,
    pub details: String,
}

/// POST /verify - Verify a seal against content
///
/// Accepts multipart/form-data with:
/// - file: The media file to verify
/// - seal_data: Base64-encoded CBOR seal
pub async fn verify_handler(mut multipart: Multipart) -> Result<Json<VerifyResponse>, ApiError> {
    let mut file_data: Option<Vec<u8>> = None;
    let mut seal_data: Option<String> = None;

    // Parse multipart form
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::bad_request(format!("Failed to parse multipart: {}", e)))?
    {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "file" => {
                // Validate Content-Type
                let content_type = field.content_type().map(|s| s.to_string());
                validate_content_type(content_type.as_deref())?;

                // Read file data
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| ApiError::bad_request(format!("Failed to read file: {}", e)))?
                    .to_vec();

                // Validate file size
                validate_file_size(data.len(), DEFAULT_MAX_FILE_SIZE)?;

                file_data = Some(data);
            }
            "seal_data" => {
                seal_data = Some(field.text().await.map_err(|e| {
                    ApiError::bad_request(format!("Failed to read seal_data: {}", e))
                })?);
            }
            _ => {}
        }
    }

    let content = file_data.ok_or_else(|| {
        ApiError::bad_request("No file provided. Use 'file' field in multipart form.")
    })?;

    let seal_b64 = seal_data.ok_or_else(|| ApiError::bad_request("No seal_data provided."))?;

    // Decode seal from base64
    let seal_cbor = BASE64
        .decode(&seal_b64)
        .map_err(|e| ApiError::bad_request(format!("Invalid base64 in seal_data: {}", e)))?;

    // Deserialize seal from CBOR
    let seal = VeritasSeal::from_cbor(&seal_cbor)
        .map_err(|e| ApiError::bad_request(format!("Invalid seal format: {}", e)))?;

    // Verify the signature
    let signature_valid = seal
        .verify()
        .map_err(|e| ApiError::internal(format!("Verification error: {}", e)))?;

    // Verify content hash matches
    let content_hash = ContentHash::from_bytes(&content);
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
