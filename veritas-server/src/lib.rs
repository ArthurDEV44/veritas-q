//! Veritas Server Library - REST API components for quantum-authenticated media sealing
//!
//! This library exposes the server components for use in integration tests.
//! The main binary uses these same components.

pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod handlers;
pub mod manifest_store;
pub mod multipart;
pub mod openapi;
pub mod routes;
pub mod state;
pub mod validation;
pub mod webauthn;

pub use auth::{AuthenticatedUser, JwksCache, JwtClaims, OptionalAuth};
pub use config::Config;
pub use db::{
    CreateSeal, CreateUser, DeviceInfo, Seal, SealListParams, SealListResponse, SealLocation,
    SealMetadata, SealRecord, SealRepository, TrustTier, UpdateUser, User, UserRepository,
    UserResponse,
};
pub use error::ApiError;
pub use manifest_store::{
    ManifestInput, ManifestRecord, ManifestStoreError, PostgresManifestStore, SimilarityMatch,
};
pub use openapi::ApiDoc;
pub use routes::{create_router, create_router_with_config, create_router_with_config_sync};
pub use webauthn::{DeviceAttestation, StorageError, WebAuthnConfig, WebAuthnStorage};
