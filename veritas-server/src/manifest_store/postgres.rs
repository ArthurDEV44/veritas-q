//! PostgreSQL implementation of the manifest store.

use chrono::{DateTime, Utc};
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
    /// Create a manifest store from an existing shared pool.
    ///
    /// The caller is responsible for running migrations on the pool before use.
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
    /// PostgreSQL 14+ implementation using server-side bit_count() for performance.
    ///
    /// # Arguments
    ///
    /// * `phash` - The perceptual hash to search for (typically 8 bytes)
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

        let phash_len = phash.len() as i32;

        // Use PostgreSQL bit_count() to compute Hamming distance on the server.
        // Only compare hashes of the same length to avoid conversion complexity.
        // The XOR operator (#) works on bit/bit varying types.
        #[derive(FromRow)]
        struct SimilarityRow {
            id: Uuid,
            seal_id: String,
            perceptual_hash: Option<Vec<u8>>,
            image_hash: String,
            seal_cbor: Vec<u8>,
            media_type: String,
            created_at: DateTime<Utc>,
            hamming_distance: i32,
        }

        let rows: Vec<SimilarityRow> = sqlx::query_as(
            r#"
            SELECT id, seal_id, perceptual_hash, image_hash, seal_cbor, media_type, created_at,
                   bit_count(perceptual_hash::bit varying # $1::bit varying) as hamming_distance
            FROM manifests
            WHERE perceptual_hash IS NOT NULL
              AND length(perceptual_hash) = $2
              AND bit_count(perceptual_hash::bit varying # $1::bit varying) <= $3
            ORDER BY hamming_distance ASC
            LIMIT $4
            "#,
        )
        .bind(phash)
        .bind(phash_len)
        .bind(threshold as i32)
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await?;

        let matches: Vec<SimilarityMatch> = rows
            .into_iter()
            .map(|row| {
                let record = ManifestRecord {
                    id: row.id,
                    seal_id: row.seal_id,
                    perceptual_hash: row.perceptual_hash,
                    image_hash: row.image_hash,
                    seal_cbor: row.seal_cbor,
                    media_type: row.media_type,
                    created_at: row.created_at,
                };
                SimilarityMatch {
                    record,
                    hamming_distance: row.hamming_distance as u32,
                }
            })
            .collect();

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

/// Compute Hamming distance between two byte slices (fallback utility).
///
/// Supports comparing hashes of different sizes for backwards compatibility.
/// When sizes differ, compares the overlapping portion and adds a penalty
/// of 8 bits per byte of size difference.
///
/// NOTE: The primary `find_similar` uses PostgreSQL 14+ bit_count() for performance.
/// This function is kept as a fallback utility.
pub fn hamming_distance_bytes(a: &[u8], b: &[u8]) -> u32 {
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
