//! Health check handler

/// GET /health - Simple health check endpoint
pub async fn health() -> &'static str {
    "OK"
}
