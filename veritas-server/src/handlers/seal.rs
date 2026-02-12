//! Seal creation handler
//!
//! Handles POST /seal requests to create quantum-authenticated seals for media content.

use std::io::Cursor;

use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    Json,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use veritas_core::{
    c2pa::{VeritasManifestBuilder, VeritasSigner},
    generate_keypair,
    qrng::{QrngProviderConfig, QrngProviderFactory},
    MediaType, MockQrng, SealBuilder, VeritasSeal,
};

use crate::auth::OptionalAuth;
use crate::db::{CreateSeal, SealLocation, SealMetadata, TrustTier};
use crate::error::ApiError;
use crate::manifest_store::ManifestInput;
use crate::multipart::MultipartFields;
use crate::state::AppState;
use crate::validation::DEFAULT_MAX_FILE_SIZE;
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
    /// Perceptual hash for soft binding (hex-encoded, images only)
    /// Used to identify similar images even after compression, resizing, or cropping
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(example = "a1b2c3d4e5f67890")]
    pub perceptual_hash: Option<String>,
    /// Base64-encoded image with embedded C2PA manifest (when embed_c2pa=true)
    /// Contains the original image plus the Veritas quantum seal as a C2PA assertion
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sealed_image: Option<String>,
    /// Size of the C2PA manifest in bytes (when embed_c2pa=true)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest_size: Option<usize>,
    /// User ID who created the seal (if authenticated)
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub user_id: Option<String>,
    /// Trust tier of the seal
    #[schema(example = "tier1")]
    pub trust_tier: String,
    /// QRNG source used for entropy
    #[schema(example = "lfd")]
    pub qrng_source: String,
}

/// Location data included with seal request
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct LocationInput {
    /// Latitude
    #[schema(example = 48.8566)]
    pub lat: f64,
    /// Longitude
    #[schema(example = 2.3522)]
    pub lng: f64,
    /// Altitude in meters (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(example = 35.0)]
    pub altitude: Option<f64>,
}

/// Maximum age for device attestation to be considered fresh (5 minutes)
const MAX_ATTESTATION_AGE_SECS: u64 = 300;

/// Parameters for persisting a seal to the database
struct PersistSealParams<'a> {
    seal_id: Uuid,
    user_id: Option<Uuid>,
    user_trust_tier: TrustTier,
    seal: &'a VeritasSeal,
    seal_cbor: &'a [u8],
    media_type: MediaType,
    content_type_hint: Option<String>,
    file_size: Option<usize>,
    location: Option<LocationInput>,
    has_device_attestation: bool,
    embed_c2pa: bool,
    qrng_source_name: &'a str,
}

/// Create a seal with the appropriate QRNG provider
///
/// Handles QRNG selection, keypair generation, seal building, and CBOR serialization.
///
/// # Arguments
/// * `content` - The media content to seal
/// * `media_type` - The type of media (Image, Video, Audio)
/// * `use_mock` - Whether to use mock QRNG instead of real quantum source
/// * `allow_mock_qrng` - Server configuration: whether mock QRNG is allowed
///
/// # Returns
/// Tuple of (seal, CBOR-encoded seal bytes)
async fn create_seal_with_provider(
    content: Vec<u8>,
    media_type: MediaType,
    use_mock: bool,
    allow_mock_qrng: bool,
) -> Result<(VeritasSeal, Vec<u8>), ApiError> {
    // Generate keypair for this seal (in production, use persistent keys from TEE)
    // Uses ZeroizingSecretKey for secure memory handling
    let (public_key, secret_key) = generate_keypair();

    // Check mock QRNG permission
    if use_mock && !allow_mock_qrng {
        return Err(ApiError::bad_request(
            "Mock QRNG is not allowed in this environment. Set ALLOW_MOCK_QRNG=true to enable.",
        ));
    }

    // Create seal with appropriate QRNG source
    let seal = if use_mock {
        let qrng = MockQrng::default();
        SealBuilder::new(content, media_type)
            .build_secure(&qrng, &secret_key, &public_key)
            .await?
    } else {
        let provider = QrngProviderFactory::create(QrngProviderConfig::Auto).map_err(|e| {
            tracing::error!("QRNG provider creation failed: {}", e);
            ApiError::service_unavailable("QRNG service unavailable")
        })?;
        SealBuilder::new(content, media_type)
            .build_secure(&*provider, &secret_key, &public_key)
            .await
            .map_err(|e| {
                tracing::error!("QRNG entropy fetch failed: {}", e);
                ApiError::service_unavailable("QRNG service unavailable")
            })?
    };

    // Serialize seal to CBOR
    let seal_cbor = seal.to_cbor()?;

    Ok((seal, seal_cbor))
}

/// Persist seal and manifest to database
///
/// Stores seal metadata and perceptual hash in the seal repository and manifest store.
/// Errors are logged but not propagated (non-fatal).
async fn persist_seal(state: &AppState, params: PersistSealParams<'_>) {
    let perceptual_hash = params.seal.content_hash.perceptual_hash.clone();

    // Store manifest in database if manifest store is configured
    if let Some(ref store) = state.manifest_store {
        let input = ManifestInput {
            seal_id: params.seal_id.to_string(),
            perceptual_hash: perceptual_hash.clone(),
            image_hash: hex::encode(params.seal.content_hash.crypto_hash),
            seal_cbor: params.seal_cbor.to_vec(),
            media_type: format!("{:?}", params.media_type).to_lowercase(),
        };

        if let Err(e) = store.store(&input).await {
            // Log error but don't fail the request - sealing succeeded
            tracing::warn!(
                seal_id = %params.seal_id,
                error = %e,
                "Failed to store manifest in database"
            );
        } else {
            tracing::debug!(seal_id = %params.seal_id, "Manifest stored in database");
        }
    }

    // Store seal in database if authenticated and seal_repo is available
    if let (Some(uid), Some(ref seal_repo)) = (params.user_id, &state.seal_repo) {
        // Build metadata JSON
        let metadata = SealMetadata {
            timestamp: Utc::now().to_rfc3339(),
            location: params.location.map(|l| SealLocation {
                lat: l.lat,
                lng: l.lng,
                altitude: l.altitude,
            }),
            device: None, // Could be populated from User-Agent header
            capture_source: "camera".to_string(),
            has_device_attestation: params.has_device_attestation,
        };

        let create_seal = CreateSeal {
            user_id: Some(uid),
            organization_id: None,
            content_hash: hex::encode(params.seal.content_hash.crypto_hash),
            perceptual_hash: perceptual_hash.clone(),
            qrng_entropy: params.seal.qrng_entropy.to_vec(),
            qrng_source: params.qrng_source_name.to_string(),
            signature: params.seal.signature.clone(),
            public_key: params.seal.public_key.clone(),
            media_type: format!("{:?}", params.media_type).to_lowercase(),
            file_size: params.file_size.map(|s| s as i32),
            mime_type: params.content_type_hint.clone(),
            metadata: serde_json::to_value(&metadata).unwrap_or_default(),
            trust_tier: params.user_trust_tier,
            c2pa_manifest_embedded: params.embed_c2pa,
            captured_at: Utc::now(),
        };

        match seal_repo.create(create_seal).await {
            Ok(stored_seal) => {
                tracing::info!(
                    seal_id = %stored_seal.id,
                    user_id = %uid,
                    "Seal stored in database with user association"
                );
            }
            Err(e) => {
                // Log error but don't fail - the cryptographic seal succeeded
                tracing::error!(
                    seal_id = %params.seal_id,
                    user_id = %uid,
                    error = %e,
                    "Failed to store seal in database"
                );
            }
        }
    }
}

/// Embed C2PA manifest in content if applicable
///
/// Attempts to embed the Veritas seal as a C2PA manifest if signing credentials are available.
/// Returns (base64-encoded sealed image, manifest size) or (None, None) if embedding fails.
fn embed_c2pa_if_applicable(
    content: Vec<u8>,
    seal: VeritasSeal,
    media_type: MediaType,
    content_type: Option<String>,
    seal_id: Uuid,
) -> (Option<String>, Option<usize>) {
    // Determine MIME type for C2PA embedding
    let mime_type = content_type.as_deref().unwrap_or(match media_type {
        MediaType::Image => "image/jpeg",
        MediaType::Video => "video/mp4",
        MediaType::Audio => "audio/mpeg",
    });

    match VeritasSigner::from_env() {
        Ok(signer) => {
            let builder = VeritasManifestBuilder::new(seal.clone());
            let mut input = Cursor::new(content.clone());
            let mut output = Cursor::new(Vec::new());

            match builder.embed_in_stream(mime_type, &mut input, &mut output, signer) {
                Ok(()) => {
                    let embedded = output.into_inner();
                    let size = embedded.len().saturating_sub(content.len());
                    tracing::debug!(
                        seal_id = %seal_id,
                        manifest_size = size,
                        "C2PA manifest embedded successfully"
                    );
                    (Some(BASE64.encode(&embedded)), Some(size))
                }
                Err(e) => {
                    tracing::warn!(
                        seal_id = %seal_id,
                        error = %e,
                        "Failed to embed C2PA manifest, returning seal without embedded image"
                    );
                    (None, None)
                }
            }
        }
        Err(e) => {
            tracing::debug!(
                error = %e,
                "C2PA signing credentials not available, skipping manifest embedding"
            );
            (None, None)
        }
    }
}

/// Create a quantum-authenticated seal for uploaded content
///
/// Accepts multipart/form-data with:
/// - **file** (required): The media file to seal (max 25MB)
/// - **media_type** (optional): "image", "video", "audio", or "generic" (default: "image")
/// - **mock** (optional): "true" to use mock QRNG instead of ANU (for testing only)
/// - **device_attestation** (optional): JSON-encoded WebAuthn device attestation
/// - **embed_c2pa** (optional): "true" (default) to embed C2PA manifest in response, "false" to skip
/// - **location** (optional): JSON-encoded GPS location {lat, lng, altitude?}
///
/// Authentication (optional):
/// - Pass `Authorization: Bearer <token>` header to link seal to authenticated user
/// - If authenticated, seal is stored in database with user association
///
/// The seal contains:
/// - QRNG entropy (256 bits from quantum random number generator)
/// - Content hash (SHA3-256 + optional perceptual hash for images)
/// - Post-quantum signature (ML-DSA-65, FIPS 204)
/// - Capture metadata (timestamp, media type, location, device)
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
        (status = 201, description = "Seal created successfully", body = SealResponse),
        (status = 400, description = "Invalid request (missing file, unsupported format, stale attestation)"),
        (status = 413, description = "File too large (max 25MB)"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn seal_handler(
    State(state): State<AppState>,
    OptionalAuth(auth): OptionalAuth,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<SealResponse>), ApiError> {
    // Parse multipart form
    let fields = MultipartFields::parse(&mut multipart, true, DEFAULT_MAX_FILE_SIZE).await?;

    // Extract required and optional fields
    let file = fields.require_file()?;
    let content = file.data.clone();
    let content_type_hint = file.content_type.clone();
    let file_size = file.data.len();

    let media_type = fields
        .get_text("media_type")
        .map(|s| match s.to_lowercase().as_str() {
            "video" => MediaType::Video,
            "audio" => MediaType::Audio,
            _ => MediaType::Image,
        })
        .unwrap_or(MediaType::Image);

    let use_mock = fields.get_bool("mock");
    let embed_c2pa = fields.get_text("embed_c2pa") != Some("false");
    let device_attestation: Option<DeviceAttestation> = fields.get_json("device_attestation")?;
    let location: Option<LocationInput> = fields.get_json("location")?;

    // Extract user info from JWT auth (optional — anonymous seals are allowed)
    let (user_id, user_trust_tier) = match &auth {
        Some(auth_user) => {
            tracing::info!(
                clerk_user_id = %auth_user.clerk_user_id,
                user_id = %auth_user.user.id,
                "Authenticated seal request"
            );
            (Some(auth_user.user.id), auth_user.user.tier)
        }
        None => (None, TrustTier::default()),
    };

    // Validate device attestation freshness
    if let Some(ref attestation) = device_attestation {
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
    }

    if let Some(ref loc) = location {
        tracing::debug!(location = ?loc, "Location data included");
    }

    // Create seal with QRNG provider
    let (seal, seal_cbor) =
        create_seal_with_provider(content.clone(), media_type, use_mock, state.allow_mock_qrng)
            .await?;

    // Generate seal ID and encode
    let seal_id = Uuid::new_v4();
    let seal_data = BASE64.encode(&seal_cbor);
    let has_device_attestation = device_attestation.is_some();
    let perceptual_hash_hex = seal.content_hash.perceptual_hash.as_ref().map(hex::encode);

    // Determine QRNG source name
    let qrng_source_name = match seal.qrng_source {
        veritas_core::QrngSource::LfdCloud => "lfd",
        veritas_core::QrngSource::AnuCloud => "anu",
        veritas_core::QrngSource::IdQuantiqueCloud => "idq",
        veritas_core::QrngSource::Mock => "mock",
        veritas_core::QrngSource::DeviceHardware { .. } => "hardware",
    };

    // Persist seal and manifest to database (non-fatal)
    persist_seal(
        &state,
        PersistSealParams {
            seal_id,
            user_id,
            user_trust_tier,
            seal: &seal,
            seal_cbor: &seal_cbor,
            media_type,
            content_type_hint: content_type_hint.clone(),
            file_size: Some(file_size),
            location,
            has_device_attestation,
            embed_c2pa,
            qrng_source_name,
        },
    )
    .await;

    // Embed C2PA manifest if requested
    let (sealed_image, manifest_size) = if embed_c2pa {
        embed_c2pa_if_applicable(
            content,
            seal.clone(),
            media_type,
            content_type_hint,
            seal_id,
        )
    } else {
        (None, None)
    };

    // Format trust tier for response
    let trust_tier_str = match user_trust_tier {
        TrustTier::Tier1 => "tier1",
        TrustTier::Tier2 => "tier2",
        TrustTier::Tier3 => "tier3",
    };

    Ok((
        StatusCode::CREATED,
        Json(SealResponse {
            seal_id: seal_id.to_string(),
            seal_data,
            timestamp: seal.capture_timestamp_utc,
            has_device_attestation,
            perceptual_hash: perceptual_hash_hex,
            sealed_image,
            manifest_size,
            user_id: user_id.map(|u| u.to_string()),
            trust_tier: trust_tier_str.to_string(),
            qrng_source: qrng_source_name.to_string(),
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_seal_with_mock_provider() {
        let content = b"test image content".to_vec();
        let media_type = MediaType::Image;

        let result = create_seal_with_provider(content.clone(), media_type, true, true).await;

        assert!(result.is_ok());
        let (seal, seal_cbor) = result.unwrap();

        // Verify seal properties
        assert_eq!(seal.qrng_source, veritas_core::QrngSource::Mock);
        assert_eq!(seal.media_type, media_type);
        assert!(!seal_cbor.is_empty());

        // Verify seal can be deserialized
        let deserialized = VeritasSeal::from_cbor(&seal_cbor);
        assert!(deserialized.is_ok());
    }

    #[tokio::test]
    async fn test_create_seal_mock_not_allowed() {
        let content = b"test image content".to_vec();
        let media_type = MediaType::Image;

        let result = create_seal_with_provider(content, media_type, true, false).await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, ApiError::BadRequest(_)));
    }

    #[tokio::test]
    async fn test_embed_c2pa_without_credentials() {
        // Create a real seal using mock QRNG
        let content = b"test image content".to_vec();
        let media_type = MediaType::Image;
        let (seal, _) = create_seal_with_provider(content.clone(), media_type, true, true)
            .await
            .unwrap();

        let seal_id = Uuid::new_v4();

        // Without C2PA signing credentials configured, embedding should return None
        let (sealed_image, manifest_size) = embed_c2pa_if_applicable(
            content,
            seal,
            media_type,
            Some("image/jpeg".to_string()),
            seal_id,
        );

        // Should return None when credentials are not configured
        assert!(sealed_image.is_none());
        assert!(manifest_size.is_none());
    }
}
