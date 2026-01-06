//! In-memory storage for WebAuthn credentials and challenge states
//!
//! Provides thread-safe storage for:
//! - Registration challenge states (temporary, expires after 5 minutes)
//! - Authentication challenge states (temporary, expires after 5 minutes)
//! - Registered device credentials (persistent during server lifetime)

use dashmap::DashMap;
use std::time::{Duration, Instant};
use webauthn_rs::prelude::*;

use super::types::DeviceAttestation;

/// Maximum age for challenge states (5 minutes)
const CHALLENGE_EXPIRY_SECS: u64 = 300;

/// Registration state entry with expiration
pub struct RegistrationStateEntry {
    pub state: PasskeyRegistration,
    pub expires_at: Instant,
    pub device_name: Option<String>,
}

/// Authentication state entry with expiration
pub struct AuthStateEntry {
    pub state: PasskeyAuthentication,
    pub expires_at: Instant,
    pub credential_id: String,
}

/// Stored credential with attestation
pub struct StoredCredential {
    pub passkey: Passkey,
    pub device_attestation: DeviceAttestation,
    pub device_name: Option<String>,
}

/// Thread-safe in-memory storage for WebAuthn data
#[derive(Default)]
pub struct WebAuthnStorage {
    /// Pending registration challenges (challenge_id -> state)
    registration_states: DashMap<String, RegistrationStateEntry>,
    /// Pending authentication challenges (challenge_id -> state)
    authentication_states: DashMap<String, AuthStateEntry>,
    /// Registered credentials (credential_id -> credential)
    credentials: DashMap<String, StoredCredential>,
}

impl WebAuthnStorage {
    /// Create a new storage instance
    pub fn new() -> Self {
        Self::default()
    }

    /// Store a registration challenge state
    pub fn store_registration_state(
        &self,
        challenge_id: String,
        state: PasskeyRegistration,
        device_name: Option<String>,
    ) {
        self.registration_states.insert(
            challenge_id,
            RegistrationStateEntry {
                state,
                expires_at: Instant::now() + Duration::from_secs(CHALLENGE_EXPIRY_SECS),
                device_name,
            },
        );
    }

    /// Retrieve and remove a registration challenge state
    pub fn take_registration_state(
        &self,
        challenge_id: &str,
    ) -> Option<(PasskeyRegistration, Option<String>)> {
        let (_, entry) = self.registration_states.remove(challenge_id)?;
        if entry.expires_at > Instant::now() {
            Some((entry.state, entry.device_name))
        } else {
            None // Expired
        }
    }

    /// Store an authentication challenge state
    pub fn store_authentication_state(
        &self,
        challenge_id: String,
        state: PasskeyAuthentication,
        credential_id: String,
    ) {
        self.authentication_states.insert(
            challenge_id,
            AuthStateEntry {
                state,
                expires_at: Instant::now() + Duration::from_secs(CHALLENGE_EXPIRY_SECS),
                credential_id,
            },
        );
    }

    /// Retrieve and remove an authentication challenge state
    pub fn take_authentication_state(
        &self,
        challenge_id: &str,
    ) -> Option<(PasskeyAuthentication, String)> {
        let (_, entry) = self.authentication_states.remove(challenge_id)?;
        if entry.expires_at > Instant::now() {
            Some((entry.state, entry.credential_id))
        } else {
            None // Expired
        }
    }

    /// Store a registered credential
    pub fn store_credential(&self, credential_id: String, credential: StoredCredential) {
        self.credentials.insert(credential_id, credential);
    }

    /// Get a credential by ID
    pub fn get_credential(&self, credential_id: &str) -> Option<StoredCredential> {
        self.credentials.get(credential_id).map(|entry| {
            let cred = entry.value();
            StoredCredential {
                passkey: cred.passkey.clone(),
                device_attestation: cred.device_attestation.clone(),
                device_name: cred.device_name.clone(),
            }
        })
    }

    /// Update a credential's attestation (after authentication)
    pub fn update_credential_attestation(
        &self,
        credential_id: &str,
        attestation: DeviceAttestation,
        passkey: Passkey,
    ) -> bool {
        if let Some(mut entry) = self.credentials.get_mut(credential_id) {
            entry.device_attestation = attestation;
            entry.passkey = passkey;
            true
        } else {
            false
        }
    }

    /// Check if a credential exists
    pub fn has_credential(&self, credential_id: &str) -> bool {
        self.credentials.contains_key(credential_id)
    }

    /// Remove expired challenge states (called periodically)
    pub fn cleanup_expired(&self) {
        let now = Instant::now();

        self.registration_states
            .retain(|_, entry| entry.expires_at > now);
        self.authentication_states
            .retain(|_, entry| entry.expires_at > now);
    }

    /// Get statistics for monitoring
    pub fn stats(&self) -> StorageStats {
        StorageStats {
            registration_states: self.registration_states.len(),
            authentication_states: self.authentication_states.len(),
            credentials: self.credentials.len(),
        }
    }
}

/// Storage statistics for monitoring
#[derive(Debug, Clone)]
pub struct StorageStats {
    pub registration_states: usize,
    pub authentication_states: usize,
    pub credentials: usize,
}

impl std::fmt::Debug for WebAuthnStorage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let stats = self.stats();
        f.debug_struct("WebAuthnStorage")
            .field("registration_states", &stats.registration_states)
            .field("authentication_states", &stats.authentication_states)
            .field("credentials", &stats.credentials)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_storage_stats() {
        let storage = WebAuthnStorage::new();
        let stats = storage.stats();
        assert_eq!(stats.registration_states, 0);
        assert_eq!(stats.authentication_states, 0);
        assert_eq!(stats.credentials, 0);
    }
}
