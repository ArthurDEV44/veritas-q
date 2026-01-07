//! LfD (Leibniz-Forschungszentrum Dresden) Quantum Random Number Generator.
//!
//! Uses the free public API at https://lfdr.de/qrng_api/
//! Backed by an ID Quantique QRNG PCIe device.
//!
//! ## Features
//!
//! - Automatic retry with exponential backoff on transient errors
//! - TLS 1.2+ enforcement with HTTPS-only connections
//! - Configurable API endpoint and timeout
//! - Full observability with tracing instrumentation
//!
//! ## API Details
//!
//! - Endpoint: `GET https://lfdr.de/qrng_api/qrng?length=32&format=HEX`
//! - Response: `{"qrn": "hex...", "length": 32}`
//! - No authentication required

use async_trait::async_trait;
use backoff::{future::retry_notify, ExponentialBackoff};
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use std::time::{Duration, Instant};
use tracing::{debug, info, instrument, warn};

use super::{QrngSource, QuantumEntropySource};
use crate::error::{Result, VeritasError};

/// Default LfD QRNG API endpoint.
const DEFAULT_API_URL: &str = "https://lfdr.de/qrng_api/qrng";

/// Default timeout for API requests.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(5);

/// Maximum number of retry attempts.
const MAX_RETRIES: u32 = 2;

/// Initial retry interval.
const INITIAL_INTERVAL: Duration = Duration::from_millis(100);

/// Maximum retry interval.
const MAX_INTERVAL: Duration = Duration::from_secs(1);

/// Response structure from LfD QRNG API.
#[derive(Debug, Deserialize)]
struct LfdResponse {
    /// Hex-encoded random bytes
    qrn: String,
    /// Number of bytes returned
    #[allow(dead_code)]
    length: u32,
}

/// Configuration for the LfD QRNG client.
#[derive(Debug, Clone)]
pub struct LfdQrngConfig {
    /// API endpoint URL (without query parameters).
    pub api_url: String,
    /// Request timeout.
    pub timeout: Duration,
    /// Maximum retry attempts for transient errors.
    pub max_retries: u32,
}

impl Default for LfdQrngConfig {
    fn default() -> Self {
        Self {
            api_url: std::env::var("LFD_QRNG_URL").unwrap_or_else(|_| DEFAULT_API_URL.to_string()),
            timeout: DEFAULT_TIMEOUT,
            max_retries: MAX_RETRIES,
        }
    }
}

/// LfD Quantum Random Number Generator client.
///
/// Fetches true quantum random numbers from the LfD QRNG service in Germany,
/// which is backed by an ID Quantique QRNG PCIe device.
///
/// ## Example
///
/// ```no_run
/// use veritas_core::qrng::{LfdQrng, QuantumEntropySource};
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let qrng = LfdQrng::new()?;
/// let entropy = qrng.get_entropy().await?;
/// println!("Got 32 bytes of quantum entropy");
/// # Ok(())
/// # }
/// ```
pub struct LfdQrng {
    client: Client,
    config: LfdQrngConfig,
}

impl LfdQrng {
    /// Create a new LfD QRNG client with default settings.
    ///
    /// Uses TLS 1.3 with HTTPS-only connections for security.
    #[instrument(level = "debug", skip_all)]
    pub fn new() -> Result<Self> {
        Self::with_config(LfdQrngConfig::default())
    }

    /// Create a new LfD QRNG client with custom timeout.
    #[instrument(level = "debug", skip_all, fields(timeout_ms = timeout.as_millis() as u64))]
    pub fn with_timeout(timeout: Duration) -> Result<Self> {
        Self::with_config(LfdQrngConfig {
            timeout,
            ..Default::default()
        })
    }

    /// Create a new LfD QRNG client with custom configuration.
    #[instrument(level = "debug", skip_all, fields(
        api_url = %config.api_url,
        timeout_ms = config.timeout.as_millis() as u64,
        max_retries = config.max_retries
    ))]
    pub fn with_config(config: LfdQrngConfig) -> Result<Self> {
        debug!("Creating LfD QRNG client");

        let client = Client::builder()
            .timeout(config.timeout)
            .https_only(true)
            .min_tls_version(reqwest::tls::Version::TLS_1_2)
            .build()
            .map_err(|e| {
                warn!(error = %e, "Failed to create HTTP client");
                VeritasError::QrngError(format!("Failed to create HTTP client: {e}"))
            })?;

        info!("LfD QRNG client created successfully");
        Ok(Self { client, config })
    }

    /// Build the full API URL with query parameters.
    fn build_url(&self) -> String {
        format!("{}?length=32&format=HEX", self.config.api_url)
    }

    /// Parse hex string to 32 bytes.
    fn hex_to_bytes(hex: &str) -> Result<[u8; 32]> {
        hex::decode(hex)
            .map_err(|e| VeritasError::QrngError(format!("Invalid hex from LfD API: {e}")))?
            .try_into()
            .map_err(|v: Vec<u8>| {
                VeritasError::QrngError(format!("Expected 32 bytes, got {}", v.len()))
            })
    }

    /// Check if an error is transient and should be retried.
    fn is_transient_error(error: &reqwest::Error) -> bool {
        error.is_timeout() || error.is_connect() || error.is_request()
    }

    /// Check if an HTTP status code indicates a transient error.
    fn is_transient_status(status: StatusCode) -> bool {
        matches!(
            status,
            StatusCode::TOO_MANY_REQUESTS
                | StatusCode::SERVICE_UNAVAILABLE
                | StatusCode::GATEWAY_TIMEOUT
                | StatusCode::BAD_GATEWAY
        )
    }

    /// Build exponential backoff configuration.
    fn build_backoff(&self) -> ExponentialBackoff {
        ExponentialBackoff {
            initial_interval: INITIAL_INTERVAL,
            max_interval: MAX_INTERVAL,
            max_elapsed_time: Some(self.config.timeout * self.config.max_retries),
            ..Default::default()
        }
    }

    /// Fetch entropy with retry logic (single attempt).
    #[instrument(level = "debug", skip(self), fields(api_url = %self.config.api_url))]
    async fn fetch_entropy_internal(
        &self,
    ) -> std::result::Result<[u8; 32], backoff::Error<VeritasError>> {
        let start = Instant::now();
        let url = self.build_url();

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| {
                let latency_ms = start.elapsed().as_millis();
                if Self::is_transient_error(&e) {
                    warn!(
                        error = %e,
                        latency_ms = latency_ms as u64,
                        "Transient error, will retry"
                    );
                    backoff::Error::transient(VeritasError::QrngError(format!(
                        "Transient error (will retry): {e}"
                    )))
                } else {
                    warn!(
                        error = %e,
                        latency_ms = latency_ms as u64,
                        "Permanent error, aborting"
                    );
                    backoff::Error::permanent(VeritasError::QrngError(format!(
                        "LfD QRNG request failed: {e}"
                    )))
                }
            })?;

        let status = response.status();
        debug!(status = %status, "Received HTTP response");

        if !status.is_success() {
            let latency_ms = start.elapsed().as_millis();
            let err = VeritasError::QrngError(format!("LfD QRNG API returned status: {status}"));
            return if Self::is_transient_status(status) {
                warn!(
                    status = %status,
                    latency_ms = latency_ms as u64,
                    "Transient HTTP status, will retry"
                );
                Err(backoff::Error::transient(err))
            } else {
                warn!(
                    status = %status,
                    latency_ms = latency_ms as u64,
                    "Permanent HTTP error"
                );
                Err(backoff::Error::permanent(err))
            };
        }

        let lfd_response: LfdResponse = response.json().await.map_err(|e| {
            warn!(error = %e, "Failed to parse JSON response");
            backoff::Error::permanent(VeritasError::QrngError(format!(
                "Failed to parse LfD QRNG response: {e}"
            )))
        })?;

        if lfd_response.qrn.is_empty() {
            warn!("API returned empty qrn field");
            return Err(backoff::Error::permanent(VeritasError::QrngError(
                "LfD QRNG API returned empty data".into(),
            )));
        }

        let latency_ms = start.elapsed().as_millis();
        debug!(
            latency_ms = latency_ms as u64,
            "Request completed successfully"
        );

        Self::hex_to_bytes(&lfd_response.qrn).map_err(backoff::Error::permanent)
    }
}

#[async_trait]
impl QuantumEntropySource for LfdQrng {
    /// Fetch 256 bits of quantum entropy from LfD QRNG.
    ///
    /// This method automatically retries on transient errors with exponential backoff.
    #[instrument(
        level = "info",
        skip(self),
        fields(
            source = "lfd",
            max_retries = self.config.max_retries
        )
    )]
    async fn get_entropy(&self) -> Result<[u8; 32]> {
        let start = Instant::now();
        let backoff = self.build_backoff();

        debug!("Fetching quantum entropy from LfD QRNG");

        let result = retry_notify(
            backoff,
            || async { self.fetch_entropy_internal().await },
            |err: VeritasError, duration: Duration| {
                warn!(
                    error = %err,
                    retry_after_ms = duration.as_millis() as u64,
                    "Retry scheduled"
                );
            },
        )
        .await;

        let total_latency_ms = start.elapsed().as_millis();

        match &result {
            Ok(_) => {
                info!(
                    total_latency_ms = total_latency_ms as u64,
                    "Successfully fetched quantum entropy from LfD"
                );
            }
            Err(e) => {
                warn!(
                    error = %e,
                    total_latency_ms = total_latency_ms as u64,
                    "Failed to fetch quantum entropy after all retries"
                );
            }
        }

        result
    }

    fn source_id(&self) -> QrngSource {
        QrngSource::LfdCloud
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_to_bytes_valid() {
        let hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let bytes = LfdQrng::hex_to_bytes(hex).unwrap();
        assert_eq!(bytes.len(), 32);
        assert_eq!(bytes[0], 0x01);
        assert_eq!(bytes[1], 0x23);
    }

    #[test]
    fn test_hex_to_bytes_invalid_length() {
        let hex = "0123456789abcdef"; // Only 8 bytes
        let result = LfdQrng::hex_to_bytes(hex);
        assert!(result.is_err());
    }

    #[test]
    fn test_hex_to_bytes_invalid_hex() {
        let hex = "xyz"; // Invalid hex
        let result = LfdQrng::hex_to_bytes(hex);
        assert!(result.is_err());
    }

    #[test]
    fn test_default_config() {
        let config = LfdQrngConfig::default();
        assert_eq!(config.api_url, DEFAULT_API_URL);
        assert_eq!(config.timeout, DEFAULT_TIMEOUT);
        assert_eq!(config.max_retries, MAX_RETRIES);
    }

    #[test]
    fn test_create_client() {
        let qrng = LfdQrng::new();
        assert!(qrng.is_ok());
    }

    #[test]
    fn test_create_client_with_timeout() {
        let qrng = LfdQrng::with_timeout(Duration::from_secs(10));
        assert!(qrng.is_ok());
    }

    #[test]
    fn test_source_id() {
        let qrng = LfdQrng::new().unwrap();
        assert_eq!(qrng.source_id(), QrngSource::LfdCloud);
    }

    #[test]
    fn test_build_url() {
        let qrng = LfdQrng::new().unwrap();
        let url = qrng.build_url();
        assert_eq!(url, "https://lfdr.de/qrng_api/qrng?length=32&format=HEX");
    }

    #[test]
    fn test_transient_status_codes() {
        assert!(LfdQrng::is_transient_status(StatusCode::TOO_MANY_REQUESTS));
        assert!(LfdQrng::is_transient_status(StatusCode::SERVICE_UNAVAILABLE));
        assert!(LfdQrng::is_transient_status(StatusCode::GATEWAY_TIMEOUT));
        assert!(LfdQrng::is_transient_status(StatusCode::BAD_GATEWAY));
        assert!(!LfdQrng::is_transient_status(StatusCode::NOT_FOUND));
        assert!(!LfdQrng::is_transient_status(StatusCode::INTERNAL_SERVER_ERROR));
    }

    // Integration test with real API
    // Run with: cargo test --package veritas-core test_lfd_real_api -- --ignored
    #[tokio::test]
    #[ignore = "requires network access to LfD QRNG API"]
    async fn test_lfd_real_api() {
        let qrng = LfdQrng::new().unwrap();
        let entropy = qrng.get_entropy().await.unwrap();
        assert_eq!(entropy.len(), 32);
        println!("Got quantum entropy: {}", hex::encode(entropy));
    }
}
