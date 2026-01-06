//! HTTP request handlers
//!
//! This module contains all the request handlers for the API endpoints.

#[cfg(feature = "c2pa")]
pub mod c2pa;
pub mod health;
pub mod seal;
pub mod verify;

#[cfg(feature = "c2pa")]
pub use c2pa::{c2pa_embed_handler, c2pa_verify_handler, C2paEmbedResponse, C2paVerifyResponse};
pub use health::{health, ready, HealthResponse, ReadyResponse};
pub use seal::{seal_handler, SealResponse};
pub use verify::{verify_handler, VerifyResponse};
