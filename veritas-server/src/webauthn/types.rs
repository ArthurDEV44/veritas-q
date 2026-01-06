//! WebAuthn request/response types
//!
//! Defines the data structures for WebAuthn API communication.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use webauthn_rs::prelude::*;

/// Request to start device registration
#[derive(Debug, Deserialize, ToSchema)]
pub struct StartRegistrationRequest {
    /// Optional human-readable device name
    #[schema(example = "My iPhone")]
    pub device_name: Option<String>,
}

/// Response containing the registration challenge
#[derive(Debug, Serialize)]
pub struct StartRegistrationResponse {
    /// Challenge ID to track this registration
    pub challenge_id: String,
    /// WebAuthn credential creation options (to be passed to navigator.credentials.create)
    pub public_key: CreationChallengeResponse,
}

/// Request to complete device registration
#[derive(Debug, Deserialize)]
pub struct FinishRegistrationRequest {
    /// Challenge ID from start_registration
    pub challenge_id: String,
    /// WebAuthn credential response from navigator.credentials.create
    pub response: RegisterPublicKeyCredential,
}

/// Request to start device authentication
#[derive(Debug, Deserialize, ToSchema)]
pub struct StartAuthenticationRequest {
    /// Credential ID of the registered device
    #[schema(example = "abc123...")]
    pub credential_id: String,
}

/// Response containing the authentication challenge
#[derive(Debug, Serialize)]
pub struct StartAuthenticationResponse {
    /// Challenge ID to track this authentication
    pub challenge_id: String,
    /// WebAuthn request options (to be passed to navigator.credentials.get)
    pub public_key: RequestChallengeResponse,
}

/// Request to complete device authentication
#[derive(Debug, Deserialize)]
pub struct FinishAuthenticationRequest {
    /// Challenge ID from start_authentication
    pub challenge_id: String,
    /// WebAuthn assertion response from navigator.credentials.get
    pub response: PublicKeyCredential,
}

/// Response containing device attestation
#[derive(Debug, Serialize, ToSchema)]
pub struct DeviceAttestationResponse {
    /// The device attestation to include in seals
    pub device_attestation: DeviceAttestation,
}

/// WebAuthn device attestation for VeritasSeal
///
/// This structure contains cryptographic proof that a capture
/// was made from an authenticated physical device.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DeviceAttestation {
    /// Unique credential identifier (base64url)
    #[schema(example = "abc123def456...")]
    pub credential_id: String,

    /// Type of authenticator used
    pub authenticator_type: AuthenticatorType,

    /// Device model information from FIDO MDS (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_model: Option<DeviceModel>,

    /// WebAuthn attestation format
    pub attestation_format: AttestationFormat,

    /// Unix timestamp when attestation was created
    #[schema(example = 1704067200)]
    pub attested_at: u64,

    /// Sign counter for replay protection
    #[schema(example = 42)]
    pub sign_count: u32,

    /// AAGUID of the authenticator
    #[schema(example = "00000000-0000-0000-0000-000000000000")]
    pub aaguid: String,
}

/// Type of WebAuthn authenticator
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum AuthenticatorType {
    /// Platform authenticator (TouchID, FaceID, Windows Hello)
    Platform,
    /// Roaming/cross-platform authenticator (YubiKey, etc.)
    CrossPlatform,
}

/// WebAuthn attestation statement format
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum AttestationFormat {
    /// Standard packed format
    Packed,
    /// TPM attestation (Windows)
    Tpm,
    /// Android Key attestation (hardware-backed)
    AndroidKey,
    /// Android SafetyNet (legacy, deprecated 2025)
    AndroidSafetyNet,
    /// Apple attestation
    Apple,
    /// FIDO U2F
    FidoU2f,
    /// None (self-attestation)
    #[default]
    None,
}

/// Device model information from FIDO Metadata Service
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DeviceModel {
    /// AAGUID from FIDO MDS
    #[schema(example = "00000000-0000-0000-0000-000000000000")]
    pub aaguid: String,

    /// Human-readable description
    #[schema(example = "Apple Touch ID")]
    pub description: String,

    /// Device manufacturer
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(example = "Apple")]
    pub vendor: Option<String>,

    /// Security certification level
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(example = "FIDO_CERTIFIED_L1")]
    pub certification_level: Option<String>,
}

impl DeviceAttestation {
    /// Check if this attestation is recent (within max_age_secs)
    pub fn is_fresh(&self, max_age_secs: u64) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        now.saturating_sub(self.attested_at) <= max_age_secs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_attestation_freshness() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let fresh_attestation = DeviceAttestation {
            credential_id: "test".to_string(),
            authenticator_type: AuthenticatorType::Platform,
            device_model: None,
            attestation_format: AttestationFormat::None,
            attested_at: now,
            sign_count: 0,
            aaguid: "00000000-0000-0000-0000-000000000000".to_string(),
        };

        assert!(fresh_attestation.is_fresh(300));

        let stale_attestation = DeviceAttestation {
            attested_at: now - 600, // 10 minutes ago
            ..fresh_attestation.clone()
        };

        assert!(!stale_attestation.is_fresh(300));
    }

    #[test]
    fn test_attestation_format_serialization() {
        let format = AttestationFormat::Packed;
        let json = serde_json::to_string(&format).unwrap();
        assert_eq!(json, "\"packed\"");
    }
}
