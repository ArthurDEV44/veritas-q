//! PostgreSQL storage for WebAuthn credentials
//!
//! Provides persistent storage for device credentials using NeonDB/PostgreSQL.

use sqlx::PgPool;
use webauthn_rs::prelude::Passkey;

use crate::webauthn::types::DeviceAttestation;

use super::{StorageError, StoredCredential};

/// PostgreSQL-backed credential storage
pub struct PostgresCredentialStore {
    pool: PgPool,
}

impl PostgresCredentialStore {
    /// Create a new PostgreSQL credential store
    pub async fn new(database_url: &str) -> Result<Self, StorageError> {
        let pool = PgPool::connect(database_url)
            .await
            .map_err(|e| StorageError::Connection(e.to_string()))?;

        tracing::info!("Connected to PostgreSQL database");
        Ok(Self { pool })
    }

    /// Create from an existing pool
    pub fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Run database migrations
    pub async fn migrate(&self) -> Result<(), StorageError> {
        sqlx::migrate!("./migrations")
            .run(&self.pool)
            .await
            .map_err(|e| StorageError::Migration(e.to_string()))?;

        tracing::info!("Database migrations completed");
        Ok(())
    }

    /// Check database connection health
    pub async fn check_health(&self) -> Result<(), StorageError> {
        sqlx::query("SELECT 1")
            .execute(&self.pool)
            .await
            .map_err(|e| StorageError::Connection(e.to_string()))?;
        Ok(())
    }

    /// Store a new credential
    pub async fn store_credential(
        &self,
        credential_id: &str,
        passkey: &Passkey,
        device_name: Option<&str>,
        attestation: &DeviceAttestation,
    ) -> Result<(), StorageError> {
        let passkey_json = serde_json::to_value(passkey)
            .map_err(|e| StorageError::Serialization(e.to_string()))?;

        sqlx::query(
            r#"
            INSERT INTO webauthn_credentials
                (credential_id, passkey_data, device_name, authenticator_type,
                 attestation_format, aaguid, sign_count)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (credential_id) DO UPDATE SET
                passkey_data = EXCLUDED.passkey_data,
                sign_count = EXCLUDED.sign_count,
                last_used_at = NOW()
            "#,
        )
        .bind(credential_id)
        .bind(&passkey_json)
        .bind(device_name)
        .bind(attestation.authenticator_type.as_str())
        .bind(attestation.attestation_format.as_str())
        .bind(&attestation.aaguid)
        .bind(attestation.sign_count as i32)
        .execute(&self.pool)
        .await
        .map_err(|e| StorageError::Query(e.to_string()))?;

        tracing::info!(credential_id = %credential_id, "Credential stored in database");
        Ok(())
    }

    /// Get a credential by ID
    pub async fn get_credential(
        &self,
        credential_id: &str,
    ) -> Result<Option<StoredCredential>, StorageError> {
        let row = sqlx::query_as::<_, CredentialRow>(
            r#"
            SELECT credential_id, passkey_data, device_name,
                   authenticator_type, attestation_format, aaguid, sign_count,
                   created_at, last_used_at
            FROM webauthn_credentials
            WHERE credential_id = $1
            "#,
        )
        .bind(credential_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| StorageError::Query(e.to_string()))?;

        match row {
            Some(row) => {
                let stored = row.into_stored_credential()?;
                Ok(Some(stored))
            }
            None => Ok(None),
        }
    }

    /// Update credential after successful authentication
    pub async fn update_credential(
        &self,
        credential_id: &str,
        passkey: &Passkey,
        sign_count: u32,
    ) -> Result<bool, StorageError> {
        let passkey_json = serde_json::to_value(passkey)
            .map_err(|e| StorageError::Serialization(e.to_string()))?;

        let result = sqlx::query(
            r#"
            UPDATE webauthn_credentials
            SET passkey_data = $2, sign_count = $3, last_used_at = NOW()
            WHERE credential_id = $1
            "#,
        )
        .bind(credential_id)
        .bind(&passkey_json)
        .bind(sign_count as i32)
        .execute(&self.pool)
        .await
        .map_err(|e| StorageError::Query(e.to_string()))?;

        Ok(result.rows_affected() > 0)
    }

    /// Check if a credential exists
    pub async fn has_credential(&self, credential_id: &str) -> Result<bool, StorageError> {
        let exists: bool = sqlx::query_scalar(
            r#"
            SELECT EXISTS(SELECT 1 FROM webauthn_credentials WHERE credential_id = $1)
            "#,
        )
        .bind(credential_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| StorageError::Query(e.to_string()))?;

        Ok(exists)
    }

    /// Get total credential count (for stats)
    pub async fn credential_count(&self) -> Result<usize, StorageError> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM webauthn_credentials")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| StorageError::Query(e.to_string()))?;

        Ok(count as usize)
    }
}

/// Database row for credentials
#[derive(sqlx::FromRow)]
struct CredentialRow {
    credential_id: String,
    passkey_data: serde_json::Value,
    device_name: Option<String>,
    authenticator_type: String,
    attestation_format: String,
    aaguid: String,
    sign_count: i32,
    #[allow(dead_code)]
    created_at: chrono::DateTime<chrono::Utc>,
    last_used_at: chrono::DateTime<chrono::Utc>,
}

impl CredentialRow {
    fn into_stored_credential(self) -> Result<StoredCredential, StorageError> {
        use crate::webauthn::types::{AttestationFormat, AuthenticatorType};

        let passkey: Passkey = serde_json::from_value(self.passkey_data)
            .map_err(|e| StorageError::Serialization(e.to_string()))?;

        let authenticator_type = match self.authenticator_type.as_str() {
            "platform" => AuthenticatorType::Platform,
            "cross_platform" => AuthenticatorType::CrossPlatform,
            _ => AuthenticatorType::Platform,
        };

        let attestation_format = match self.attestation_format.as_str() {
            "packed" => AttestationFormat::Packed,
            "tpm" => AttestationFormat::Tpm,
            "android_key" => AttestationFormat::AndroidKey,
            "android_safety_net" => AttestationFormat::AndroidSafetyNet,
            "apple" => AttestationFormat::Apple,
            "fido_u2f" => AttestationFormat::FidoU2f,
            _ => AttestationFormat::None,
        };

        let device_attestation = DeviceAttestation {
            credential_id: self.credential_id.clone(),
            authenticator_type,
            device_model: None, // Not stored in DB currently
            attestation_format,
            attested_at: self.last_used_at.timestamp() as u64,
            sign_count: self.sign_count as u32,
            aaguid: self.aaguid,
        };

        Ok(StoredCredential {
            passkey,
            device_attestation,
            device_name: self.device_name,
        })
    }
}

impl std::fmt::Debug for PostgresCredentialStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PostgresCredentialStore")
            .field("pool", &"<PgPool>")
            .finish()
    }
}
