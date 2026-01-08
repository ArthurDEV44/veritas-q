//! Seal entity and repository
//!
//! Handles quantum-authenticated seal records linked to users.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use utoipa::ToSchema;
use uuid::Uuid;

use super::TrustTier;

/// Seal entity from database
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Seal {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub organization_id: Option<Uuid>,
    pub content_hash: String,
    pub perceptual_hash: Option<Vec<u8>>,
    pub qrng_entropy: Vec<u8>,
    pub qrng_source: String,
    pub signature: Vec<u8>,
    pub public_key: Vec<u8>,
    pub media_type: String,
    pub file_size: Option<i32>,
    pub mime_type: Option<String>,
    pub metadata: serde_json::Value,
    #[sqlx(try_from = "i16")]
    pub trust_tier: TrustTier,
    pub c2pa_manifest_embedded: bool,
    pub captured_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub media_deleted_at: Option<DateTime<Utc>>,
}

/// DTO for creating a new seal
#[derive(Debug, Clone)]
pub struct CreateSeal {
    pub user_id: Option<Uuid>,
    pub organization_id: Option<Uuid>,
    pub content_hash: String,
    pub perceptual_hash: Option<Vec<u8>>,
    pub qrng_entropy: Vec<u8>,
    pub qrng_source: String,
    pub signature: Vec<u8>,
    pub public_key: Vec<u8>,
    pub media_type: String,
    pub file_size: Option<i32>,
    pub mime_type: Option<String>,
    pub metadata: serde_json::Value,
    pub trust_tier: TrustTier,
    pub c2pa_manifest_embedded: bool,
    pub captured_at: DateTime<Utc>,
}

/// Seal capture metadata structure
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SealMetadata {
    /// ISO 8601 timestamp of capture
    #[schema(example = "2026-01-08T10:00:00Z")]
    pub timestamp: String,

    /// GPS location if available
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<SealLocation>,

    /// Device information
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<DeviceInfo>,

    /// How the media was captured
    #[schema(example = "camera")]
    pub capture_source: String,

    /// Whether device attestation was included
    #[schema(example = true)]
    pub has_device_attestation: bool,
}

/// GPS location data
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SealLocation {
    #[schema(example = 48.8566)]
    pub lat: f64,
    #[schema(example = 2.3522)]
    pub lng: f64,
    #[schema(example = 35.0)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub altitude: Option<f64>,
}

/// Device information
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DeviceInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
}

/// Seal response DTO for API responses
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SealRecord {
    /// Unique seal identifier
    #[schema(value_type = String, example = "550e8400-e29b-41d4-a716-446655440000")]
    pub id: Uuid,

    /// Content hash (SHA3-256, hex-encoded)
    #[schema(example = "a1b2c3d4e5f67890...")]
    pub content_hash: String,

    /// Perceptual hash (hex-encoded, images only)
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(example = "a1b2c3d4e5f67890")]
    pub perceptual_hash: Option<String>,

    /// Media type
    #[schema(example = "image")]
    pub media_type: String,

    /// File size in bytes
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(example = 1024000)]
    pub file_size: Option<i32>,

    /// Capture metadata
    pub metadata: serde_json::Value,

    /// Trust tier
    pub trust_tier: TrustTier,

    /// Whether C2PA manifest was embedded
    pub c2pa_manifest_embedded: bool,

    /// When the media was captured
    #[schema(value_type = String, example = "2026-01-08T10:00:00Z")]
    pub captured_at: DateTime<Utc>,

    /// When the seal was created
    #[schema(value_type = String, example = "2026-01-08T10:00:00Z")]
    pub created_at: DateTime<Utc>,

    /// Whether media has been deleted (GDPR)
    pub media_deleted: bool,
}

impl From<Seal> for SealRecord {
    fn from(seal: Seal) -> Self {
        Self {
            id: seal.id,
            content_hash: seal.content_hash,
            perceptual_hash: seal.perceptual_hash.map(hex::encode),
            media_type: seal.media_type,
            file_size: seal.file_size,
            metadata: seal.metadata,
            trust_tier: seal.trust_tier,
            c2pa_manifest_embedded: seal.c2pa_manifest_embedded,
            captured_at: seal.captured_at,
            created_at: seal.created_at,
            media_deleted: seal.media_deleted_at.is_some(),
        }
    }
}

/// Pagination parameters
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct SealListParams {
    /// Page number (1-indexed)
    #[serde(default = "default_page")]
    pub page: i64,

    /// Items per page (max 100)
    #[serde(default = "default_limit")]
    pub limit: i64,

    /// Filter by media type
    #[serde(default)]
    pub media_type: Option<String>,

    /// Filter by seals with GPS location
    #[serde(default)]
    pub has_location: Option<bool>,
}

fn default_page() -> i64 {
    1
}

fn default_limit() -> i64 {
    20
}

/// Paginated seal list response
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SealListResponse {
    pub seals: Vec<SealRecord>,
    pub page: i64,
    pub limit: i64,
    pub total: i64,
    pub has_more: bool,
}

/// Repository for seal database operations
#[derive(Clone)]
pub struct SealRepository {
    pool: PgPool,
}

impl SealRepository {
    /// Create a new seal repository
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Create a new seal
    pub async fn create(&self, input: CreateSeal) -> Result<Seal, sqlx::Error> {
        sqlx::query_as::<_, Seal>(
            r#"
            INSERT INTO seals (
                user_id, organization_id, content_hash, perceptual_hash,
                qrng_entropy, qrng_source, signature, public_key,
                media_type, file_size, mime_type, metadata,
                trust_tier, c2pa_manifest_embedded, captured_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
            "#,
        )
        .bind(input.user_id)
        .bind(input.organization_id)
        .bind(&input.content_hash)
        .bind(&input.perceptual_hash)
        .bind(&input.qrng_entropy)
        .bind(&input.qrng_source)
        .bind(&input.signature)
        .bind(&input.public_key)
        .bind(&input.media_type)
        .bind(input.file_size)
        .bind(&input.mime_type)
        .bind(&input.metadata)
        .bind(i16::from(input.trust_tier))
        .bind(input.c2pa_manifest_embedded)
        .bind(input.captured_at)
        .fetch_one(&self.pool)
        .await
    }

    /// Find seal by ID
    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<Seal>, sqlx::Error> {
        sqlx::query_as::<_, Seal>(
            r#"
            SELECT * FROM seals WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
    }

    /// Find seal by ID, restricted to a specific user
    pub async fn find_by_id_for_user(
        &self,
        id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<Seal>, sqlx::Error> {
        sqlx::query_as::<_, Seal>(
            r#"
            SELECT * FROM seals
            WHERE id = $1 AND user_id = $2
            "#,
        )
        .bind(id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
    }

    /// Find seal by content hash
    pub async fn find_by_content_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<Seal>, sqlx::Error> {
        sqlx::query_as::<_, Seal>(
            r#"
            SELECT * FROM seals WHERE content_hash = $1
            "#,
        )
        .bind(content_hash)
        .fetch_optional(&self.pool)
        .await
    }

    /// List seals for a user with pagination
    pub async fn list_for_user(
        &self,
        user_id: Uuid,
        params: &SealListParams,
    ) -> Result<SealListResponse, sqlx::Error> {
        let limit = params.limit.min(100);
        let offset = (params.page - 1).max(0) * limit;

        // Build query based on filters
        let (seals, total) = if let Some(ref media_type) = params.media_type {
            let seals = sqlx::query_as::<_, Seal>(
                r#"
                SELECT * FROM seals
                WHERE user_id = $1 AND media_type = $2
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4
                "#,
            )
            .bind(user_id)
            .bind(media_type)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?;

            let total: (i64,) = sqlx::query_as(
                r#"
                SELECT COUNT(*) FROM seals
                WHERE user_id = $1 AND media_type = $2
                "#,
            )
            .bind(user_id)
            .bind(media_type)
            .fetch_one(&self.pool)
            .await?;

            (seals, total.0)
        } else {
            let seals = sqlx::query_as::<_, Seal>(
                r#"
                SELECT * FROM seals
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                "#,
            )
            .bind(user_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?;

            let total: (i64,) = sqlx::query_as(
                r#"
                SELECT COUNT(*) FROM seals WHERE user_id = $1
                "#,
            )
            .bind(user_id)
            .fetch_one(&self.pool)
            .await?;

            (seals, total.0)
        };

        let records: Vec<SealRecord> = seals.into_iter().map(SealRecord::from).collect();
        let has_more = offset + (records.len() as i64) < total;

        Ok(SealListResponse {
            seals: records,
            page: params.page,
            limit,
            total,
            has_more,
        })
    }

    /// Count seals for a user (for usage tracking)
    pub async fn count_for_user(&self, user_id: Uuid) -> Result<i64, sqlx::Error> {
        let result: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) FROM seals WHERE user_id = $1
            "#,
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(result.0)
    }

    /// Count seals created this month for a user (for plan limits)
    pub async fn count_for_user_this_month(&self, user_id: Uuid) -> Result<i64, sqlx::Error> {
        let result: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) FROM seals
            WHERE user_id = $1
            AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)
            "#,
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(result.0)
    }

    /// Mark media as deleted (GDPR compliance)
    pub async fn delete_media(&self, id: Uuid, user_id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            r#"
            UPDATE seals
            SET media_deleted_at = NOW()
            WHERE id = $1 AND user_id = $2 AND media_deleted_at IS NULL
            "#,
        )
        .bind(id)
        .bind(user_id)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seal_record_from_seal() {
        let seal = Seal {
            id: Uuid::new_v4(),
            user_id: Some(Uuid::new_v4()),
            organization_id: None,
            content_hash: "abc123".to_string(),
            perceptual_hash: Some(vec![1, 2, 3, 4, 5, 6, 7, 8]),
            qrng_entropy: vec![0; 32],
            qrng_source: "lfd".to_string(),
            signature: vec![0; 100],
            public_key: vec![0; 100],
            media_type: "image".to_string(),
            file_size: Some(1024),
            mime_type: Some("image/jpeg".to_string()),
            metadata: serde_json::json!({"timestamp": "2026-01-08T10:00:00Z"}),
            trust_tier: TrustTier::Tier1,
            c2pa_manifest_embedded: true,
            captured_at: Utc::now(),
            created_at: Utc::now(),
            media_deleted_at: None,
        };

        let record = SealRecord::from(seal.clone());
        assert_eq!(record.id, seal.id);
        assert_eq!(record.content_hash, seal.content_hash);
        assert_eq!(record.perceptual_hash, Some("0102030405060708".to_string()));
        assert!(!record.media_deleted);
    }

    #[test]
    fn test_seal_metadata_serialization() {
        let metadata = SealMetadata {
            timestamp: "2026-01-08T10:00:00Z".to_string(),
            location: Some(SealLocation {
                lat: 48.8566,
                lng: 2.3522,
                altitude: Some(35.0),
            }),
            device: Some(DeviceInfo {
                user_agent: Some("Mozilla/5.0".to_string()),
                platform: Some("macOS".to_string()),
            }),
            capture_source: "camera".to_string(),
            has_device_attestation: true,
        };

        let json = serde_json::to_string(&metadata).unwrap();
        assert!(json.contains("timestamp"));
        assert!(json.contains("location"));
        assert!(json.contains("lat"));
    }
}
