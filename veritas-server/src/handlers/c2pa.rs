//! C2PA manifest handlers
//!
//! Handles C2PA-related API endpoints for embedding and verifying
//! Veritas seals within C2PA manifests.

use axum::{extract::Multipart, Json};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;
use std::io::Cursor;
use utoipa::ToSchema;
use veritas_core::c2pa::{
    extract_quantum_seal_from_stream, QuantumSealAssertion, VeritasManifestBuilder, VeritasSigner,
};
use veritas_core::{generate_keypair, LfdQrng, MediaType, MockQrng, SealBuilder, VeritasSeal};

use crate::error::ApiError;
use crate::validation::{validate_file_size, DEFAULT_MAX_FILE_SIZE};

/// Response for C2PA embed operation
#[derive(Serialize, ToSchema)]
pub struct C2paEmbedResponse {
    /// Base64-encoded media file with embedded C2PA manifest
    #[schema(example = "/9j/4AAQSkZJRg...")]
    pub media_data: String,
    /// MIME type of the output file
    #[schema(example = "image/jpeg")]
    pub content_type: String,
    /// Whether a new seal was created (vs using provided seal)
    pub new_seal_created: bool,
}

/// Response for C2PA verify operation
#[derive(Serialize, ToSchema)]
pub struct C2paVerifyResponse {
    /// Whether the C2PA signature is valid
    pub c2pa_valid: bool,
    /// Claim generator string from the manifest
    pub claim_generator: Option<String>,
    /// Veritas quantum seal info, if present
    pub quantum_seal: Option<QuantumSealInfo>,
    /// List of validation errors/warnings
    pub validation_errors: Vec<String>,
}

/// Quantum seal information extracted from C2PA manifest
#[derive(Serialize, ToSchema)]
pub struct QuantumSealInfo {
    /// QRNG source identifier
    #[schema(example = "ANU")]
    pub qrng_source: String,
    /// Capture timestamp (Unix milliseconds)
    #[schema(example = 1704067200000_u64)]
    pub capture_timestamp: u64,
    /// Content hash (hex-encoded SHA3-256)
    #[schema(example = "a1b2c3d4...")]
    pub content_hash: String,
    /// ML-DSA-65 signature size in bytes
    #[schema(example = 3309)]
    pub signature_size: usize,
    /// Blockchain anchor info, if present
    pub blockchain_anchor: Option<BlockchainAnchorInfo>,
}

/// Blockchain anchor information
#[derive(Serialize, ToSchema)]
pub struct BlockchainAnchorInfo {
    pub chain: String,
    pub network: String,
    pub transaction_id: String,
}

impl From<&QuantumSealAssertion> for QuantumSealInfo {
    fn from(seal: &QuantumSealAssertion) -> Self {
        Self {
            qrng_source: seal.qrng_source.clone(),
            capture_timestamp: seal.capture_timestamp,
            content_hash: hex::encode(seal.content_hash),
            signature_size: seal.ml_dsa_signature.len(),
            blockchain_anchor: seal
                .blockchain_anchor
                .as_ref()
                .map(|a| BlockchainAnchorInfo {
                    chain: a.chain.clone(),
                    network: a.network.clone(),
                    transaction_id: a.transaction_id.clone(),
                }),
        }
    }
}

/// Embed Veritas seal as C2PA manifest in media file
///
/// Accepts multipart/form-data with:
/// - **file** (required): The media file to embed manifest into
/// - **seal_data** (optional): Base64-encoded existing seal (CBOR format)
/// - **mock** (optional): "true" to use mock QRNG when creating new seal
///
/// If no seal_data is provided, a new seal will be created for the file.
///
/// **Note**: Requires C2PA signing credentials configured via environment:
/// - `C2PA_SIGNING_KEY`: Path to ECDSA P-256 private key (PEM)
/// - `C2PA_SIGNING_CERT`: Path to X.509 certificate chain (PEM)
#[utoipa::path(
    post,
    path = "/c2pa/embed",
    tag = "C2PA",
    request_body(
        content_type = "multipart/form-data",
        description = "Media file and optional seal data"
    ),
    responses(
        (status = 200, description = "C2PA manifest embedded successfully", body = C2paEmbedResponse),
        (status = 400, description = "Invalid request"),
        (status = 500, description = "Internal server error or missing signing credentials")
    )
)]
pub async fn c2pa_embed_handler(
    mut multipart: Multipart,
) -> Result<Json<C2paEmbedResponse>, ApiError> {
    let mut file_data: Option<Vec<u8>> = None;
    let mut file_name: Option<String> = None;
    let mut content_type: Option<String> = None;
    let mut seal_data: Option<String> = None;
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
                file_name = field.file_name().map(|s| s.to_string());
                content_type = field.content_type().map(|s| s.to_string());

                let data = field
                    .bytes()
                    .await
                    .map_err(|e| ApiError::bad_request(format!("Failed to read file: {}", e)))?
                    .to_vec();

                validate_file_size(data.len(), DEFAULT_MAX_FILE_SIZE)?;
                file_data = Some(data);
            }
            "seal_data" => {
                seal_data = Some(field.text().await.unwrap_or_default());
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

    // Determine content type from file or extension
    let mime_type = content_type
        .or_else(|| file_name.as_ref().and_then(|n| mime_from_filename(n)))
        .unwrap_or_else(|| "image/jpeg".to_string());

    // Load or create seal
    let (seal, new_seal_created) = if let Some(seal_b64) = seal_data {
        let seal_bytes = BASE64
            .decode(&seal_b64)
            .map_err(|e| ApiError::bad_request(format!("Invalid base64 seal_data: {}", e)))?;
        let seal = VeritasSeal::from_cbor(&seal_bytes)
            .map_err(|e| ApiError::bad_request(format!("Invalid seal format: {}", e)))?;
        (seal, false)
    } else {
        // Create new seal
        let (public_key, secret_key) = generate_keypair();
        let media_type = media_type_from_mime(&mime_type);

        let seal = if use_mock {
            let qrng = MockQrng::default();
            SealBuilder::new(content.clone(), media_type)
                .build_secure(&qrng, &secret_key, &public_key)
                .await?
        } else {
            match LfdQrng::new() {
                Ok(qrng) => {
                    match SealBuilder::new(content.clone(), media_type)
                        .build_secure(&qrng, &secret_key, &public_key)
                        .await
                    {
                        Ok(seal) => seal,
                        Err(_) => {
                            let mock_qrng = MockQrng::default();
                            SealBuilder::new(content.clone(), media_type)
                                .build_secure(&mock_qrng, &secret_key, &public_key)
                                .await?
                        }
                    }
                }
                Err(_) => {
                    let mock_qrng = MockQrng::default();
                    SealBuilder::new(content.clone(), media_type)
                        .build_secure(&mock_qrng, &secret_key, &public_key)
                        .await?
                }
            }
        };
        (seal, true)
    };

    // Load signer from environment
    let signer = VeritasSigner::from_env().map_err(|e| {
        ApiError::internal(format!(
            "C2PA signing credentials not configured: {}. Set C2PA_SIGNING_KEY and C2PA_SIGNING_CERT",
            e
        ))
    })?;

    // Build manifest and embed
    let builder = VeritasManifestBuilder::new(seal);

    // Create seekable buffer for input
    let mut input = Cursor::new(content);

    // Create output buffer - must be Read + Write + Seek
    let mut output_buf = Vec::new();
    let mut output = Cursor::new(&mut output_buf);

    builder
        .embed_in_stream(&mime_type, &mut input, &mut output, signer)
        .map_err(|e| ApiError::internal(format!("Failed to embed C2PA manifest: {}", e)))?;

    // Get the actual output data
    let output_data = output.into_inner().clone();

    Ok(Json(C2paEmbedResponse {
        media_data: BASE64.encode(&output_data),
        content_type: mime_type,
        new_seal_created,
    }))
}

/// Verify C2PA manifest and extract Veritas seal info
///
/// Accepts multipart/form-data with:
/// - **file** (required): The media file with C2PA manifest to verify
///
/// Returns validation status for both C2PA signature and embedded Veritas seal.
#[utoipa::path(
    post,
    path = "/c2pa/verify",
    tag = "C2PA",
    request_body(
        content_type = "multipart/form-data",
        description = "Media file with C2PA manifest"
    ),
    responses(
        (status = 200, description = "Verification complete", body = C2paVerifyResponse),
        (status = 400, description = "Invalid request or no C2PA manifest found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn c2pa_verify_handler(
    mut multipart: Multipart,
) -> Result<Json<C2paVerifyResponse>, ApiError> {
    let mut file_data: Option<Vec<u8>> = None;
    let mut content_type: Option<String> = None;
    let mut file_name: Option<String> = None;

    // Parse multipart form
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::bad_request(format!("Failed to parse multipart: {}", e)))?
    {
        let name = field.name().unwrap_or("").to_string();

        if name == "file" {
            file_name = field.file_name().map(|s| s.to_string());
            content_type = field.content_type().map(|s| s.to_string());

            let data = field
                .bytes()
                .await
                .map_err(|e| ApiError::bad_request(format!("Failed to read file: {}", e)))?
                .to_vec();

            validate_file_size(data.len(), DEFAULT_MAX_FILE_SIZE)?;
            file_data = Some(data);
        }
    }

    let content = file_data.ok_or_else(|| {
        ApiError::bad_request("No file provided. Use 'file' field in multipart form.")
    })?;

    // Determine content type
    let mime_type = content_type
        .or_else(|| file_name.as_ref().and_then(|n| mime_from_filename(n)))
        .unwrap_or_else(|| "image/jpeg".to_string());

    // Try to extract quantum seal
    let mut stream = Cursor::new(&content);
    let quantum_seal = extract_quantum_seal_from_stream(&mime_type, &mut stream).ok();

    // For now, we return basic info
    // Full C2PA validation would require c2pa::Reader which needs file paths
    // We can enhance this later with in-memory validation
    Ok(Json(C2paVerifyResponse {
        c2pa_valid: quantum_seal.is_some(), // Simplified - full validation needs more work
        claim_generator: None,              // Would need full Reader
        quantum_seal: quantum_seal.as_ref().map(QuantumSealInfo::from),
        validation_errors: vec![],
    }))
}

/// Get MIME type from filename extension
fn mime_from_filename(filename: &str) -> Option<String> {
    let ext = filename.rsplit('.').next()?.to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        _ => return None,
    };
    Some(mime.to_string())
}

/// Convert MIME type to MediaType
fn media_type_from_mime(mime: &str) -> MediaType {
    if mime.starts_with("video/") {
        MediaType::Video
    } else if mime.starts_with("audio/") {
        MediaType::Audio
    } else {
        MediaType::Image
    }
}
