//! HTTP request handlers
//!
//! This module contains all the request handlers for the API endpoints.

#[cfg(feature = "c2pa")]
pub mod c2pa;
pub mod health;
pub mod resolve;
pub mod seal;
pub mod seals;
pub mod user;
pub mod verify;

pub use crate::state::AppState;
#[cfg(feature = "c2pa")]
pub use c2pa::{c2pa_embed_handler, c2pa_verify_handler, C2paEmbedResponse, C2paVerifyResponse};
pub use health::{health, ready, HealthResponse, ReadyResponse};
pub use resolve::{resolve_handler, ResolveMatch, ResolveRequest, ResolveResponse};
pub use seal::{seal_handler, SealResponse};
pub use seals::{
    export_seal_handler, get_user_seal_handler, list_user_seals_handler, C2paExportResponse,
    ExportFormat, ExportResponse, ExportSealQuery, JsonExportResponse, SealDetailResponse,
};
pub use user::{
    delete_user_handler, get_current_user_handler, sync_user_handler, CurrentUserResponse,
    DeleteUserResponse, SyncUserRequest, SyncUserResponse,
};
pub use verify::{verify_handler, VerifyResponse};
