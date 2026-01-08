//! User seals handlers
//!
//! Handles listing, retrieving, and exporting seals for authenticated users.

use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    Json,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::db::{SealListParams, SealListResponse, SealRecord, TrustTier};
use crate::error::ApiError;
use crate::handlers::AppState;

/// Query parameters for listing seals
#[derive(Debug, Deserialize, IntoParams)]
pub struct ListSealsQuery {
    /// Page number (1-indexed)
    #[param(default = 1, minimum = 1)]
    pub page: Option<i64>,

    /// Items per page (max 100)
    #[param(default = 20, minimum = 1, maximum = 100)]
    pub limit: Option<i64>,

    /// Filter by media type (image, video, audio)
    pub media_type: Option<String>,

    /// Filter by seals with GPS location
    pub has_location: Option<bool>,
}

impl From<ListSealsQuery> for SealListParams {
    fn from(query: ListSealsQuery) -> Self {
        Self {
            page: query.page.unwrap_or(1),
            limit: query.limit.unwrap_or(20),
            media_type: query.media_type,
            has_location: query.has_location,
        }
    }
}

/// Response for seal detail
#[derive(Debug, Serialize, ToSchema)]
pub struct SealDetailResponse {
    /// The seal record
    pub seal: SealRecord,
    /// Hex-encoded signature for verification
    pub signature: String,
    /// Hex-encoded public key
    pub public_key: String,
    /// Hex-encoded QRNG entropy
    pub qrng_entropy: String,
    /// QRNG source
    pub qrng_source: String,
}

/// List seals for authenticated user
///
/// Returns a paginated list of seals created by the authenticated user,
/// sorted by creation date (newest first).
#[utoipa::path(
    get,
    path = "/api/v1/seals",
    tag = "Seals",
    params(ListSealsQuery),
    responses(
        (status = 200, description = "List of user's seals", body = SealListResponse),
        (status = 401, description = "Unauthorized"),
        (status = 503, description = "Database not available")
    ),
    security(
        ("clerk_token" = [])
    )
)]
pub async fn list_user_seals_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListSealsQuery>,
) -> Result<Json<SealListResponse>, ApiError> {
    // Get clerk_user_id from header
    let clerk_user_id = headers
        .get("x-clerk-user-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| ApiError::unauthorized("Missing x-clerk-user-id header"))?;

    // Get repositories
    let user_repo = state
        .user_repo
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("Database not configured"))?;

    let seal_repo = state
        .seal_repo
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("Database not configured"))?;

    // Find user to get internal ID
    let user = user_repo
        .find_by_clerk_id(clerk_user_id)
        .await
        .map_err(|e| ApiError::internal(format!("Database error: {}", e)))?
        .ok_or_else(|| ApiError::not_found("User not found"))?;

    // Get seals
    let params = SealListParams::from(query);
    let response = seal_repo
        .list_for_user(user.id, &params)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to list seals: {}", e)))?;

    Ok(Json(response))
}

/// Get seal detail for authenticated user
///
/// Returns detailed information about a specific seal owned by the user.
#[utoipa::path(
    get,
    path = "/api/v1/seals/{seal_id}",
    tag = "Seals",
    params(
        ("seal_id" = String, Path, description = "Seal ID (UUID)")
    ),
    responses(
        (status = 200, description = "Seal details", body = SealDetailResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Seal not found"),
        (status = 503, description = "Database not available")
    ),
    security(
        ("clerk_token" = [])
    )
)]
pub async fn get_user_seal_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(seal_id): Path<Uuid>,
) -> Result<Json<SealDetailResponse>, ApiError> {
    // Get clerk_user_id from header
    let clerk_user_id = headers
        .get("x-clerk-user-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| ApiError::unauthorized("Missing x-clerk-user-id header"))?;

    // Get repositories
    let user_repo = state
        .user_repo
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("Database not configured"))?;

    let seal_repo = state
        .seal_repo
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("Database not configured"))?;

    // Find user to get internal ID
    let user = user_repo
        .find_by_clerk_id(clerk_user_id)
        .await
        .map_err(|e| ApiError::internal(format!("Database error: {}", e)))?
        .ok_or_else(|| ApiError::not_found("User not found"))?;

    // Get seal (restricted to user's seals)
    let seal = seal_repo
        .find_by_id_for_user(seal_id, user.id)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to get seal: {}", e)))?
        .ok_or_else(|| ApiError::not_found("Seal not found"))?;

    Ok(Json(SealDetailResponse {
        seal: SealRecord::from(seal.clone()),
        signature: hex::encode(&seal.signature),
        public_key: hex::encode(&seal.public_key),
        qrng_entropy: hex::encode(&seal.qrng_entropy),
        qrng_source: seal.qrng_source,
    }))
}

/// Export format options
#[derive(Debug, Clone, Copy, Default, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    /// JSON format with all seal metadata
    #[default]
    Json,
    /// C2PA JUMBF manifest format
    C2pa,
}

impl std::fmt::Display for ExportFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExportFormat::Json => write!(f, "json"),
            ExportFormat::C2pa => write!(f, "c2pa"),
        }
    }
}

/// Query parameters for seal export
#[derive(Debug, Deserialize, IntoParams)]
pub struct ExportSealQuery {
    /// Export format (json, c2pa)
    #[param(default = "json")]
    pub format: Option<ExportFormat>,
}

/// JSON export response - complete seal data
#[derive(Debug, Serialize, ToSchema)]
pub struct JsonExportResponse {
    /// Export format version
    pub export_version: String,
    /// Seal ID
    #[schema(value_type = String)]
    pub seal_id: Uuid,
    /// Content hash (SHA3-256, hex-encoded)
    pub content_hash: String,
    /// Perceptual hash (hex-encoded, images only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub perceptual_hash: Option<String>,
    /// Media type
    pub media_type: String,
    /// File size in bytes
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size: Option<i32>,
    /// Capture metadata
    pub metadata: serde_json::Value,
    /// Trust tier
    pub trust_tier: TrustTierExport,
    /// Capture timestamp (ISO 8601)
    pub captured_at: String,
    /// Seal creation timestamp (ISO 8601)
    pub created_at: String,
    /// Cryptographic signature (ML-DSA-65, hex-encoded)
    pub signature: String,
    /// Public key (ML-DSA-65, hex-encoded)
    pub public_key: String,
    /// QRNG entropy (hex-encoded)
    pub qrng_entropy: String,
    /// QRNG source identifier
    pub qrng_source: String,
    /// Whether C2PA manifest was embedded at capture
    pub c2pa_manifest_embedded: bool,
    /// Veritas Q export metadata
    pub veritas: VeritasExportMeta,
}

/// Trust tier export info
#[derive(Debug, Serialize, ToSchema)]
pub struct TrustTierExport {
    /// Tier level (1, 2, or 3)
    pub level: i16,
    /// Human-readable label
    pub label: String,
    /// Description of what this tier means
    pub description: String,
}

impl From<TrustTier> for TrustTierExport {
    fn from(tier: TrustTier) -> Self {
        match tier {
            TrustTier::Tier1 => Self {
                level: 1,
                label: "In-App Capture".to_string(),
                description: "Media captured directly in the Veritas Q application".to_string(),
            },
            TrustTier::Tier2 => Self {
                level: 2,
                label: "Verified Reporter".to_string(),
                description: "Media imported by a verified professional reporter".to_string(),
            },
            TrustTier::Tier3 => Self {
                level: 3,
                label: "Hardware Secure".to_string(),
                description: "Media captured with hardware-level security attestation".to_string(),
            },
        }
    }
}

/// Veritas Q export metadata
#[derive(Debug, Serialize, ToSchema)]
pub struct VeritasExportMeta {
    /// Veritas Q version
    pub version: String,
    /// Export timestamp (ISO 8601)
    pub exported_at: String,
    /// Verification URL
    pub verification_url: String,
    /// Signature algorithm used
    pub signature_algorithm: String,
    /// Hash algorithm used
    pub hash_algorithm: String,
}

/// C2PA export response - C2PA manifest JSON
#[derive(Debug, Serialize, ToSchema)]
pub struct C2paExportResponse {
    /// C2PA manifest JSON (compatible with C2PA 2.x spec)
    pub manifest: serde_json::Value,
    /// Veritas quantum seal assertion data
    pub quantum_seal: QuantumSealExport,
    /// Export metadata
    pub export_info: C2paExportInfo,
}

/// Quantum seal data for C2PA export
#[derive(Debug, Serialize, ToSchema)]
pub struct QuantumSealExport {
    /// Assertion label
    pub label: String,
    /// Schema version
    pub version: usize,
    /// QRNG entropy (hex-encoded)
    pub qrng_entropy: String,
    /// QRNG source
    pub qrng_source: String,
    /// Entropy timestamp (Unix ms)
    pub entropy_timestamp: u64,
    /// Capture timestamp (Unix ms)
    pub capture_timestamp: u64,
    /// ML-DSA-65 signature (base64-encoded)
    pub ml_dsa_signature: String,
    /// ML-DSA-65 public key (base64-encoded)
    pub ml_dsa_public_key: String,
    /// Content hash (hex-encoded)
    pub content_hash: String,
    /// Perceptual hash (hex-encoded, optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub perceptual_hash: Option<String>,
}

/// C2PA export info
#[derive(Debug, Serialize, ToSchema)]
pub struct C2paExportInfo {
    /// C2PA specification version
    pub c2pa_version: String,
    /// Claim generator
    pub claim_generator: String,
    /// Export timestamp
    pub exported_at: String,
    /// Note about usage
    pub usage_note: String,
}

/// Export response enum for different formats
#[derive(Debug, Serialize, ToSchema)]
#[serde(untagged)]
pub enum ExportResponse {
    /// JSON export
    Json(JsonExportResponse),
    /// C2PA export
    C2pa(C2paExportResponse),
}

/// Export seal in specified format
///
/// Returns seal data in JSON or C2PA format for interoperability.
#[utoipa::path(
    get,
    path = "/api/v1/seals/{seal_id}/export",
    tag = "Seals",
    params(
        ("seal_id" = String, Path, description = "Seal ID (UUID)"),
        ExportSealQuery
    ),
    responses(
        (status = 200, description = "Export data", body = ExportResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Seal not found"),
        (status = 503, description = "Database not available")
    ),
    security(
        ("clerk_token" = [])
    )
)]
pub async fn export_seal_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(seal_id): Path<Uuid>,
    Query(query): Query<ExportSealQuery>,
) -> Result<Json<ExportResponse>, ApiError> {
    // Get clerk_user_id from header
    let clerk_user_id = headers
        .get("x-clerk-user-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| ApiError::unauthorized("Missing x-clerk-user-id header"))?;

    // Get repositories
    let user_repo = state
        .user_repo
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("Database not configured"))?;

    let seal_repo = state
        .seal_repo
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("Database not configured"))?;

    // Find user to get internal ID
    let user = user_repo
        .find_by_clerk_id(clerk_user_id)
        .await
        .map_err(|e| ApiError::internal(format!("Database error: {}", e)))?
        .ok_or_else(|| ApiError::not_found("User not found"))?;

    // Get seal (restricted to user's seals)
    let seal = seal_repo
        .find_by_id_for_user(seal_id, user.id)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to get seal: {}", e)))?
        .ok_or_else(|| ApiError::not_found("Seal not found"))?;

    let format = query.format.unwrap_or_default();
    let now = chrono::Utc::now();

    match format {
        ExportFormat::Json => {
            let response = JsonExportResponse {
                export_version: "1.0".to_string(),
                seal_id: seal.id,
                content_hash: seal.content_hash.clone(),
                perceptual_hash: seal.perceptual_hash.as_ref().map(hex::encode),
                media_type: seal.media_type.clone(),
                file_size: seal.file_size,
                metadata: seal.metadata.clone(),
                trust_tier: TrustTierExport::from(seal.trust_tier),
                captured_at: seal.captured_at.to_rfc3339(),
                created_at: seal.created_at.to_rfc3339(),
                signature: hex::encode(&seal.signature),
                public_key: hex::encode(&seal.public_key),
                qrng_entropy: hex::encode(&seal.qrng_entropy),
                qrng_source: seal.qrng_source.clone(),
                c2pa_manifest_embedded: seal.c2pa_manifest_embedded,
                veritas: VeritasExportMeta {
                    version: env!("CARGO_PKG_VERSION").to_string(),
                    exported_at: now.to_rfc3339(),
                    verification_url: format!("https://veritas-q.com/verify/{}", seal.id),
                    signature_algorithm: "ML-DSA-65 (FIPS 204)".to_string(),
                    hash_algorithm: "SHA3-256".to_string(),
                },
            };
            Ok(Json(ExportResponse::Json(response)))
        }
        ExportFormat::C2pa => {
            use base64::{engine::general_purpose::STANDARD, Engine};

            // Build C2PA manifest structure
            let claim_generator = format!(
                "Veritas Q {} / c2pa-rs {}",
                env!("CARGO_PKG_VERSION"),
                "0.36" // c2pa-rs version
            );

            // Parse captured_at to Unix timestamp
            let capture_timestamp = seal.captured_at.timestamp_millis() as u64;
            let entropy_timestamp = capture_timestamp; // Use same timestamp for export

            let manifest = serde_json::json!({
                "claim_generator": claim_generator,
                "claim_generator_info": [{
                    "name": "Veritas Q",
                    "version": env!("CARGO_PKG_VERSION"),
                }],
                "title": "Veritas Q Quantum-Authenticated Media",
                "assertions": [
                    {
                        "label": "c2pa.actions",
                        "data": {
                            "actions": [
                                {
                                    "action": "c2pa.created",
                                    "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
                                    "softwareAgent": claim_generator
                                }
                            ]
                        }
                    },
                    {
                        "label": "veritas.quantum_seal",
                        "data": {
                            "version": 1,
                            "qrng_entropy": hex::encode(&seal.qrng_entropy),
                            "qrng_source": seal.qrng_source.to_uppercase(),
                            "entropy_timestamp": entropy_timestamp,
                            "capture_timestamp": capture_timestamp,
                            "ml_dsa_signature": STANDARD.encode(&seal.signature),
                            "ml_dsa_public_key": STANDARD.encode(&seal.public_key),
                            "content_hash": seal.content_hash,
                            "perceptual_hash": seal.perceptual_hash.as_ref().map(hex::encode)
                        }
                    }
                ]
            });

            let quantum_seal = QuantumSealExport {
                label: "veritas.quantum_seal".to_string(),
                version: 1,
                qrng_entropy: hex::encode(&seal.qrng_entropy),
                qrng_source: seal.qrng_source.to_uppercase(),
                entropy_timestamp,
                capture_timestamp,
                ml_dsa_signature: STANDARD.encode(&seal.signature),
                ml_dsa_public_key: STANDARD.encode(&seal.public_key),
                content_hash: seal.content_hash.clone(),
                perceptual_hash: seal.perceptual_hash.as_ref().map(hex::encode),
            };

            let response = C2paExportResponse {
                manifest,
                quantum_seal,
                export_info: C2paExportInfo {
                    c2pa_version: "2.0".to_string(),
                    claim_generator,
                    exported_at: now.to_rfc3339(),
                    usage_note: "This manifest can be embedded into media files using C2PA tools. The veritas.quantum_seal assertion contains the post-quantum signature.".to_string(),
                },
            };
            Ok(Json(ExportResponse::C2pa(response)))
        }
    }
}
