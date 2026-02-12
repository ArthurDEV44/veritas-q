//! API error handling module
//!
//! Provides a unified error type for all API endpoints with structured error variants.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use thiserror::Error;

/// API error type with structured variants for different error categories
#[derive(Debug, Error)]
pub enum ApiError {
    /// Bad request - client provided invalid input
    #[error("Bad request: {0}")]
    BadRequest(String),

    /// Unauthorized - missing or invalid authentication
    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    /// Not found - requested resource does not exist
    #[error("Not found: {0}")]
    NotFound(String),

    /// Request timeout - operation took too long
    #[error("Request timeout: {0}")]
    Timeout(String),

    /// Internal server error - unexpected server-side failure
    #[error("Internal error: {0}")]
    Internal(String),

    /// Service unavailable - required service is not configured or available
    #[error("Service unavailable: {0}")]
    ServiceUnavailable(String),

    /// Authentication error with specific error code
    #[error("{message}")]
    AuthError { message: String, code: String },

    /// Veritas core error - error from the cryptographic library
    #[error("Veritas error: {0}")]
    Veritas(#[from] veritas_core::VeritasError),
}

impl ApiError {
    /// Create a bad request error
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::BadRequest(message.into())
    }

    /// Create an unauthorized error
    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::Unauthorized(message.into())
    }

    /// Create a not found error
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound(message.into())
    }

    /// Create an internal server error
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal(message.into())
    }

    /// Create a timeout error
    pub fn timeout(message: impl Into<String>) -> Self {
        Self::Timeout(message.into())
    }

    /// Create a service unavailable error
    pub fn service_unavailable(message: impl Into<String>) -> Self {
        Self::ServiceUnavailable(message.into())
    }

    /// Create an authentication error with a specific error code
    pub fn auth_error(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::AuthError {
            message: message.into(),
            code: code.into(),
        }
    }

    /// Get the HTTP status code for this error
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Unauthorized(_) | Self::AuthError { .. } => StatusCode::UNAUTHORIZED,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Timeout(_) => StatusCode::REQUEST_TIMEOUT,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::ServiceUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            Self::Veritas(ref e) => match e {
                // External service failures → 503
                veritas_core::VeritasError::QrngError(_)
                | veritas_core::VeritasError::HttpError(_) => StatusCode::SERVICE_UNAVAILABLE,

                // Verification failures → 422 Unprocessable Entity
                veritas_core::VeritasError::VerificationFailed(_)
                | veritas_core::VeritasError::EntropyTimestampMismatch { .. } => {
                    StatusCode::UNPROCESSABLE_ENTITY
                }

                // Client-provided invalid input → 400
                veritas_core::VeritasError::InvalidSeal(_)
                | veritas_core::VeritasError::UnsupportedSealVersion(_, _)
                | veritas_core::VeritasError::SealTooLarge { .. }
                | veritas_core::VeritasError::InvalidTimestamp { .. } => StatusCode::BAD_REQUEST,

                // Internal processing failures → 500
                veritas_core::VeritasError::SignatureError(_)
                | veritas_core::VeritasError::SerializationError(_)
                | veritas_core::VeritasError::PerceptualHashError(_) => {
                    StatusCode::INTERNAL_SERVER_ERROR
                }
            },
        }
    }

    /// Get the error code for programmatic error handling
    fn error_code(&self) -> &'static str {
        match self {
            Self::BadRequest(_) => "INVALID_INPUT",
            Self::Unauthorized(_) => "UNAUTHORIZED",
            Self::AuthError { .. } => "AUTH_ERROR",
            Self::NotFound(_) => "NOT_FOUND",
            Self::Timeout(_) => "TIMEOUT",
            Self::Internal(_) => "INTERNAL_ERROR",
            Self::ServiceUnavailable(_) => "SERVICE_UNAVAILABLE",
            Self::Veritas(ref e) => match e {
                veritas_core::VeritasError::QrngError(_) => "QRNG_UNAVAILABLE",
                veritas_core::VeritasError::HttpError(_) => "UPSTREAM_ERROR",
                veritas_core::VeritasError::VerificationFailed(_) => "VERIFICATION_FAILED",
                veritas_core::VeritasError::EntropyTimestampMismatch { .. } => {
                    "ENTROPY_TIMESTAMP_MISMATCH"
                }
                veritas_core::VeritasError::InvalidSeal(_) => "INVALID_SEAL",
                veritas_core::VeritasError::UnsupportedSealVersion(_, _) => {
                    "UNSUPPORTED_SEAL_VERSION"
                }
                veritas_core::VeritasError::SealTooLarge { .. } => "SEAL_TOO_LARGE",
                veritas_core::VeritasError::InvalidTimestamp { .. } => "INVALID_TIMESTAMP",
                veritas_core::VeritasError::SignatureError(_) => "SIGNATURE_ERROR",
                veritas_core::VeritasError::SerializationError(_) => "SERIALIZATION_ERROR",
                veritas_core::VeritasError::PerceptualHashError(_) => "PERCEPTUAL_HASH_ERROR",
            },
        }
    }

    /// Get sanitized error message for client response
    fn client_message(&self) -> String {
        match self {
            // For Veritas errors, sanitize internal details
            Self::Veritas(ref e) => match e {
                veritas_core::VeritasError::QrngError(_) => "QRNG service unavailable".to_string(),
                veritas_core::VeritasError::HttpError(_) => "Upstream service error".to_string(),
                veritas_core::VeritasError::VerificationFailed(_) => {
                    "Seal verification failed".to_string()
                }
                veritas_core::VeritasError::EntropyTimestampMismatch { .. } => {
                    "Entropy timestamp does not match capture time".to_string()
                }
                veritas_core::VeritasError::InvalidSeal(_) => "Invalid seal format".to_string(),
                veritas_core::VeritasError::UnsupportedSealVersion(v, current) => {
                    format!("Unsupported seal version {} (current: {})", v, current)
                }
                veritas_core::VeritasError::SealTooLarge { size, max } => {
                    format!("Seal size {} bytes exceeds maximum of {} bytes", size, max)
                }
                veritas_core::VeritasError::InvalidTimestamp { .. } => {
                    "Invalid timestamp".to_string()
                }
                veritas_core::VeritasError::SignatureError(_) => {
                    "Signature operation failed".to_string()
                }
                veritas_core::VeritasError::SerializationError(_) => {
                    "Seal serialization error".to_string()
                }
                veritas_core::VeritasError::PerceptualHashError(_) => {
                    "Perceptual hash computation failed".to_string()
                }
            },
            // For other errors, use the Display message
            _ => self.to_string(),
        }
    }

    /// Get the error category for logging
    fn error_category(&self) -> &'static str {
        match self {
            Self::BadRequest(_) => "bad_request",
            Self::Unauthorized(_) => "unauthorized",
            Self::AuthError { .. } => "auth_error",
            Self::NotFound(_) => "not_found",
            Self::Timeout(_) => "timeout",
            Self::Internal(_) => "internal",
            Self::ServiceUnavailable(_) => "service_unavailable",
            Self::Veritas(_) => "veritas",
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let category = self.error_category();
        let code = self.error_code();
        let internal_message = self.to_string();
        let client_message = self.client_message();

        // Log based on severity, always including internal details
        match &self {
            Self::BadRequest(_) | Self::NotFound(_) => {
                tracing::warn!(
                    status = %status,
                    category = category,
                    code = code,
                    error = %internal_message,
                    "Client error"
                );
            }
            Self::Unauthorized(_) | Self::AuthError { .. } => {
                tracing::warn!(
                    status = %status,
                    category = category,
                    code = code,
                    error = %internal_message,
                    "Authentication error"
                );
            }
            Self::ServiceUnavailable(_) => {
                tracing::warn!(
                    status = %status,
                    category = category,
                    code = code,
                    error = %internal_message,
                    "Service unavailable"
                );
            }
            Self::Timeout(_) | Self::Internal(_) => {
                tracing::error!(
                    status = %status,
                    category = category,
                    code = code,
                    error = %internal_message,
                    "Server error"
                );
            }
            // For Veritas errors, log full internal details
            Self::Veritas(_) => {
                tracing::error!(
                    status = %status,
                    category = category,
                    code = code,
                    error = %internal_message,
                    client_message = %client_message,
                    "Veritas error (internal details logged)"
                );
            }
        }

        // All error responses include a `code` field for programmatic error handling
        let body = serde_json::json!({
            "error": client_message,
            "code": code,
        });

        (status, Json(body)).into_response()
    }
}
