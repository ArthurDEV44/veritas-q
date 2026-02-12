//! LfD (Leibniz-Forschungszentrum Dresden) Quantum Random Number Generator.
//!
//! Uses the free public API at https://lfdr.de/qrng_api/
//! Backed by an ID Quantique QRNG PCIe device.
//!
//! Certificate pinning to ISRG Root X1 (Let's Encrypt root CA).

use async_trait::async_trait;
use serde::Deserialize;
use std::time::Duration;
use tracing::{debug, info, instrument};

use super::http_client::{hex_to_bytes, QrngHttpClient, QrngHttpConfig};
use super::{QrngSource, QuantumEntropySource};
use crate::error::Result;

/// Default LfD QRNG API endpoint.
const DEFAULT_API_URL: &str = "https://lfdr.de/qrng_api/qrng";

/// Response structure from LfD QRNG API.
#[derive(Debug, Deserialize)]
struct LfdResponse {
    qrn: String,
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
            timeout: Duration::from_secs(5),
            max_retries: 2,
        }
    }
}

/// LfD Quantum Random Number Generator client.
///
/// Fetches true quantum random numbers from the LfD QRNG service in Germany,
/// which is backed by an ID Quantique QRNG PCIe device.
pub struct LfdQrng {
    http: QrngHttpClient,
    api_url: String,
}

impl LfdQrng {
    /// Create a new LfD QRNG client with default settings.
    pub fn new() -> Result<Self> {
        Self::with_config(LfdQrngConfig::default())
    }

    /// Create a new LfD QRNG client with custom timeout.
    pub fn with_timeout(timeout: Duration) -> Result<Self> {
        Self::with_config(LfdQrngConfig {
            timeout,
            ..Default::default()
        })
    }

    /// Create a new LfD QRNG client with custom configuration.
    #[instrument(level = "debug", skip_all, fields(api_url = %config.api_url))]
    pub fn with_config(config: LfdQrngConfig) -> Result<Self> {
        debug!("Creating LfD QRNG client");
        let http = QrngHttpClient::new(QrngHttpConfig {
            timeout: config.timeout,
            max_retries: config.max_retries,
            initial_interval: Duration::from_millis(100),
            max_interval: Duration::from_secs(1),
            pinned_cert_pem: Some(include_bytes!("certs/isrg_root_x1.pem")),
        })?;
        info!("LfD QRNG client created successfully");
        Ok(Self {
            http,
            api_url: format!("{}?length=32&format=HEX", config.api_url),
        })
    }

    /// Parse an LfD API response into 32 bytes of entropy.
    fn parse_response(resp: LfdResponse) -> Result<[u8; 32]> {
        if resp.qrn.is_empty() {
            return Err(crate::error::VeritasError::QrngError(
                "LfD QRNG API returned empty data".into(),
            ));
        }
        hex_to_bytes(&resp.qrn, "LfD API")
    }
}

#[async_trait]
impl QuantumEntropySource for LfdQrng {
    #[instrument(level = "info", skip(self), fields(source = "lfd"))]
    async fn get_entropy(&self) -> Result<[u8; 32]> {
        self.http
            .fetch_entropy::<LfdResponse, _>(&self.api_url, "LfD QRNG", Self::parse_response)
            .await
    }

    fn source_id(&self) -> QrngSource {
        QrngSource::LfdCloud
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = LfdQrngConfig::default();
        assert_eq!(config.api_url, DEFAULT_API_URL);
        assert_eq!(config.timeout, Duration::from_secs(5));
        assert_eq!(config.max_retries, 2);
    }

    #[test]
    fn test_create_client() {
        assert!(LfdQrng::new().is_ok());
    }

    #[test]
    fn test_create_client_with_timeout() {
        assert!(LfdQrng::with_timeout(Duration::from_secs(10)).is_ok());
    }

    #[test]
    fn test_source_id() {
        let qrng = LfdQrng::new().unwrap();
        assert_eq!(qrng.source_id(), QrngSource::LfdCloud);
    }

    #[test]
    fn test_parse_success() {
        let resp = LfdResponse {
            qrn: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".into(),
        };
        assert!(LfdQrng::parse_response(resp).is_ok());
    }

    #[test]
    fn test_parse_empty() {
        let resp = LfdResponse { qrn: String::new() };
        assert!(LfdQrng::parse_response(resp).is_err());
    }

    #[tokio::test]
    #[ignore = "requires network access to LfD QRNG API"]
    async fn test_lfd_real_api() {
        let qrng = LfdQrng::new().unwrap();
        let entropy = qrng.get_entropy().await.unwrap();
        assert_eq!(entropy.len(), 32);
    }
}
