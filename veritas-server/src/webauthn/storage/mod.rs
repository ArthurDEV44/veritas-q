//! WebAuthn storage module
//!
//! Provides storage for:
//! - **Challenges** (in-memory): Registration and authentication challenges are temporary
//!   and don't need database persistence. They expire after 5 minutes.
//! - **Credentials** (PostgreSQL): Device credentials are persisted in the database
//!   to survive server restarts.
//!
//! If `DATABASE_URL` is not set, falls back to in-memory storage for credentials
//! (useful for development, but credentials will be lost on restart).

mod memory;
mod postgres;

pub use memory::ChallengeStore;
pub use postgres::PostgresCredentialStore;

use dashmap::DashMap;
use webauthn_rs::prelude::*;

use super::types::DeviceAttestation;

/// Storage errors
#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("Database connection error: {0}")]
    Connection(String),

    #[error("Database migration error: {0}")]
    Migration(String),

    #[error("Query error: {0}")]
    Query(String),

    #[error("Serialization error: {0}")]
    Serialization(String),
}

/// Stored credential with attestation
#[derive(Clone)]
pub struct StoredCredential {
    pub passkey: Passkey,
    pub device_attestation: DeviceAttestation,
    pub device_name: Option<String>,
}

/// Credential storage backend
enum CredentialBackend {
    /// PostgreSQL storage (production)
    Postgres(PostgresCredentialStore),
    /// In-memory storage (development fallback)
    Memory(DashMap<String, StoredCredential>),
}

/// Unified WebAuthn storage combining challenge and credential storage
pub struct WebAuthnStorage {
    /// In-memory challenge storage (always in memory - temporary data)
    challenges: ChallengeStore,
    /// Credential storage (PostgreSQL or memory fallback)
    credentials: CredentialBackend,
}

impl WebAuthnStorage {
    /// Create storage with PostgreSQL backend
    pub async fn with_postgres(database_url: &str) -> Result<Self, StorageError> {
        let pg_store = PostgresCredentialStore::new(database_url).await?;
        pg_store.migrate().await?;

        Ok(Self {
            challenges: ChallengeStore::new(),
            credentials: CredentialBackend::Postgres(pg_store),
        })
    }

    /// Create storage with in-memory backend (development only)
    pub fn in_memory() -> Self {
        tracing::warn!("Using in-memory credential storage - credentials will be lost on restart!");
        Self {
            challenges: ChallengeStore::new(),
            credentials: CredentialBackend::Memory(DashMap::new()),
        }
    }

    /// Create storage from environment
    ///
    /// Uses PostgreSQL if `DATABASE_URL` is set, otherwise falls back to in-memory.
    pub async fn from_env() -> Result<Self, StorageError> {
        match std::env::var("DATABASE_URL") {
            Ok(url) if !url.is_empty() => {
                tracing::info!("Using PostgreSQL credential storage");
                Self::with_postgres(&url).await
            }
            _ => {
                tracing::warn!("DATABASE_URL not set, using in-memory storage");
                Ok(Self::in_memory())
            }
        }
    }

    /// Check if using persistent storage
    pub fn is_persistent(&self) -> bool {
        matches!(self.credentials, CredentialBackend::Postgres(_))
    }

    /// Check database health (always Ok for memory backend)
    pub async fn check_health(&self) -> Result<(), StorageError> {
        match &self.credentials {
            CredentialBackend::Postgres(pg) => pg.check_health().await,
            CredentialBackend::Memory(_) => Ok(()),
        }
    }

    // ==================== Challenge Methods ====================

    /// Store a registration challenge state
    pub fn store_registration_state(
        &self,
        challenge_id: String,
        state: PasskeyRegistration,
        device_name: Option<String>,
    ) {
        self.challenges
            .store_registration_state(challenge_id, state, device_name);
    }

    /// Retrieve and remove a registration challenge state
    pub fn take_registration_state(
        &self,
        challenge_id: &str,
    ) -> Option<(PasskeyRegistration, Option<String>)> {
        self.challenges.take_registration_state(challenge_id)
    }

    /// Store an authentication challenge state
    pub fn store_authentication_state(
        &self,
        challenge_id: String,
        state: PasskeyAuthentication,
        credential_id: String,
    ) {
        self.challenges
            .store_authentication_state(challenge_id, state, credential_id);
    }

    /// Retrieve and remove an authentication challenge state
    pub fn take_authentication_state(
        &self,
        challenge_id: &str,
    ) -> Option<(PasskeyAuthentication, String)> {
        self.challenges.take_authentication_state(challenge_id)
    }

    // ==================== Credential Methods ====================

    /// Store a registered credential
    pub async fn store_credential(
        &self,
        credential_id: String,
        credential: StoredCredential,
    ) -> Result<(), StorageError> {
        match &self.credentials {
            CredentialBackend::Postgres(pg) => {
                pg.store_credential(
                    &credential_id,
                    &credential.passkey,
                    credential.device_name.as_deref(),
                    &credential.device_attestation,
                )
                .await
            }
            CredentialBackend::Memory(map) => {
                map.insert(credential_id, credential);
                Ok(())
            }
        }
    }

    /// Get a credential by ID
    pub async fn get_credential(
        &self,
        credential_id: &str,
    ) -> Result<Option<StoredCredential>, StorageError> {
        match &self.credentials {
            CredentialBackend::Postgres(pg) => pg.get_credential(credential_id).await,
            CredentialBackend::Memory(map) => Ok(map.get(credential_id).map(|entry| {
                let cred = entry.value();
                StoredCredential {
                    passkey: cred.passkey.clone(),
                    device_attestation: cred.device_attestation.clone(),
                    device_name: cred.device_name.clone(),
                }
            })),
        }
    }

    /// Update a credential's attestation (after authentication)
    pub async fn update_credential_attestation(
        &self,
        credential_id: &str,
        attestation: DeviceAttestation,
        passkey: Passkey,
    ) -> Result<bool, StorageError> {
        match &self.credentials {
            CredentialBackend::Postgres(pg) => {
                pg.update_credential(credential_id, &passkey, attestation.sign_count)
                    .await
            }
            CredentialBackend::Memory(map) => {
                if let Some(mut entry) = map.get_mut(credential_id) {
                    entry.device_attestation = attestation;
                    entry.passkey = passkey;
                    Ok(true)
                } else {
                    Ok(false)
                }
            }
        }
    }

    /// Check if a credential exists
    pub async fn has_credential(&self, credential_id: &str) -> Result<bool, StorageError> {
        match &self.credentials {
            CredentialBackend::Postgres(pg) => pg.has_credential(credential_id).await,
            CredentialBackend::Memory(map) => Ok(map.contains_key(credential_id)),
        }
    }

    // ==================== Maintenance ====================

    /// Remove expired challenge states
    pub fn cleanup_expired(&self) {
        self.challenges.cleanup_expired();
    }

    /// Get storage statistics
    pub async fn stats(&self) -> StorageStats {
        let credentials_count = match &self.credentials {
            CredentialBackend::Postgres(pg) => pg.credential_count().await.unwrap_or(0),
            CredentialBackend::Memory(map) => map.len(),
        };

        StorageStats {
            registration_states: self.challenges.registration_count(),
            authentication_states: self.challenges.authentication_count(),
            credentials: credentials_count,
            persistent: self.is_persistent(),
        }
    }
}

/// Storage statistics for monitoring
#[derive(Debug, Clone)]
pub struct StorageStats {
    pub registration_states: usize,
    pub authentication_states: usize,
    pub credentials: usize,
    pub persistent: bool,
}

impl std::fmt::Debug for WebAuthnStorage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let backend = match &self.credentials {
            CredentialBackend::Postgres(_) => "PostgreSQL",
            CredentialBackend::Memory(_) => "Memory",
        };
        f.debug_struct("WebAuthnStorage")
            .field("backend", &backend)
            .field("challenges", &self.challenges)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_in_memory_storage() {
        let storage = WebAuthnStorage::in_memory();
        assert!(!storage.is_persistent());
    }
}
