//! Health check handlers
//!
//! Provides health and readiness endpoints for monitoring and orchestration.

use axum::Json;
use serde::Serialize;
use veritas_core::AnuQrng;

/// Health check response
#[derive(Serialize)]
pub struct HealthResponse {
    /// Service status: "healthy" or "degraded"
    pub status: &'static str,
    /// Server version from Cargo.toml
    pub version: &'static str,
    /// Whether QRNG service is available
    pub qrng_available: bool,
    /// Service name
    pub service: &'static str,
}

/// GET /health - Health check endpoint
///
/// Returns JSON with service status, version, and QRNG availability.
/// Used for monitoring and load balancer health checks.
pub async fn health() -> Json<HealthResponse> {
    // Check if QRNG is available (non-blocking check)
    let qrng_available = AnuQrng::new().is_ok();

    let status = if qrng_available {
        "healthy"
    } else {
        "degraded"
    };

    Json(HealthResponse {
        status,
        version: env!("CARGO_PKG_VERSION"),
        qrng_available,
        service: "veritas-server",
    })
}

/// Readiness response for Kubernetes
#[derive(Serialize)]
pub struct ReadyResponse {
    /// Whether the service is ready to accept traffic
    pub ready: bool,
    /// Optional message explaining status
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<&'static str>,
}

/// GET /ready - Kubernetes readiness probe
///
/// Returns 200 if the service is ready to accept traffic.
/// Unlike /health, this is a simple yes/no check.
pub async fn ready() -> Json<ReadyResponse> {
    Json(ReadyResponse {
        ready: true,
        message: None,
    })
}
