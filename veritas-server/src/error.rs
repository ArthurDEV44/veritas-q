//! API error handling module
//!
//! Provides a unified error type for all API endpoints.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};

/// API error type for handling errors in request handlers
#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
}

impl ApiError {
    /// Create a new API error with the given status and message
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }

    /// Create a bad request error
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    /// Create an internal server error
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, message)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        tracing::error!(status = %self.status, error = %self.message, "API error");
        let body = serde_json::json!({
            "error": self.message
        });
        (self.status, Json(body)).into_response()
    }
}

impl From<veritas_core::VeritasError> for ApiError {
    fn from(err: veritas_core::VeritasError) -> Self {
        ApiError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: err.to_string(),
        }
    }
}
