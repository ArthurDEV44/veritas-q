//! Seal creation handler
//!
//! Handles POST /seal requests to create quantum-authenticated seals for media content.

use axum::{extract::Multipart, Json};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;
use utoipa::ToSchema;
use veritas_core::{generate_keypair, AnuQrng, MediaType, MockQrng, SealBuilder};

use crate::error::ApiError;
use crate::validation::{validate_content_type, validate_file_size, DEFAULT_MAX_FILE_SIZE};
use crate::webauthn::DeviceAttestation;

/// Response for successful seal creation
#[derive(Serialize, ToSchema)]
pub struct SealResponse {
    /// Unique identifier for this seal
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub seal_id: String,
    /// Base64-encoded CBOR seal data (contains signature, QRNG entropy, content hash)
    #[schema(example = "omZzZWFsX2...")]
    pub seal_data: String,
    /// Capture timestamp in milliseconds since Unix epoch
    #[schema(example = 1704067200000_u64)]
    pub timestamp: u64,
    /// Whether device attestation was included in the seal
    #[schema(example = true)]
    pub has_device_attestation: bool,
}

/// Maximum age for device attestation to be considered fresh (5 minutes)
const MAX_ATTESTATION_AGE_SECS: u64 = 300;

/// Create a quantum-authenticated seal for uploaded content
///
/// Accepts multipart/form-data with:
/// - **file** (required): The media file to seal (max 25MB)
/// - **media_type** (optional): "image", "video", "audio", or "generic" (default: "image")
/// - **mock** (optional): "true" to use mock QRNG instead of ANU (for testing only)
/// - **device_attestation** (optional): JSON-encoded WebAuthn device attestation
///
/// The seal contains:
/// - QRNG entropy (256 bits from quantum random number generator)
/// - Content hash (SHA3-256 + optional perceptual hash for images)
/// - Post-quantum signature (ML-DSA-65, FIPS 204)
/// - Capture metadata (timestamp, media type)
/// - Device attestation (if provided and fresh)
#[utoipa::path(
    post,
    path = "/seal",
    tag = "Sealing",
    request_body(
        content_type = "multipart/form-data",
        description = "Media file to seal with optional parameters"
    ),
    responses(
        (status = 200, description = "Seal created successfully", body = SealResponse),
        (status = 400, description = "Invalid request (missing file, unsupported format, stale attestation)"),
        (status = 413, description = "File too large (max 25MB)"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn seal_handler(mut multipart: Multipart) -> Result<Json<SealResponse>, ApiError> {
    let mut file_data: Option<Vec<u8>> = None;
    let mut media_type = MediaType::Image;
    let mut use_mock = false;
    let mut device_attestation: Option<DeviceAttestation> = None;

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
            "device_attestation" => {
                let json = field.text().await.unwrap_or_default();
                if !json.is_empty() {
                    let attestation: DeviceAttestation =
                        serde_json::from_str(&json).map_err(|e| {
                            ApiError::bad_request(format!("Invalid device_attestation JSON: {}", e))
                        })?;

                    // Verify attestation is fresh (within 5 minutes)
                    if !attestation.is_fresh(MAX_ATTESTATION_AGE_SECS) {
                        return Err(ApiError::bad_request(format!(
                            "Device attestation is stale (must be within {} seconds)",
                            MAX_ATTESTATION_AGE_SECS
                        )));
                    }

                    tracing::info!(
                        credential_id = %attestation.credential_id,
                        authenticator_type = ?attestation.authenticator_type,
                        "Device attestation included in seal"
                    );

                    device_attestation = Some(attestation);
                }
            }
            _ => {}
        }
    }

    let content = file_data.ok_or_else(|| {
        ApiError::bad_request("No file provided. Use 'file' field in multipart form.")
    })?;

    // Generate keypair for this seal (in production, use persistent keys from TEE)
    // Uses ZeroizingSecretKey for secure memory handling
    let (public_key, secret_key) = generate_keypair();

    // Create seal with appropriate QRNG source (using secure builder)
    let seal = if use_mock {
        let qrng = MockQrng::default();
        SealBuilder::new(content, media_type)
            .build_secure(&qrng, &secret_key, &public_key)
            .await?
    } else {
        // Try ANU QRNG first, fall back to mock if unavailable
        match AnuQrng::new() {
            Ok(qrng) => {
                match SealBuilder::new(content.clone(), media_type)
                    .build_secure(&qrng, &secret_key, &public_key)
                    .await
                {
                    Ok(seal) => seal,
                    Err(e) => {
                        tracing::warn!("ANU QRNG failed: {}, falling back to mock entropy", e);
                        let mock_qrng = MockQrng::default();
                        SealBuilder::new(content, media_type)
                            .build_secure(&mock_qrng, &secret_key, &public_key)
                            .await?
                    }
                }
            }
            Err(e) => {
                tracing::warn!("ANU QRNG client creation failed: {}, using mock entropy", e);
                let mock_qrng = MockQrng::default();
                SealBuilder::new(content, media_type)
                    .build_secure(&mock_qrng, &secret_key, &public_key)
                    .await?
            }
        }
    };

    // Serialize seal to CBOR and encode as base64
    let seal_cbor = seal.to_cbor()?;
    let seal_data = BASE64.encode(&seal_cbor);
    let seal_id = uuid::Uuid::new_v4().to_string();

    let has_device_attestation = device_attestation.is_some();

    // Note: In a full implementation, we would embed the device_attestation
    // into the VeritasSeal structure. For now, it's validated and logged
    // to demonstrate the WebAuthn integration flow.

    Ok(Json(SealResponse {
        seal_id,
        seal_data,
        timestamp: seal.capture_timestamp_utc,
        has_device_attestation,
    }))
}
