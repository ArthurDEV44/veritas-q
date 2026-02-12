//! Application state module
//!
//! Defines shared state accessible across all request handlers.

use std::sync::Arc;

use crate::auth::JwksCache;
use crate::db::{SealRepository, UserRepository};
use crate::manifest_store::PostgresManifestStore;

/// Application state containing shared resources.
#[derive(Clone)]
pub struct AppState {
    /// Manifest store for seal storage and resolution
    pub manifest_store: Option<Arc<PostgresManifestStore>>,
    /// User repository for user data
    pub user_repo: Option<Arc<UserRepository>>,
    /// Seal repository for authenticated seal storage
    pub seal_repo: Option<Arc<SealRepository>>,
    /// JWKS cache for Clerk JWT validation
    pub jwks_cache: Option<Arc<JwksCache>>,
    /// Whether mock QRNG is allowed (for testing environments only)
    pub allow_mock_qrng: bool,
}
