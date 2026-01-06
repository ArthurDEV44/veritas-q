//! C2PA error types

use thiserror::Error;

/// Result type for C2PA operations
pub type C2paResult<T> = Result<T, C2paError>;

/// Errors that can occur during C2PA operations
#[derive(Debug, Error)]
pub enum C2paError {
    /// Error from the c2pa crate
    #[error("C2PA error: {0}")]
    C2pa(#[from] c2pa::Error),

    /// IO error
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// OpenSSL error
    #[error("OpenSSL error: {0}")]
    OpenSsl(#[from] openssl::error::ErrorStack),

    /// Missing environment variable
    #[error("Missing environment variable: {0}")]
    MissingEnvVar(&'static str),

    /// Invalid certificate chain
    #[error("Invalid certificate chain: {0}")]
    InvalidCertificate(String),

    /// No Veritas seal found in manifest
    #[error("No Veritas quantum seal assertion found in C2PA manifest")]
    NoVeritasSealFound,

    /// Serialization error
    #[error("Serialization error: {0}")]
    Serialization(String),

    /// Veritas core error
    #[error("Veritas error: {0}")]
    Veritas(#[from] crate::error::VeritasError),
}
