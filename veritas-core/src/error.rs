use thiserror::Error;

/// Current seal format version.
pub const CURRENT_SEAL_VERSION: u8 = 1;

/// Maximum allowed seal size in bytes (16KB).
pub const MAX_SEAL_SIZE: usize = 16_384;

#[derive(Error, Debug)]
pub enum VeritasError {
    #[error("QRNG error: {0}")]
    QrngError(String),

    #[error("Signature error: {0}")]
    SignatureError(String),

    #[error("Verification failed: {0}")]
    VerificationFailed(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Invalid seal: {0}")]
    InvalidSeal(String),

    #[error("Entropy timestamp mismatch: entropy={entropy_ts}ms, capture={capture_ts}ms, drift={drift_ms}ms")]
    EntropyTimestampMismatch {
        entropy_ts: u64,
        capture_ts: u64,
        drift_ms: u64,
    },

    #[error("Seal too large: {size} bytes exceeds maximum of {max} bytes")]
    SealTooLarge { size: usize, max: usize },

    #[error("Unsupported seal version: {0} (current: {1})")]
    UnsupportedSealVersion(u8, u8),

    #[error("Invalid timestamp: {reason}")]
    InvalidTimestamp { reason: String },

    #[cfg(feature = "perceptual-hash")]
    #[error("Perceptual hash error: {0}")]
    PerceptualHashError(String),

    #[cfg(feature = "network")]
    #[error("HTTP request error: {0}")]
    HttpError(#[from] reqwest::Error),
}

pub type Result<T> = std::result::Result<T, VeritasError>;
