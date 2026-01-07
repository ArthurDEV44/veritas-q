//! Error types for the manifest store module.

use thiserror::Error;

/// Errors that can occur when interacting with the manifest store.
#[derive(Debug, Error)]
pub enum ManifestStoreError {
    /// Database connection failed
    #[error("Database connection error: {0}")]
    Connection(String),

    /// Migration execution failed
    #[error("Migration error: {0}")]
    Migration(String),

    /// SQL query execution failed
    #[error("Query error: {0}")]
    Query(String),

    /// Requested manifest was not found
    #[error("Manifest not found")]
    NotFound,

    /// Serialization/deserialization error
    #[error("Serialization error: {0}")]
    Serialization(String),

    /// Invalid input provided
    #[error("Invalid input: {0}")]
    InvalidInput(String),
}

impl From<sqlx::Error> for ManifestStoreError {
    fn from(e: sqlx::Error) -> Self {
        Self::Query(e.to_string())
    }
}

impl From<sqlx::migrate::MigrateError> for ManifestStoreError {
    fn from(e: sqlx::migrate::MigrateError) -> Self {
        Self::Migration(e.to_string())
    }
}
