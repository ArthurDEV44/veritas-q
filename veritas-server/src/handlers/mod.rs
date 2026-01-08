//! HTTP request handlers
//!
//! This module contains all the request handlers for the API endpoints.

#[cfg(feature = "c2pa")]
pub mod c2pa;
pub mod health;
pub mod resolve;
pub mod seal;
pub mod user;
pub mod verify;

#[cfg(feature = "c2pa")]
pub use c2pa::{c2pa_embed_handler, c2pa_verify_handler, C2paEmbedResponse, C2paVerifyResponse};
pub use health::{health, ready, HealthResponse, ReadyResponse};
pub use resolve::{resolve_handler, AppState, ResolveMatch, ResolveRequest, ResolveResponse};
pub use seal::{seal_handler, SealResponse};
pub use user::{
    delete_user_handler, get_current_user_handler, sync_user_handler, CurrentUserResponse,
    DeleteUserResponse, SyncUserRequest, SyncUserResponse,
};
pub use verify::{verify_handler, VerifyResponse};
