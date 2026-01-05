//! Australian National University (ANU) Quantum Random Number Generator.
//!
//! Uses the free public API at https://qrng.anu.edu.au/
//! This is suitable for development; production should use ID Quantique.

use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

use super::{QrngSource, QuantumEntropySource};
use crate::error::{Result, VeritasError};

/// ANU QRNG API endpoint.
const ANU_API_URL: &str = "https://qrng.anu.edu.au/API/jsonI.php?length=1&type=hex16&size=32";

/// Default timeout for API requests.
const DEFAULT_TIMEOUT_SECS: u64 = 10;

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

/// ANU Quantum Random Number Generator client.
///
/// Fetches true quantum random numbers from the Australian National University's
/// vacuum fluctuation-based QRNG.
pub struct AnuQrng {
    client: Client,
    timeout: Duration,
}

impl AnuQrng {
    /// Create a new ANU QRNG client with default settings.
    pub fn new() -> Result<Self> {
        Self::with_timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
    }

    /// Create a new ANU QRNG client with custom timeout.
    pub fn with_timeout(timeout: Duration) -> Result<Self> {
        let client = Client::builder()
            .timeout(timeout)
            .build()
            .map_err(|e| VeritasError::QrngError(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self { client, timeout })
    }

    /// Parse hex string to bytes.
    fn hex_to_bytes(hex: &str) -> Result<[u8; 32]> {
        let bytes = hex::decode(hex)
            .map_err(|e| VeritasError::QrngError(format!("Invalid hex from ANU API: {}", e)))?;

        if bytes.len() != 32 {
            return Err(VeritasError::QrngError(format!(
                "Expected 32 bytes, got {}",
                bytes.len()
            )));
        }

        let mut result = [0u8; 32];
        result.copy_from_slice(&bytes);
        Ok(result)
    }
}

impl Default for AnuQrng {
    fn default() -> Self {
        Self::new().expect("Failed to create default AnuQrng client")
    }
}

#[async_trait]
impl QuantumEntropySource for AnuQrng {
    async fn get_entropy(&self) -> Result<[u8; 32]> {
        let response = self
            .client
            .get(ANU_API_URL)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    VeritasError::QrngError(format!(
                        "ANU QRNG timeout after {:?}",
                        self.timeout
                    ))
                } else if e.is_connect() {
                    VeritasError::QrngError("Failed to connect to ANU QRNG API".into())
                } else {
                    VeritasError::QrngError(format!("ANU QRNG request failed: {}", e))
                }
            })?;

        if !response.status().is_success() {
            return Err(VeritasError::QrngError(format!(
                "ANU QRNG API returned status: {}",
                response.status()
            )));
        }

        let anu_response: AnuResponse = response.json().await.map_err(|e| {
            VeritasError::QrngError(format!("Failed to parse ANU QRNG response: {}", e))
        })?;

        if !anu_response.success {
            return Err(VeritasError::QrngError(
                "ANU QRNG API returned success=false".into(),
            ));
        }

        if anu_response.data.is_empty() {
            return Err(VeritasError::QrngError(
                "ANU QRNG API returned empty data".into(),
            ));
        }

        Self::hex_to_bytes(&anu_response.data[0])
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
    fn test_source_id() {
        let qrng = AnuQrng::default();
        assert_eq!(qrng.source_id(), QrngSource::AnuCloud);
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
