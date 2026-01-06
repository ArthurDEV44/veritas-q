//! Health check handlers
//!
//! Provides health and readiness endpoints for monitoring and orchestration.

use axum::Json;
use serde::Serialize;
use utoipa::ToSchema;
use veritas_core::AnuQrng;

/// Health check response
#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    /// Service status: "healthy" or "degraded"
    #[schema(example = "healthy")]
    pub status: &'static str,
    /// Server version from Cargo.toml
    #[schema(example = "0.1.0")]
    pub version: &'static str,
    /// Whether QRNG service is available
    #[schema(example = true)]
    pub qrng_available: bool,
    /// Service name
    #[schema(example = "veritas-server")]
    pub service: &'static str,
}

/// Health check endpoint
///
/// Returns JSON with service status, version, and QRNG availability.
/// Used for monitoring and load balancer health checks.
#[utoipa::path(
    get,
    path = "/health",
    tag = "Health",
    responses(
        (status = 200, description = "Service health status", body = HealthResponse)
    )
)]
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
#[derive(Serialize, ToSchema)]
pub struct ReadyResponse {
    /// Whether the service is ready to accept traffic
    #[schema(example = true)]
    pub ready: bool,
    /// Optional message explaining status
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<&'static str>,
}

/// Kubernetes readiness probe
///
/// Returns 200 if the service is ready to accept traffic.
/// Unlike /health, this is a simple yes/no check.
#[utoipa::path(
    get,
    path = "/ready",
    tag = "Health",
    responses(
        (status = 200, description = "Service is ready", body = ReadyResponse)
    )
)]
pub async fn ready() -> Json<ReadyResponse> {
    Json(ReadyResponse {
        ready: true,
        message: None,
    })
}
