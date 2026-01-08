//! Database module for Veritas Server
//!
//! Contains entities, repositories, and database utilities.

pub mod user;

pub use user::{CreateUser, TrustTier, UpdateUser, User, UserRepository, UserResponse};
