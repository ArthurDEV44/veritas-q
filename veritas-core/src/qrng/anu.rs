//! Australian National University (ANU) Quantum Random Number Generator.
//!
//! Uses the free public API at https://qrng.anu.edu.au/
//! This is suitable for development; production should use ID Quantique.
//!
//! **Note:** ANU's SSL certificate has expired. This provider is deprecated
//! and kept only for backwards compatibility. LfD is the preferred fallback.

use async_trait::async_trait;
use serde::Deserialize;
use std::time::Duration;
use tracing::{debug, info, instrument};

use super::http_client::{hex_to_bytes, QrngHttpClient, QrngHttpConfig};
use super::{QrngSource, QuantumEntropySource};
use crate::error::Result;

/// Default ANU QRNG API endpoint.
const DEFAULT_API_URL: &str = "https://qrng.anu.edu.au/API/jsonI.php?length=1&type=hex16&size=32";

/// Response structure from ANU QRNG API.
#[derive(Debug, Deserialize)]
struct AnuResponse {
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
            timeout: Duration::from_secs(5),
            max_retries: 1,
        }
    }
}

/// ANU Quantum Random Number Generator client.
///
/// Fetches true quantum random numbers from the Australian National University's
/// vacuum fluctuation-based QRNG.
pub struct AnuQrng {
    http: QrngHttpClient,
    api_url: String,
}

impl AnuQrng {
    /// Create a new ANU QRNG client with default settings.
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
    #[instrument(level = "debug", skip_all, fields(api_url = %config.api_url))]
    pub fn with_config(config: AnuQrngConfig) -> Result<Self> {
        debug!("Creating ANU QRNG client");
        let http = QrngHttpClient::new(QrngHttpConfig {
            timeout: config.timeout,
            max_retries: config.max_retries,
            initial_interval: Duration::from_millis(100),
            max_interval: Duration::from_secs(1),
            pinned_cert_pem: None,
        })?;
        info!("ANU QRNG client created successfully");
        Ok(Self {
            http,
            api_url: config.api_url,
        })
    }

    /// Parse an ANU API response into 32 bytes of entropy.
    fn parse_response(resp: AnuResponse) -> Result<[u8; 32]> {
        if !resp.success {
            return Err(crate::error::VeritasError::QrngError(
                "ANU QRNG API returned success=false".into(),
            ));
        }
        if resp.data.is_empty() {
            return Err(crate::error::VeritasError::QrngError(
                "ANU QRNG API returned empty data".into(),
            ));
        }
        hex_to_bytes(&resp.data[0], "ANU API")
    }
}

#[async_trait]
impl QuantumEntropySource for AnuQrng {
    #[instrument(level = "info", skip(self), fields(source = "anu"))]
    async fn get_entropy(&self) -> Result<[u8; 32]> {
        self.http
            .fetch_entropy::<AnuResponse, _>(&self.api_url, "ANU QRNG", Self::parse_response)
            .await
    }

    fn source_id(&self) -> QrngSource {
        QrngSource::AnuCloud
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AnuQrngConfig::default();
        assert_eq!(config.timeout, Duration::from_secs(5));
        assert_eq!(config.max_retries, 1);
    }

    #[test]
    fn test_create_client() {
        assert!(AnuQrng::new().is_ok());
    }

    #[test]
    fn test_create_client_with_timeout() {
        assert!(AnuQrng::with_timeout(Duration::from_secs(5)).is_ok());
    }

    #[test]
    fn test_source_id() {
        let qrng = AnuQrng::new().unwrap();
        assert_eq!(qrng.source_id(), QrngSource::AnuCloud);
    }

    #[test]
    fn test_parse_success() {
        let resp = AnuResponse {
            data: vec!["0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".into()],
            success: true,
        };
        assert!(AnuQrng::parse_response(resp).is_ok());
    }

    #[test]
    fn test_parse_failure() {
        let resp = AnuResponse {
            data: vec![],
            success: false,
        };
        assert!(AnuQrng::parse_response(resp).is_err());
    }

    #[tokio::test]
    #[ignore = "requires network access to ANU QRNG API"]
    async fn test_anu_real_api() {
        let qrng = AnuQrng::new().unwrap();
        let entropy = qrng.get_entropy().await.unwrap();
        assert_eq!(entropy.len(), 32);
    }
}
