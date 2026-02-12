//! User entity and repository
//!
//! Handles user data synchronized from Clerk authentication.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use utoipa::ToSchema;
use uuid::Uuid;

/// Trust tier for users
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum TrustTier {
    /// Tier 1: In-app capture only (default for all users)
    #[default]
    Tier1 = 1,
    /// Tier 2: Verified reporter (can import from gallery)
    Tier2 = 2,
    /// Tier 3: Hardware attestation (future)
    Tier3 = 3,
}

impl From<i16> for TrustTier {
    fn from(value: i16) -> Self {
        match value {
            2 => TrustTier::Tier2,
            3 => TrustTier::Tier3,
            _ => TrustTier::Tier1,
        }
    }
}

impl From<TrustTier> for i16 {
    fn from(tier: TrustTier) -> Self {
        tier as i16
    }
}

/// User entity from database
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub clerk_user_id: String,
    pub email: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    #[sqlx(try_from = "i16")]
    pub tier: TrustTier,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// DTO for creating a new user
#[derive(Debug, Clone, Deserialize)]
pub struct CreateUser {
    pub clerk_user_id: String,
    pub email: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

/// DTO for updating user profile
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateUser {
    pub email: Option<String>,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

/// User response DTO (excludes internal fields)
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct UserResponse {
    /// User unique identifier
    #[schema(value_type = String, example = "550e8400-e29b-41d4-a716-446655440000")]
    pub id: Uuid,
    /// User email address
    #[schema(example = "user@example.com")]
    pub email: String,
    /// User display name
    #[schema(example = "John Doe")]
    pub name: Option<String>,
    /// User avatar URL
    #[schema(example = "https://img.clerk.com/avatar.jpg")]
    pub avatar_url: Option<String>,
    /// User trust tier
    pub tier: TrustTier,
    /// Account creation timestamp
    #[schema(value_type = String, example = "2026-01-08T10:00:00Z")]
    pub created_at: DateTime<Utc>,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar_url: user.avatar_url,
            tier: user.tier,
            created_at: user.created_at,
        }
    }
}

/// Repository for user database operations
#[derive(Clone)]
pub struct UserRepository {
    pool: PgPool,
}

impl UserRepository {
    /// Create a new user repository
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Find user by Clerk user ID
    pub async fn find_by_clerk_id(&self, clerk_user_id: &str) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            SELECT id, clerk_user_id, email, name, avatar_url, tier, created_at, updated_at, deleted_at
            FROM users
            WHERE clerk_user_id = $1 AND deleted_at IS NULL
            "#,
        )
        .bind(clerk_user_id)
        .fetch_optional(&self.pool)
        .await
    }

    /// Find user by internal ID
    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            SELECT id, clerk_user_id, email, name, avatar_url, tier, created_at, updated_at, deleted_at
            FROM users
            WHERE id = $1 AND deleted_at IS NULL
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
    }

    /// Find user by email
    pub async fn find_by_email(&self, email: &str) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            SELECT id, clerk_user_id, email, name, avatar_url, tier, created_at, updated_at, deleted_at
            FROM users
            WHERE email = $1 AND deleted_at IS NULL
            "#,
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await
    }

    /// Create a new user or return existing if clerk_user_id already exists
    pub async fn create_or_update(&self, input: CreateUser) -> Result<User, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users (clerk_user_id, email, name, avatar_url)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (clerk_user_id)
            DO UPDATE SET
                email = EXCLUDED.email,
                name = EXCLUDED.name,
                avatar_url = EXCLUDED.avatar_url,
                updated_at = NOW()
            RETURNING id, clerk_user_id, email, name, avatar_url, tier, created_at, updated_at, deleted_at
            "#,
        )
        .bind(&input.clerk_user_id)
        .bind(&input.email)
        .bind(&input.name)
        .bind(&input.avatar_url)
        .fetch_one(&self.pool)
        .await
    }

    /// Update user profile
    pub async fn update(&self, id: Uuid, input: UpdateUser) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            UPDATE users
            SET
                email = COALESCE($2, email),
                name = COALESCE($3, name),
                avatar_url = COALESCE($4, avatar_url),
                updated_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING id, clerk_user_id, email, name, avatar_url, tier, created_at, updated_at, deleted_at
            "#,
        )
        .bind(id)
        .bind(&input.email)
        .bind(&input.name)
        .bind(&input.avatar_url)
        .fetch_optional(&self.pool)
        .await
    }

    /// SQL for GDPR-compliant soft delete with PII anonymization (GDPR Article 17)
    const SOFT_DELETE_SQL: &str = r#"
        UPDATE users
        SET
            email = 'deleted-' || id::text,
            name = NULL,
            avatar_url = NULL,
            deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
    "#;

    /// Soft delete user (GDPR compliance - anonymizes PII)
    pub async fn soft_delete(&self, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(Self::SOFT_DELETE_SQL)
            .bind(id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Update user tier (admin operation)
    pub async fn update_tier(
        &self,
        id: Uuid,
        tier: TrustTier,
    ) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r#"
            UPDATE users
            SET tier = $2, updated_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING id, clerk_user_id, email, name, avatar_url, tier, created_at, updated_at, deleted_at
            "#,
        )
        .bind(id)
        .bind(i16::from(tier))
        .fetch_optional(&self.pool)
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trust_tier_conversion() {
        assert_eq!(TrustTier::from(1i16), TrustTier::Tier1);
        assert_eq!(TrustTier::from(2i16), TrustTier::Tier2);
        assert_eq!(TrustTier::from(3i16), TrustTier::Tier3);
        assert_eq!(TrustTier::from(99i16), TrustTier::Tier1); // Invalid defaults to Tier1

        assert_eq!(i16::from(TrustTier::Tier1), 1);
        assert_eq!(i16::from(TrustTier::Tier2), 2);
        assert_eq!(i16::from(TrustTier::Tier3), 3);
    }

    #[test]
    fn test_user_response_from_user() {
        let user = User {
            id: Uuid::new_v4(),
            clerk_user_id: "clerk_123".to_string(),
            email: "test@example.com".to_string(),
            name: Some("Test User".to_string()),
            avatar_url: None,
            tier: TrustTier::Tier1,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted_at: None,
        };

        let response = UserResponse::from(user.clone());
        assert_eq!(response.id, user.id);
        assert_eq!(response.email, user.email);
        assert_eq!(response.name, user.name);
        assert_eq!(response.tier, user.tier);
    }

    #[test]
    fn test_soft_delete_sql_anonymizes_pii() {
        // Verify that soft_delete SQL includes GDPR-compliant PII anonymization (Article 17)
        assert!(
            UserRepository::SOFT_DELETE_SQL.contains("email = 'deleted-' || id::text"),
            "soft_delete must anonymize email with 'deleted-{{id}}' pattern"
        );
        assert!(
            UserRepository::SOFT_DELETE_SQL.contains("name = NULL"),
            "soft_delete must clear name field"
        );
        assert!(
            UserRepository::SOFT_DELETE_SQL.contains("avatar_url = NULL"),
            "soft_delete must clear avatar_url field"
        );
        assert!(
            UserRepository::SOFT_DELETE_SQL.contains("deleted_at = NOW()"),
            "soft_delete must set deleted_at timestamp"
        );
    }
}
