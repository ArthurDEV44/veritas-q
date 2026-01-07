//! In-memory storage for WebAuthn challenge states
//!
//! Challenges are temporary (5 minute expiry) and don't need database persistence.
//! Using in-memory storage provides optimal performance for these short-lived states.

use dashmap::DashMap;
use std::time::{Duration, Instant};
use webauthn_rs::prelude::*;

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

/// In-memory storage for temporary challenge states
#[derive(Default)]
pub struct ChallengeStore {
    /// Pending registration challenges (challenge_id -> state)
    registration_states: DashMap<String, RegistrationStateEntry>,
    /// Pending authentication challenges (challenge_id -> state)
    authentication_states: DashMap<String, AuthStateEntry>,
}

impl ChallengeStore {
    /// Create a new challenge store
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

    /// Remove expired challenge states (called periodically)
    pub fn cleanup_expired(&self) {
        let now = Instant::now();
        self.registration_states
            .retain(|_, entry| entry.expires_at > now);
        self.authentication_states
            .retain(|_, entry| entry.expires_at > now);
    }

    /// Get number of pending registration challenges
    pub fn registration_count(&self) -> usize {
        self.registration_states.len()
    }

    /// Get number of pending authentication challenges
    pub fn authentication_count(&self) -> usize {
        self.authentication_states.len()
    }
}

impl std::fmt::Debug for ChallengeStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ChallengeStore")
            .field("registration_states", &self.registration_states.len())
            .field("authentication_states", &self.authentication_states.len())
            .finish()
    }
}
