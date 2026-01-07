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

    /// Request timeout - operation took too long
    #[error("Request timeout: {0}")]
    Timeout(String),

    /// Internal server error - unexpected server-side failure
    #[error("Internal error: {0}")]
    Internal(String),

    /// Service unavailable - required service is not configured or available
    #[error("Service unavailable: {0}")]
    ServiceUnavailable(String),

    /// Veritas core error - error from the cryptographic library
    #[error("Veritas error: {0}")]
    Veritas(#[from] veritas_core::VeritasError),
}

impl ApiError {
    /// Create a bad request error
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::BadRequest(message.into())
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

    /// Get the HTTP status code for this error
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Timeout(_) => StatusCode::REQUEST_TIMEOUT,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::ServiceUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            Self::Veritas(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    /// Get the error category for logging
    fn error_category(&self) -> &'static str {
        match self {
            Self::BadRequest(_) => "bad_request",
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
        let message = self.to_string();

        // Log based on severity
        match &self {
            Self::BadRequest(_) => {
                tracing::warn!(
                    status = %status,
                    category = category,
                    error = %message,
                    "Client error"
                );
            }
            Self::ServiceUnavailable(_) => {
                tracing::warn!(
                    status = %status,
                    category = category,
                    error = %message,
                    "Service unavailable"
                );
            }
            Self::Timeout(_) | Self::Internal(_) | Self::Veritas(_) => {
                tracing::error!(
                    status = %status,
                    category = category,
                    error = %message,
                    "Server error"
                );
            }
        }

        let body = serde_json::json!({
            "error": message,
            "category": category
        });

        (status, Json(body)).into_response()
    }
}
