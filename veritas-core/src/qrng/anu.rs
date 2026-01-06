//! Australian National University (ANU) Quantum Random Number Generator.
//!
//! Uses the free public API at https://qrng.anu.edu.au/
//! This is suitable for development; production should use ID Quantique.
//!
//! ## Features
//!
//! - Automatic retry with exponential backoff on transient errors
//! - TLS 1.3 enforcement with HTTPS-only connections
//! - Configurable API endpoint and timeout

use async_trait::async_trait;
use backoff::{future::retry, ExponentialBackoff};
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use std::time::Duration;

use super::{QrngSource, QuantumEntropySource};
use crate::error::{Result, VeritasError};

/// Default ANU QRNG API endpoint.
const DEFAULT_API_URL: &str = "https://qrng.anu.edu.au/API/jsonI.php?length=1&type=hex16&size=32";

/// Default timeout for API requests.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);

/// Maximum number of retry attempts.
const MAX_RETRIES: u32 = 3;

/// Initial retry interval.
const INITIAL_INTERVAL: Duration = Duration::from_millis(100);

/// Maximum retry interval.
const MAX_INTERVAL: Duration = Duration::from_secs(2);

/// Response structure from ANU QRNG API.
#[derive(Debug, Deserialize)]
struct AnuResponse {
    #[serde(rename = "type")]
    _type: String,
    #[allow(dead_code)]
    length: u32,
    #[allow(dead_code)]
    size: u32,
    data: Vec<String>,
    success: bool,
}

/// Configuration for the ANU QRNG client.
#[derive(Debug, Clone)]
pub struct AnuQrngConfig {
    /// API endpoint URL.
    pub api_url: String,
    /// Request timeout.
    pub timeout: Duration,
    /// Maximum retry attempts for transient errors.
    pub max_retries: u32,
}

impl Default for AnuQrngConfig {
    fn default() -> Self {
        Self {
            api_url: std::env::var("ANU_QRNG_URL").unwrap_or_else(|_| DEFAULT_API_URL.to_string()),
            timeout: DEFAULT_TIMEOUT,
            max_retries: MAX_RETRIES,
        }
    }
}

/// ANU Quantum Random Number Generator client.
///
/// Fetches true quantum random numbers from the Australian National University's
/// vacuum fluctuation-based QRNG.
///
/// ## Example
///
/// ```no_run
/// use veritas_core::qrng::{AnuQrng, QuantumEntropySource};
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let qrng = AnuQrng::new()?;
/// let entropy = qrng.get_entropy().await?;
/// println!("Got 32 bytes of quantum entropy");
/// # Ok(())
/// # }
/// ```
pub struct AnuQrng {
    client: Client,
    config: AnuQrngConfig,
}

impl AnuQrng {
    /// Create a new ANU QRNG client with default settings.
    ///
    /// Uses TLS 1.3 with HTTPS-only connections for security.
    pub fn new() -> Result<Self> {
        Self::with_config(AnuQrngConfig::default())
    }

    /// Create a new ANU QRNG client with custom timeout.
    pub fn with_timeout(timeout: Duration) -> Result<Self> {
        Self::with_config(AnuQrngConfig {
            timeout,
            ..Default::default()
        })
    }

    /// Create a new ANU QRNG client with custom configuration.
    pub fn with_config(config: AnuQrngConfig) -> Result<Self> {
        let client = Client::builder()
            .timeout(config.timeout)
            .https_only(true)
            .min_tls_version(reqwest::tls::Version::TLS_1_3)
            .build()
            .map_err(|e| VeritasError::QrngError(format!("Failed to create HTTP client: {e}")))?;

        Ok(Self { client, config })
    }

    /// Parse hex string to 32 bytes.
    fn hex_to_bytes(hex: &str) -> Result<[u8; 32]> {
        hex::decode(hex)
            .map_err(|e| VeritasError::QrngError(format!("Invalid hex from ANU API: {e}")))?
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

    /// Fetch entropy with retry logic.
    async fn fetch_entropy_internal(
        &self,
    ) -> std::result::Result<[u8; 32], backoff::Error<VeritasError>> {
        let response = self
            .client
            .get(&self.config.api_url)
            .send()
            .await
            .map_err(|e| {
                if Self::is_transient_error(&e) {
                    backoff::Error::transient(VeritasError::QrngError(format!(
                        "Transient error (will retry): {e}"
                    )))
                } else {
                    backoff::Error::permanent(VeritasError::QrngError(format!(
                        "ANU QRNG request failed: {e}"
                    )))
                }
            })?;

        let status = response.status();
        if !status.is_success() {
            let err = VeritasError::QrngError(format!("ANU QRNG API returned status: {status}"));
            return if Self::is_transient_status(status) {
                Err(backoff::Error::transient(err))
            } else {
                Err(backoff::Error::permanent(err))
            };
        }

        let anu_response: AnuResponse = response.json().await.map_err(|e| {
            backoff::Error::permanent(VeritasError::QrngError(format!(
                "Failed to parse ANU QRNG response: {e}"
            )))
        })?;

        if !anu_response.success {
            return Err(backoff::Error::permanent(VeritasError::QrngError(
                "ANU QRNG API returned success=false".into(),
            )));
        }

        if anu_response.data.is_empty() {
            return Err(backoff::Error::permanent(VeritasError::QrngError(
                "ANU QRNG API returned empty data".into(),
            )));
        }

        Self::hex_to_bytes(&anu_response.data[0]).map_err(backoff::Error::permanent)
    }
}

#[async_trait]
impl QuantumEntropySource for AnuQrng {
    async fn get_entropy(&self) -> Result<[u8; 32]> {
        let backoff = self.build_backoff();

        retry(backoff, || async { self.fetch_entropy_internal().await }).await
    }

    fn source_id(&self) -> QrngSource {
        QrngSource::AnuCloud
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_to_bytes_valid() {
        let hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let bytes = AnuQrng::hex_to_bytes(hex).unwrap();
        assert_eq!(bytes.len(), 32);
        assert_eq!(bytes[0], 0x01);
        assert_eq!(bytes[1], 0x23);
    }

    #[test]
    fn test_hex_to_bytes_invalid_length() {
        let hex = "0123456789abcdef"; // Only 8 bytes
        let result = AnuQrng::hex_to_bytes(hex);
        assert!(result.is_err());
    }

    #[test]
    fn test_hex_to_bytes_invalid_hex() {
        let hex = "xyz"; // Invalid hex
        let result = AnuQrng::hex_to_bytes(hex);
        assert!(result.is_err());
    }

    #[test]
    fn test_default_config() {
        let config = AnuQrngConfig::default();
        assert_eq!(config.timeout, DEFAULT_TIMEOUT);
        assert_eq!(config.max_retries, MAX_RETRIES);
    }

    #[test]
    fn test_create_client() {
        let qrng = AnuQrng::new();
        assert!(qrng.is_ok());
    }

    #[test]
    fn test_create_client_with_timeout() {
        let qrng = AnuQrng::with_timeout(Duration::from_secs(5));
        assert!(qrng.is_ok());
    }

    #[test]
    fn test_source_id() {
        let qrng = AnuQrng::new().unwrap();
        assert_eq!(qrng.source_id(), QrngSource::AnuCloud);
    }

    #[test]
    fn test_transient_status_codes() {
        assert!(AnuQrng::is_transient_status(StatusCode::TOO_MANY_REQUESTS));
        assert!(AnuQrng::is_transient_status(
            StatusCode::SERVICE_UNAVAILABLE
        ));
        assert!(AnuQrng::is_transient_status(StatusCode::GATEWAY_TIMEOUT));
        assert!(AnuQrng::is_transient_status(StatusCode::BAD_GATEWAY));
        assert!(!AnuQrng::is_transient_status(StatusCode::NOT_FOUND));
        assert!(!AnuQrng::is_transient_status(
            StatusCode::INTERNAL_SERVER_ERROR
        ));
    }

    // Note: Integration test with real API is marked as ignored
    // Run with: cargo test --package veritas-core test_anu_real_api -- --ignored
    #[tokio::test]
    #[ignore = "requires network access to ANU QRNG API"]
    async fn test_anu_real_api() {
        let qrng = AnuQrng::new().unwrap();
        let entropy = qrng.get_entropy().await.unwrap();
        assert_eq!(entropy.len(), 32);
        println!("Got quantum entropy: {}", hex::encode(entropy));
    }
}
