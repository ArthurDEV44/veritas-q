//! Veritas Server Library - REST API components for quantum-authenticated media sealing
//!
//! This library exposes the server components for use in integration tests.
//! The main binary uses these same components.

pub mod config;
pub mod error;
pub mod handlers;
pub mod openapi;
pub mod routes;
pub mod validation;
pub mod webauthn;

pub use config::Config;
pub use error::ApiError;
pub use openapi::ApiDoc;
pub use routes::{create_router, create_router_with_config, create_router_with_config_sync};
pub use webauthn::{DeviceAttestation, StorageError, WebAuthnConfig, WebAuthnStorage};
