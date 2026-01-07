//! WebAuthn HTTP endpoint handlers
//!
//! Implements the registration and authentication flows for device attestation.

use axum::{extract::State, Json};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use super::mds::lookup_device_model;
use super::storage::{StoredCredential, WebAuthnStorage};
use super::types::{
    AttestationFormat, AuthenticatorType, DeviceAttestation, DeviceAttestationResponse,
    FinishAuthenticationRequest, FinishRegistrationRequest, StartAuthenticationRequest,
    StartAuthenticationResponse, StartRegistrationRequest, StartRegistrationResponse,
};
use super::WebAuthnConfig;
use crate::error::ApiError;

/// Application state containing WebAuthn configuration and storage
pub struct WebAuthnState {
    pub config: WebAuthnConfig,
    pub storage: WebAuthnStorage,
}

impl WebAuthnState {
    /// Create a new WebAuthn state from environment
    ///
    /// Uses PostgreSQL storage if DATABASE_URL is set, otherwise falls back to in-memory.
    pub async fn from_env() -> Result<Self, ApiError> {
        let config = WebAuthnConfig::from_env().map_err(|e| {
            ApiError::internal(format!("Failed to create WebAuthn config: {:?}", e))
        })?;

        let storage = WebAuthnStorage::from_env().await.map_err(|e| {
            ApiError::internal(format!("Failed to create WebAuthn storage: {:?}", e))
        })?;

        Ok(Self { config, storage })
    }

    /// Create with in-memory storage (for testing)
    pub fn in_memory(config: WebAuthnConfig) -> Self {
        Self {
            config,
            storage: WebAuthnStorage::in_memory(),
        }
    }
}

/// POST /webauthn/register/start
///
/// Start WebAuthn registration to create a new device credential.
/// Returns a challenge that must be signed by the authenticator.
#[utoipa::path(
    post,
    path = "/webauthn/register/start",
    tag = "WebAuthn",
    request_body = StartRegistrationRequest,
    responses(
        (status = 200, description = "Registration challenge created (JSON with challenge_id and public_key options)"),
        (status = 500, description = "Failed to generate challenge")
    )
)]
pub async fn start_registration(
    State(state): State<Arc<WebAuthnState>>,
    Json(req): Json<StartRegistrationRequest>,
) -> Result<Json<StartRegistrationResponse>, ApiError> {
    let user_id = uuid::Uuid::new_v4();
    let user_name = req
        .device_name
        .clone()
        .unwrap_or_else(|| "Veritas Device".to_string());

    // Start passkey registration with webauthn-rs
    let (ccr, reg_state) = state
        .config
        .webauthn()
        .start_passkey_registration(user_id, &user_name, &user_name, None)
        .map_err(|e| ApiError::internal(format!("Failed to start registration: {:?}", e)))?;

    let challenge_id = user_id.to_string();

    // Store registration state
    state
        .storage
        .store_registration_state(challenge_id.clone(), reg_state, req.device_name);

    tracing::info!(challenge_id = %challenge_id, "WebAuthn registration started");

    Ok(Json(StartRegistrationResponse {
        challenge_id,
        public_key: ccr,
    }))
}

/// POST /webauthn/register/finish
///
/// Complete WebAuthn registration with the authenticator's response.
/// Returns device attestation for use in seals.
///
/// Request body contains the WebAuthn `RegisterPublicKeyCredential` from the browser.
#[utoipa::path(
    post,
    path = "/webauthn/register/finish",
    tag = "WebAuthn",
    request_body(content_type = "application/json", description = "WebAuthn registration response from browser"),
    responses(
        (status = 200, description = "Registration completed", body = DeviceAttestationResponse),
        (status = 400, description = "Invalid challenge or response"),
        (status = 500, description = "Registration failed")
    )
)]
pub async fn finish_registration(
    State(state): State<Arc<WebAuthnState>>,
    Json(req): Json<FinishRegistrationRequest>,
) -> Result<Json<DeviceAttestationResponse>, ApiError> {
    // Retrieve registration state
    let (reg_state, device_name) = state
        .storage
        .take_registration_state(&req.challenge_id)
        .ok_or_else(|| ApiError::bad_request("Invalid or expired challenge"))?;

    // Complete registration
    let passkey = state
        .config
        .webauthn()
        .finish_passkey_registration(&req.response, &reg_state)
        .map_err(|e| ApiError::bad_request(format!("Registration failed: {:?}", e)))?;

    // Extract credential ID using the public method
    let credential_id = base64_url_encode(passkey.cred_id());

    // For AAGUID, we'll use a placeholder since the field is private
    // In a production implementation, we'd need to parse the attestation object
    let aaguid = "00000000-0000-0000-0000-000000000000".to_string();

    // Lookup device model from FIDO MDS (best effort)
    let device_model = lookup_device_model(&aaguid).await.ok();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let device_attestation = DeviceAttestation {
        credential_id: credential_id.clone(),
        authenticator_type: AuthenticatorType::Platform,
        device_model,
        attestation_format: AttestationFormat::None,
        attested_at: now,
        sign_count: 0, // Initial registration has counter 0
        aaguid,
    };

    // Store credential
    state
        .storage
        .store_credential(
            credential_id.clone(),
            StoredCredential {
                passkey,
                device_attestation: device_attestation.clone(),
                device_name,
            },
        )
        .await
        .map_err(|e| ApiError::internal(format!("Failed to store credential: {:?}", e)))?;

    tracing::info!(credential_id = %credential_id, "WebAuthn registration completed");

    Ok(Json(DeviceAttestationResponse { device_attestation }))
}

/// POST /webauthn/authenticate/start
///
/// Start WebAuthn authentication for an existing device.
/// Returns a challenge that must be signed by the authenticator.
#[utoipa::path(
    post,
    path = "/webauthn/authenticate/start",
    tag = "WebAuthn",
    request_body = StartAuthenticationRequest,
    responses(
        (status = 200, description = "Authentication challenge created (JSON with challenge_id and public_key options)"),
        (status = 404, description = "Credential not found"),
        (status = 500, description = "Failed to generate challenge")
    )
)]
pub async fn start_authentication(
    State(state): State<Arc<WebAuthnState>>,
    Json(req): Json<StartAuthenticationRequest>,
) -> Result<Json<StartAuthenticationResponse>, ApiError> {
    // Get stored credential
    let stored = state
        .storage
        .get_credential(&req.credential_id)
        .await
        .map_err(|e| ApiError::internal(format!("Storage error: {:?}", e)))?
        .ok_or_else(|| ApiError::bad_request("Credential not found"))?;

    // Start authentication
    let (rcr, auth_state) = state
        .config
        .webauthn()
        .start_passkey_authentication(&[stored.passkey])
        .map_err(|e| ApiError::internal(format!("Failed to start authentication: {:?}", e)))?;

    let challenge_id = uuid::Uuid::new_v4().to_string();

    // Store authentication state
    state.storage.store_authentication_state(
        challenge_id.clone(),
        auth_state,
        req.credential_id.clone(),
    );

    tracing::info!(
        challenge_id = %challenge_id,
        credential_id = %req.credential_id,
        "WebAuthn authentication started"
    );

    Ok(Json(StartAuthenticationResponse {
        challenge_id,
        public_key: rcr,
    }))
}

/// POST /webauthn/authenticate/finish
///
/// Complete WebAuthn authentication with the authenticator's response.
/// Returns fresh device attestation for use in seals.
///
/// Request body contains the WebAuthn `PublicKeyCredential` assertion from the browser.
#[utoipa::path(
    post,
    path = "/webauthn/authenticate/finish",
    tag = "WebAuthn",
    request_body(content_type = "application/json", description = "WebAuthn authentication assertion from browser"),
    responses(
        (status = 200, description = "Authentication completed", body = DeviceAttestationResponse),
        (status = 400, description = "Invalid challenge or response"),
        (status = 500, description = "Authentication failed")
    )
)]
pub async fn finish_authentication(
    State(state): State<Arc<WebAuthnState>>,
    Json(req): Json<FinishAuthenticationRequest>,
) -> Result<Json<DeviceAttestationResponse>, ApiError> {
    // Retrieve authentication state
    let (auth_state, credential_id) = state
        .storage
        .take_authentication_state(&req.challenge_id)
        .ok_or_else(|| ApiError::bad_request("Invalid or expired challenge"))?;

    // Get stored credential for updating
    let stored = state
        .storage
        .get_credential(&credential_id)
        .await
        .map_err(|e| ApiError::internal(format!("Storage error: {:?}", e)))?
        .ok_or_else(|| ApiError::bad_request("Credential not found"))?;

    // Complete authentication
    let auth_result = state
        .config
        .webauthn()
        .finish_passkey_authentication(&req.response, &auth_state)
        .map_err(|e| ApiError::bad_request(format!("Authentication failed: {:?}", e)))?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Update attestation with fresh timestamp and counter
    let mut device_attestation = stored.device_attestation.clone();
    device_attestation.attested_at = now;
    device_attestation.sign_count = auth_result.counter();

    // Update stored credential
    let mut updated_passkey = stored.passkey.clone();
    updated_passkey.update_credential(&auth_result);

    state
        .storage
        .update_credential_attestation(&credential_id, device_attestation.clone(), updated_passkey)
        .await
        .map_err(|e| ApiError::internal(format!("Failed to update credential: {:?}", e)))?;

    tracing::info!(
        credential_id = %credential_id,
        sign_count = auth_result.counter(),
        "WebAuthn authentication completed"
    );

    Ok(Json(DeviceAttestationResponse { device_attestation }))
}

/// Base64url encode bytes
fn base64_url_encode(bytes: &[u8]) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    URL_SAFE_NO_PAD.encode(bytes)
}
