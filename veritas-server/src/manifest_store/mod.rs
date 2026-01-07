//! Manifest store module for persisting seals and resolving by perceptual hash.
//!
//! This module provides the infrastructure for "soft binding" resolution:
//! - Store VeritasSeal manifests with their perceptual hashes
//! - Find similar images using Hamming distance on perceptual hashes
//! - Exact match lookup by seal_id or image_hash

pub mod error;
pub mod postgres;

pub use error::ManifestStoreError;
pub use postgres::PostgresManifestStore;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A manifest record stored in the database.
///
/// Contains the seal metadata needed for resolution lookups.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestRecord {
    /// Unique database identifier
    pub id: Uuid,
    /// Seal identifier (UUID string)
    pub seal_id: String,
    /// 64-bit perceptual hash (8 bytes), None for non-image content
    pub perceptual_hash: Option<Vec<u8>>,
    /// SHA3-256 cryptographic hash (hex-encoded)
    pub image_hash: String,
    /// Complete VeritasSeal in CBOR format
    pub seal_cbor: Vec<u8>,
    /// Media type (image, video, audio, generic)
    pub media_type: String,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
}

/// Result of a similarity search.
///
/// Contains the matching manifest and the Hamming distance from the query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarityMatch {
    /// The matching manifest record
    pub record: ManifestRecord,
    /// Hamming distance from the query hash (0 = exact match)
    pub hamming_distance: u32,
}

/// Input for creating a new manifest record.
///
/// Used when storing a newly created seal.
#[derive(Debug, Clone)]
pub struct ManifestInput {
    /// Seal identifier
    pub seal_id: String,
    /// 64-bit perceptual hash (8 bytes), None for non-image content
    pub perceptual_hash: Option<Vec<u8>>,
    /// SHA3-256 cryptographic hash (hex-encoded)
    pub image_hash: String,
    /// Complete VeritasSeal in CBOR format
    pub seal_cbor: Vec<u8>,
    /// Media type
    pub media_type: String,
}
