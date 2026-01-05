use thiserror::Error;

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

    #[error("Entropy timestamp mismatch: entropy={entropy_ts}, capture={capture_ts}")]
    EntropyTimestampMismatch { entropy_ts: u64, capture_ts: u64 },

    #[error("HTTP request error: {0}")]
    HttpError(#[from] reqwest::Error),
}

pub type Result<T> = std::result::Result<T, VeritasError>;
