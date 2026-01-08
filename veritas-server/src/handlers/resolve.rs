//! Soft binding resolution handler
//!
//! Handles POST /resolve requests to find seals by perceptual hash similarity.

use std::sync::Arc;

use axum::{extract::State, Json};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use veritas_core::compute_phash;

use crate::db::UserRepository;
use crate::error::ApiError;
use crate::manifest_store::PostgresManifestStore;

/// Default similarity threshold (Hamming distance)
const DEFAULT_THRESHOLD: u32 = 10;

/// Default maximum results
const DEFAULT_LIMIT: usize = 5;

/// Request for resolving a seal by perceptual hash similarity.
#[derive(Deserialize, ToSchema)]
pub struct ResolveRequest {
    /// Base64-encoded image data to compute perceptual hash from.
    /// Either `image_data` or `perceptual_hash` must be provided.
    #[serde(default)]
    #[schema(example = "/9j/4AAQSkZJRg...")]
    pub image_data: Option<String>,

    /// Hex-encoded perceptual hash (8 bytes = 16 hex chars).
    /// Alternative to providing `image_data`.
    #[serde(default)]
    #[schema(example = "a1b2c3d4e5f67890")]
    pub perceptual_hash: Option<String>,

    /// Maximum Hamming distance for similarity matching (default: 10).
    /// Lower values = stricter matching.
    #[serde(default)]
    #[schema(example = 10)]
    pub threshold: Option<u32>,

    /// Maximum number of results to return (default: 5).
    #[serde(default)]
    #[schema(example = 5)]
    pub limit: Option<usize>,

    /// Whether to include the full seal CBOR in responses.
    /// Set to false for lighter responses (default: false).
    #[serde(default)]
    pub include_seal_data: Option<bool>,
}

/// Response for a resolution query.
#[derive(Serialize, ToSchema)]
pub struct ResolveResponse {
    /// Whether any matches were found.
    #[schema(example = true)]
    pub found: bool,

    /// Number of matches found.
    #[schema(example = 2)]
    pub count: usize,

    /// The matching seals, sorted by similarity (closest first).
    pub matches: Vec<ResolveMatch>,
}

/// A single match from the resolution query.
#[derive(Serialize, ToSchema)]
pub struct ResolveMatch {
    /// The seal identifier.
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub seal_id: String,

    /// Cryptographic hash of the original content (SHA3-256, hex-encoded).
    #[schema(example = "a1b2c3d4...")]
    pub image_hash: String,

    /// Hamming distance from the query (0 = exact match).
    #[schema(example = 3)]
    pub hamming_distance: u32,

    /// Media type of the sealed content.
    #[schema(example = "image")]
    pub media_type: String,

    /// When the seal was created.
    #[schema(example = "2026-01-07T10:00:00Z")]
    pub created_at: String,

    /// Base64-encoded seal CBOR (only if `include_seal_data` was true).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seal_data: Option<String>,
}

/// Application state containing shared resources.
#[derive(Clone)]
pub struct AppState {
    /// Manifest store for seal storage and resolution
    pub manifest_store: Option<Arc<PostgresManifestStore>>,
    /// User repository for user data
    pub user_repo: Option<Arc<UserRepository>>,
}

/// Resolve a seal by perceptual hash similarity.
///
/// This endpoint enables "soft binding" resolution: finding the original
/// seal for an image even after it has been compressed, resized, or
/// had its metadata stripped.
///
/// Accepts either:
/// - `image_data`: Base64-encoded image to compute perceptual hash from
/// - `perceptual_hash`: Pre-computed hex-encoded perceptual hash
///
/// Returns matching seals sorted by similarity (Hamming distance).
#[utoipa::path(
    post,
    path = "/resolve",
    tag = "Resolution",
    request_body = ResolveRequest,
    responses(
        (status = 200, description = "Resolution result", body = ResolveResponse),
        (status = 400, description = "Invalid request (no hash provided, invalid format)"),
        (status = 503, description = "Manifest store not available")
    )
)]
pub async fn resolve_handler(
    State(state): State<AppState>,
    Json(request): Json<ResolveRequest>,
) -> Result<Json<ResolveResponse>, ApiError> {
    // Ensure manifest store is available
    let store = state
        .manifest_store
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("Manifest store not configured"))?;

    // Get perceptual hash from request
    let phash_bytes = if let Some(ref image_data) = request.image_data {
        // Decode base64 image and compute perceptual hash
        let image_bytes = BASE64
            .decode(image_data)
            .map_err(|e| ApiError::bad_request(format!("Invalid base64 image_data: {}", e)))?;

        compute_phash(&image_bytes).ok_or_else(|| {
            ApiError::bad_request("Failed to compute perceptual hash from image data")
        })?
    } else if let Some(ref phash_hex) = request.perceptual_hash {
        // Decode hex perceptual hash
        hex::decode(phash_hex)
            .map_err(|e| ApiError::bad_request(format!("Invalid hex perceptual_hash: {}", e)))?
    } else {
        return Err(ApiError::bad_request(
            "Either 'image_data' or 'perceptual_hash' must be provided",
        ));
    };

    // Validate hash length (accept both legacy 5-byte and standard 8-byte hashes)
    if phash_bytes.is_empty() || phash_bytes.len() > 8 {
        return Err(ApiError::bad_request(format!(
            "Perceptual hash must be 1-8 bytes, got {}",
            phash_bytes.len()
        )));
    }

    let threshold = request.threshold.unwrap_or(DEFAULT_THRESHOLD);
    let limit = request.limit.unwrap_or(DEFAULT_LIMIT).min(100); // Cap at 100
    let include_seal_data = request.include_seal_data.unwrap_or(false);

    // Search for similar manifests
    let matches = store
        .find_similar(&phash_bytes, threshold, limit)
        .await
        .map_err(|e| ApiError::internal(format!("Database error: {}", e)))?;

    // Convert to response format
    let response_matches: Vec<ResolveMatch> = matches
        .into_iter()
        .map(|m| ResolveMatch {
            seal_id: m.record.seal_id,
            image_hash: m.record.image_hash,
            hamming_distance: m.hamming_distance,
            media_type: m.record.media_type,
            created_at: m.record.created_at.to_rfc3339(),
            seal_data: if include_seal_data {
                Some(BASE64.encode(&m.record.seal_cbor))
            } else {
                None
            },
        })
        .collect();

    let count = response_matches.len();

    Ok(Json(ResolveResponse {
        found: count > 0,
        count,
        matches: response_matches,
    }))
}
