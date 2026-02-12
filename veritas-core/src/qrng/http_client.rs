//! Generic QRNG HTTP client with retry, backoff, and TLS enforcement.
//!
//! Shared infrastructure for all HTTP-based QRNG providers (ANU, LfD, ID Quantique).

use backoff::{future::retry_notify, ExponentialBackoff};
use reqwest::{Client, StatusCode};
use serde::de::DeserializeOwned;
use std::time::{Duration, Instant};
use tracing::{debug, warn};

use crate::error::{Result, VeritasError};

/// Configuration for a QRNG HTTP client.
#[derive(Debug, Clone)]
pub struct QrngHttpConfig {
    /// Request timeout.
    pub timeout: Duration,
    /// Maximum retry attempts for transient errors.
    pub max_retries: u32,
    /// Initial retry interval.
    pub initial_interval: Duration,
    /// Maximum retry interval.
    pub max_interval: Duration,
    /// Optional PEM certificate for pinning (disables system roots when set).
    pub pinned_cert_pem: Option<&'static [u8]>,
}

/// Generic QRNG HTTP client with retry and backoff.
pub struct QrngHttpClient {
    client: Client,
    config: QrngHttpConfig,
}

impl QrngHttpClient {
    /// Create a new HTTP client with the given configuration.
    pub fn new(config: QrngHttpConfig) -> Result<Self> {
        let mut builder = Client::builder()
            .timeout(config.timeout)
            .https_only(true)
            .min_tls_version(reqwest::tls::Version::TLS_1_3);

        if let Some(pem) = config.pinned_cert_pem {
            let cert = reqwest::Certificate::from_pem(pem).map_err(|e| {
                VeritasError::QrngError(format!("Failed to load pinned certificate: {e}"))
            })?;
            builder = builder
                .tls_built_in_root_certs(false)
                .add_root_certificate(cert);
        }

        let client = builder
            .build()
            .map_err(|e| VeritasError::QrngError(format!("Failed to create HTTP client: {e}")))?;

        Ok(Self { client, config })
    }

    /// Fetch entropy from a URL with retry, parsing the JSON response with `parse_fn`.
    pub async fn fetch_entropy<R, F>(
        &self,
        url: &str,
        provider_name: &str,
        parse_fn: F,
    ) -> Result<[u8; 32]>
    where
        R: DeserializeOwned,
        F: Fn(R) -> Result<[u8; 32]> + Send + Sync,
    {
        let backoff = self.build_backoff();

        retry_notify(
            backoff,
            || {
                let parse_fn = &parse_fn;
                async move { self.fetch_once::<R, _>(url, provider_name, parse_fn).await }
            },
            |err: VeritasError, duration: Duration| {
                warn!(
                    error = %err,
                    retry_after_ms = duration.as_millis() as u64,
                    "Retry scheduled"
                );
            },
        )
        .await
    }

    async fn fetch_once<R, F>(
        &self,
        url: &str,
        provider_name: &str,
        parse_fn: &F,
    ) -> std::result::Result<[u8; 32], backoff::Error<VeritasError>>
    where
        R: DeserializeOwned,
        F: Fn(R) -> Result<[u8; 32]>,
    {
        let start = Instant::now();

        let response = self.client.get(url).send().await.map_err(|e| {
            let latency_ms = start.elapsed().as_millis();
            if is_transient_error(&e) {
                warn!(error = %e, latency_ms = latency_ms as u64, "Transient error, will retry");
                backoff::Error::transient(VeritasError::QrngError(format!(
                    "Transient error (will retry): {e}"
                )))
            } else {
                warn!(error = %e, latency_ms = latency_ms as u64, "Permanent error, aborting");
                backoff::Error::permanent(VeritasError::QrngError(format!(
                    "{provider_name} request failed: {e}"
                )))
            }
        })?;

        let status = response.status();
        debug!(status = %status, "Received HTTP response");

        if !status.is_success() {
            let latency_ms = start.elapsed().as_millis();
            let err =
                VeritasError::QrngError(format!("{provider_name} API returned status: {status}"));
            return if is_transient_status(status) {
                warn!(status = %status, latency_ms = latency_ms as u64, "Transient HTTP status, will retry");
                Err(backoff::Error::transient(err))
            } else {
                warn!(status = %status, latency_ms = latency_ms as u64, "Permanent HTTP error");
                Err(backoff::Error::permanent(err))
            };
        }

        let parsed: R = response.json().await.map_err(|e| {
            warn!(error = %e, "Failed to parse JSON response");
            backoff::Error::permanent(VeritasError::QrngError(format!(
                "Failed to parse {provider_name} response: {e}"
            )))
        })?;

        let latency_ms = start.elapsed().as_millis();
        debug!(
            latency_ms = latency_ms as u64,
            "Request completed successfully"
        );

        parse_fn(parsed).map_err(backoff::Error::permanent)
    }

    fn build_backoff(&self) -> ExponentialBackoff {
        ExponentialBackoff {
            initial_interval: self.config.initial_interval,
            max_interval: self.config.max_interval,
            max_elapsed_time: Some(self.config.timeout * self.config.max_retries),
            ..Default::default()
        }
    }
}

/// Convert a hex string to exactly 32 bytes.
pub fn hex_to_bytes(hex: &str, provider_name: &str) -> Result<[u8; 32]> {
    hex::decode(hex)
        .map_err(|e| VeritasError::QrngError(format!("Invalid hex from {provider_name}: {e}")))?
        .try_into()
        .map_err(|v: Vec<u8>| {
            VeritasError::QrngError(format!("Expected 32 bytes, got {}", v.len()))
        })
}

/// Check if a reqwest error is transient and should be retried.
pub fn is_transient_error(error: &reqwest::Error) -> bool {
    error.is_timeout() || error.is_connect() || error.is_request()
}

/// Check if an HTTP status code indicates a transient error.
pub fn is_transient_status(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::TOO_MANY_REQUESTS
            | StatusCode::SERVICE_UNAVAILABLE
            | StatusCode::GATEWAY_TIMEOUT
            | StatusCode::BAD_GATEWAY
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_to_bytes_valid() {
        let hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let bytes = hex_to_bytes(hex, "test").unwrap();
        assert_eq!(bytes.len(), 32);
        assert_eq!(bytes[0], 0x01);
        assert_eq!(bytes[1], 0x23);
    }

    #[test]
    fn test_hex_to_bytes_invalid_length() {
        let hex = "0123456789abcdef"; // Only 8 bytes
        assert!(hex_to_bytes(hex, "test").is_err());
    }

    #[test]
    fn test_hex_to_bytes_invalid_hex() {
        let hex = "xyz";
        assert!(hex_to_bytes(hex, "test").is_err());
    }

    #[test]
    fn test_transient_status_codes() {
        assert!(is_transient_status(StatusCode::TOO_MANY_REQUESTS));
        assert!(is_transient_status(StatusCode::SERVICE_UNAVAILABLE));
        assert!(is_transient_status(StatusCode::GATEWAY_TIMEOUT));
        assert!(is_transient_status(StatusCode::BAD_GATEWAY));
        assert!(!is_transient_status(StatusCode::NOT_FOUND));
        assert!(!is_transient_status(StatusCode::INTERNAL_SERVER_ERROR));
    }
}
