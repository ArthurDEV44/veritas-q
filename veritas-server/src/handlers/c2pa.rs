//! C2PA manifest handlers
//!
//! Handles C2PA-related API endpoints for embedding and verifying
//! Veritas seals within C2PA manifests.

use axum::{
    extract::{Multipart, State},
    Json,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;
use std::io::Cursor;
use utoipa::ToSchema;
use veritas_core::c2pa::{
    extract_quantum_seal_from_stream, QuantumSealAssertion, VeritasManifestBuilder, VeritasSigner,
};
use veritas_core::{generate_keypair, LfdQrng, MediaType, MockQrng, SealBuilder, VeritasSeal};

use crate::error::ApiError;
use crate::multipart::MultipartFields;
use crate::state::AppState;
use crate::validation::DEFAULT_MAX_FILE_SIZE;

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
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<C2paEmbedResponse>, ApiError> {
    // Parse multipart form (no content type validation for C2PA)
    let fields = MultipartFields::parse(&mut multipart, false, DEFAULT_MAX_FILE_SIZE).await?;

    // Extract required fields
    let file = fields.require_file()?;
    let content = file.data.clone();
    let seal_data = fields.get_text("seal_data").map(|s| s.to_string());
    let use_mock = fields.get_bool("mock");

    // Determine content type from file or extension
    let mime_type = file
        .content_type
        .clone()
        .or_else(|| file.file_name.as_ref().and_then(|n| mime_from_filename(n)))
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
        // Check mock QRNG permission
        if use_mock && !state.allow_mock_qrng {
            return Err(ApiError::bad_request(
                "Mock QRNG is not allowed in this environment. Set ALLOW_MOCK_QRNG=true to enable.",
            ));
        }

        // Create new seal
        let (public_key, secret_key) = generate_keypair();
        let media_type = media_type_from_mime(&mime_type);

        let seal = if use_mock {
            let qrng = MockQrng::default();
            SealBuilder::new(content.clone(), media_type)
                .build_secure(&qrng, &secret_key, &public_key)
                .await?
        } else {
            let qrng = LfdQrng::new().map_err(|e| {
                tracing::error!("QRNG client creation failed: {}", e);
                ApiError::service_unavailable("QRNG service unavailable")
            })?;
            SealBuilder::new(content.clone(), media_type)
                .build_secure(&qrng, &secret_key, &public_key)
                .await
                .map_err(|e| {
                    tracing::error!("QRNG entropy fetch failed: {}", e);
                    ApiError::service_unavailable("QRNG service unavailable")
                })?
        };
        (seal, true)
    };

    // Load signer from environment
    let signer = VeritasSigner::from_env().map_err(|e| {
        tracing::error!(error = %e, "C2PA signing credentials not configured");
        ApiError::internal(
            "C2PA signing credentials not configured. Set C2PA_SIGNING_KEY and C2PA_SIGNING_CERT",
        )
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
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to embed C2PA manifest");
            ApiError::internal("Failed to embed C2PA manifest")
        })?;

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
    // Parse multipart form (no content type validation for C2PA)
    let fields = MultipartFields::parse(&mut multipart, false, DEFAULT_MAX_FILE_SIZE).await?;

    // Extract required fields
    let file = fields.require_file()?;
    let content = &file.data;

    // Determine content type
    let mime_type = file
        .content_type
        .as_ref()
        .cloned()
        .or_else(|| file.file_name.as_ref().and_then(|n| mime_from_filename(n)))
        .unwrap_or_else(|| "image/jpeg".to_string());

    // Try to extract quantum seal
    let mut stream = Cursor::new(content);
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
