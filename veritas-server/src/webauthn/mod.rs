//! WebAuthn/FIDO2 device attestation module for Veritas Q
//!
//! This module provides WebAuthn-based device attestation to cryptographically
//! verify that captures originate from authenticated physical devices.
//!
//! ## Architecture
//!
//! - `config`: WebAuthn Relying Party configuration
//! - `handlers`: HTTP endpoint handlers for registration/authentication
//! - `storage`: In-memory storage for credentials and challenge states
//! - `types`: Request/response types for the WebAuthn API
//! - `mds`: FIDO Metadata Service integration for device model lookup

mod config;
pub mod handlers;
mod mds;
mod storage;
mod types;

pub use config::WebAuthnConfig;
pub use handlers::{
    finish_authentication, finish_registration, start_authentication, start_registration,
    WebAuthnState,
};
pub use storage::WebAuthnStorage;
pub use types::{
    AttestationFormat, AuthenticatorType, DeviceAttestation, DeviceAttestationResponse,
    DeviceModel, FinishAuthenticationRequest, FinishRegistrationRequest,
    StartAuthenticationRequest, StartRegistrationRequest,
};
