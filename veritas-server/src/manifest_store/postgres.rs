//! PostgreSQL implementation of the manifest store.

use chrono::{DateTime, Utc};
use sqlx::postgres::PgPoolOptions;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::{ManifestInput, ManifestRecord, ManifestStoreError, SimilarityMatch};

/// PostgreSQL-backed manifest store.
///
/// Provides persistence and similarity search for Veritas seals.
#[derive(Clone)]
pub struct PostgresManifestStore {
    pool: PgPool,
}

/// Row type for database queries.
#[derive(FromRow)]
struct ManifestRow {
    id: Uuid,
    seal_id: String,
    perceptual_hash: Option<Vec<u8>>,
    image_hash: String,
    seal_cbor: Vec<u8>,
    media_type: String,
    created_at: DateTime<Utc>,
}

impl From<ManifestRow> for ManifestRecord {
    fn from(row: ManifestRow) -> Self {
        Self {
            id: row.id,
            seal_id: row.seal_id,
            perceptual_hash: row.perceptual_hash,
            image_hash: row.image_hash,
            seal_cbor: row.seal_cbor,
            media_type: row.media_type,
            created_at: row.created_at,
        }
    }
}

impl PostgresManifestStore {
    /// Create a new manifest store with the given database URL.
    ///
    /// Runs migrations automatically on connection.
    pub async fn new(database_url: &str) -> Result<Self, ManifestStoreError> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await
            .map_err(|e| ManifestStoreError::Connection(e.to_string()))?;

        // Run migrations
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|e| ManifestStoreError::Migration(e.to_string()))?;

        tracing::info!("Manifest store connected and migrations applied");

        Ok(Self { pool })
    }

    /// Create a manifest store from an existing pool (for testing).
    pub fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Store a new manifest record.
    ///
    /// Uses upsert semantics: if a record with the same seal_id exists,
    /// it will be updated with the new seal_cbor.
    pub async fn store(&self, input: &ManifestInput) -> Result<Uuid, ManifestStoreError> {
        let id: Uuid = sqlx::query_scalar(
            r#"
            INSERT INTO manifests (seal_id, perceptual_hash, image_hash, seal_cbor, media_type)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (seal_id) DO UPDATE SET
                seal_cbor = EXCLUDED.seal_cbor,
                perceptual_hash = EXCLUDED.perceptual_hash
            RETURNING id
            "#,
        )
        .bind(&input.seal_id)
        .bind(&input.perceptual_hash)
        .bind(&input.image_hash)
        .bind(&input.seal_cbor)
        .bind(&input.media_type)
        .fetch_one(&self.pool)
        .await?;

        tracing::debug!(seal_id = %input.seal_id, "Stored manifest");

        Ok(id)
    }

    /// Get a manifest by its seal_id.
    pub async fn get_by_seal_id(
        &self,
        seal_id: &str,
    ) -> Result<Option<ManifestRecord>, ManifestStoreError> {
        let row: Option<ManifestRow> = sqlx::query_as(
            r#"
            SELECT id, seal_id, perceptual_hash, image_hash, seal_cbor, media_type, created_at
            FROM manifests
            WHERE seal_id = $1
            "#,
        )
        .bind(seal_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(Into::into))
    }

    /// Get a manifest by its cryptographic image hash.
    pub async fn get_by_image_hash(
        &self,
        image_hash: &str,
    ) -> Result<Option<ManifestRecord>, ManifestStoreError> {
        let row: Option<ManifestRow> = sqlx::query_as(
            r#"
            SELECT id, seal_id, perceptual_hash, image_hash, seal_cbor, media_type, created_at
            FROM manifests
            WHERE image_hash = $1
            "#,
        )
        .bind(image_hash)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(Into::into))
    }

    /// Find manifests with similar perceptual hashes.
    ///
    /// Uses Hamming distance to measure similarity. A distance of 0 means
    /// identical hashes, while higher values indicate less similarity.
    ///
    /// # Arguments
    ///
    /// * `phash` - The perceptual hash to search for (typically 8 bytes, but legacy 5-byte hashes are supported)
    /// * `threshold` - Maximum Hamming distance to consider a match (typically 10-15)
    /// * `limit` - Maximum number of results to return
    ///
    /// # Returns
    ///
    /// A vector of matches sorted by Hamming distance (closest first).
    pub async fn find_similar(
        &self,
        phash: &[u8],
        threshold: u32,
        limit: usize,
    ) -> Result<Vec<SimilarityMatch>, ManifestStoreError> {
        if phash.is_empty() || phash.len() > 8 {
            return Err(ManifestStoreError::InvalidInput(format!(
                "Perceptual hash must be 1-8 bytes, got {}",
                phash.len()
            )));
        }

        // PostgreSQL 14+ has bit_count() for bytea XOR result
        // For older versions, we compute Hamming distance in application layer
        // Here we use a hybrid approach: fetch candidates and filter
        let rows: Vec<ManifestRow> = sqlx::query_as(
            r#"
            SELECT id, seal_id, perceptual_hash, image_hash, seal_cbor, media_type, created_at
            FROM manifests
            WHERE perceptual_hash IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 1000
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        // Compute Hamming distance in Rust (more portable than SQL bit_count)
        let mut matches: Vec<SimilarityMatch> = rows
            .into_iter()
            .filter_map(|row| {
                let stored_hash = row.perceptual_hash.as_ref()?;
                let distance = hamming_distance_bytes(phash, stored_hash);

                if distance <= threshold {
                    Some(SimilarityMatch {
                        record: row.into(),
                        hamming_distance: distance,
                    })
                } else {
                    None
                }
            })
            .collect();

        // Sort by distance (closest first)
        matches.sort_by_key(|m| m.hamming_distance);

        // Limit results
        matches.truncate(limit);

        Ok(matches)
    }

    /// Delete a manifest by seal_id.
    pub async fn delete(&self, seal_id: &str) -> Result<bool, ManifestStoreError> {
        let result = sqlx::query("DELETE FROM manifests WHERE seal_id = $1")
            .bind(seal_id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Count total manifests in the store.
    pub async fn count(&self) -> Result<i64, ManifestStoreError> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM manifests")
            .fetch_one(&self.pool)
            .await?;

        Ok(count)
    }
}

/// Compute Hamming distance between two byte slices.
///
/// Supports comparing hashes of different sizes for backwards compatibility.
/// When sizes differ, compares the overlapping portion and adds a penalty
/// of 8 bits per byte of size difference.
fn hamming_distance_bytes(a: &[u8], b: &[u8]) -> u32 {
    if a.is_empty() || b.is_empty() {
        return u32::MAX;
    }

    let min_len = a.len().min(b.len());

    // Compute Hamming distance for overlapping bytes
    let distance: u32 = a[..min_len]
        .iter()
        .zip(b[..min_len].iter())
        .map(|(x, y)| (x ^ y).count_ones())
        .sum();

    // Add penalty for size mismatch (8 bits per byte difference)
    let size_penalty = (a.len().abs_diff(b.len()) * 8) as u32;

    distance + size_penalty
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hamming_distance_identical() {
        let a = [0u8; 8];
        let b = [0u8; 8];
        assert_eq!(hamming_distance_bytes(&a, &b), 0);
    }

    #[test]
    fn test_hamming_distance_one_bit() {
        let a = [0b00000001, 0, 0, 0, 0, 0, 0, 0];
        let b = [0b00000000, 0, 0, 0, 0, 0, 0, 0];
        assert_eq!(hamming_distance_bytes(&a, &b), 1);
    }

    #[test]
    fn test_hamming_distance_all_bits() {
        let a = [0xFF; 8];
        let b = [0x00; 8];
        assert_eq!(hamming_distance_bytes(&a, &b), 64); // 8 bytes * 8 bits
    }

    #[test]
    fn test_hamming_distance_half_bits() {
        let a = [0xAA; 8]; // 10101010 pattern
        let b = [0x55; 8]; // 01010101 pattern
        assert_eq!(hamming_distance_bytes(&a, &b), 64); // All bits differ
    }

    #[test]
    fn test_hamming_distance_size_mismatch() {
        // Legacy 5-byte hash vs new 8-byte hash
        let a = [0x00; 5];
        let b = [0x00; 8];
        // Should have penalty of 3 bytes * 8 bits = 24 bits
        assert_eq!(hamming_distance_bytes(&a, &b), 24);
    }

    #[test]
    fn test_hamming_distance_empty() {
        let a: [u8; 0] = [];
        let b = [0x00; 8];
        assert_eq!(hamming_distance_bytes(&a, &b), u32::MAX);
    }
}
