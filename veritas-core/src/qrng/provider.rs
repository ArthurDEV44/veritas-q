//! QRNG Provider abstraction for multi-vendor support.
//!
//! This module implements the QRNG Open API Framework concepts for
//! interoperability between different quantum entropy sources.
//!
//! ## Supported Providers
//!
//! - `AnuQrng` - Australian National University (development)
//! - `IdQuantiqueQrng` - ID Quantique (production)
//! - `MockQrng` - Deterministic mock (testing only)
//!
//! ## QRNG Open API Compliance
//!
//! Based on the Palo Alto Networks QRNG Open API Framework (2025).
//! See: <https://github.com/PaloAltoNetworks/QRNG-OPENAPI>

use std::sync::Arc;

use super::{AnuQrng, AnuQrngConfig, MockQrng, QrngSource, QuantumEntropySource};
use crate::error::{Result, VeritasError};

/// Configuration for creating QRNG providers.
#[derive(Debug, Clone, Default)]
pub enum QrngProviderConfig {
    /// ANU QRNG (development/testing)
    Anu(AnuQrngConfig),

    /// ID Quantique (production)
    IdQuantique(IdQuantiqueConfig),

    /// Mock provider (testing only)
    Mock { seed: u64 },

    /// Auto-select best available provider
    #[default]
    Auto,
}

/// Configuration for ID Quantique QRNG.
#[derive(Debug, Clone)]
pub struct IdQuantiqueConfig {
    /// API base URL
    pub api_url: String,
    /// API key for authentication
    pub api_key: String,
    /// Request timeout
    pub timeout: std::time::Duration,
    /// Maximum retry attempts
    pub max_retries: u32,
}

impl IdQuantiqueConfig {
    /// Create configuration from environment variables.
    ///
    /// Required: `QRNG_API_KEY`
    /// Optional: `QRNG_API_URL` (defaults to ID Quantique production)
    pub fn from_env() -> Result<Self> {
        let api_key = std::env::var("QRNG_API_KEY").map_err(|_| {
            VeritasError::QrngError("QRNG_API_KEY environment variable not set".into())
        })?;

        let api_url = std::env::var("QRNG_API_URL")
            .unwrap_or_else(|_| "https://api.idquantique.com/v1".to_string());

        Ok(Self {
            api_url,
            api_key,
            timeout: std::time::Duration::from_secs(10),
            max_retries: 3,
        })
    }
}

/// QRNG Provider capabilities (QRNG Open API compliant).
#[derive(Debug, Clone)]
pub struct QrngCapabilities {
    /// Minimum block size in bytes
    pub min_block_size: usize,
    /// Maximum block size in bytes
    pub max_block_size: usize,
    /// Maximum blocks per request
    pub max_block_count: usize,
    /// Supported entropy types
    pub entropy_types: Vec<String>,
    /// Provider source identifier
    pub source: QrngSource,
}

impl Default for QrngCapabilities {
    fn default() -> Self {
        Self {
            min_block_size: 1,
            max_block_size: 1024,
            max_block_count: 100,
            entropy_types: vec!["raw".to_string()],
            source: QrngSource::Mock,
        }
    }
}

/// Health status of a QRNG provider.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QrngHealthStatus {
    /// Provider is healthy and operational
    Healthy,
    /// Provider is degraded but functional
    Degraded { reason: String },
    /// Provider is unavailable
    Unavailable { reason: String },
}

/// Factory for creating QRNG providers.
pub struct QrngProviderFactory;

impl QrngProviderFactory {
    /// Create a QRNG provider from configuration.
    pub fn create(config: QrngProviderConfig) -> Result<Arc<dyn QuantumEntropySource>> {
        match config {
            QrngProviderConfig::Anu(anu_config) => {
                let provider = AnuQrng::with_config(anu_config)?;
                Ok(Arc::new(provider))
            }
            QrngProviderConfig::IdQuantique(idq_config) => {
                let provider = IdQuantiqueQrng::new(idq_config)?;
                Ok(Arc::new(provider))
            }
            QrngProviderConfig::Mock { seed } => {
                let provider = MockQrng::new(seed);
                Ok(Arc::new(provider))
            }
            QrngProviderConfig::Auto => Self::create_auto(),
        }
    }

    /// Auto-select the best available provider.
    ///
    /// Priority:
    /// 1. ID Quantique (if QRNG_API_KEY is set)
    /// 2. ANU QRNG (fallback for development)
    fn create_auto() -> Result<Arc<dyn QuantumEntropySource>> {
        // Try ID Quantique first (production)
        if let Ok(idq_config) = IdQuantiqueConfig::from_env() {
            tracing::info!("Auto-selected ID Quantique QRNG provider");
            return Self::create(QrngProviderConfig::IdQuantique(idq_config));
        }

        // Fall back to ANU (development)
        tracing::info!("Auto-selected ANU QRNG provider (development mode)");
        Self::create(QrngProviderConfig::Anu(AnuQrngConfig::default()))
    }

    /// Create a mock provider for testing.
    pub fn create_mock() -> Arc<dyn QuantumEntropySource> {
        Arc::new(MockQrng::default())
    }
}

// =============================================================================
// ID Quantique QRNG Client (QRNG Open API compliant)
// =============================================================================

use async_trait::async_trait;
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tracing::{debug, info, instrument, warn};

/// ID Quantique QRNG client implementing the QRNG Open API.
pub struct IdQuantiqueQrng {
    client: Client,
    config: IdQuantiqueConfig,
}

/// QRNG Open API entropy request.
#[derive(Debug, Serialize)]
struct EntropyRequest {
    block_size: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    block_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    entropy_type: Option<String>,
}

/// QRNG Open API entropy response.
#[derive(Debug, Deserialize)]
struct EntropyResponse {
    entropy: Vec<String>, // Base64 encoded
}

/// QRNG Open API capabilities response.
#[derive(Debug, Deserialize)]
struct CapabilitiesResponse {
    entropy: EntropyCapabilities,
    #[serde(default)]
    #[allow(dead_code)]
    source_count: usize,
}

#[derive(Debug, Deserialize)]
struct EntropyCapabilities {
    min_block_size: usize,
    max_block_size: usize,
    #[serde(default = "default_max_count")]
    max_block_count: usize,
    #[serde(default)]
    entropy_types: Vec<String>,
}

fn default_max_count() -> usize {
    100
}

/// QRNG Open API health response.
#[derive(Debug, Deserialize)]
struct HealthResponse {
    #[serde(default)]
    test_result: Vec<HealthTestResult>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct HealthTestResult {
    test_type: String,
    result: String,
    #[serde(default)]
    timestamp: Option<String>,
}

impl IdQuantiqueQrng {
    /// Create a new ID Quantique QRNG client.
    #[instrument(level = "debug", skip_all, fields(api_url = %config.api_url))]
    pub fn new(config: IdQuantiqueConfig) -> Result<Self> {
        debug!("Creating ID Quantique QRNG client");

        let client = Client::builder()
            .timeout(config.timeout)
            .https_only(true)
            .min_tls_version(reqwest::tls::Version::TLS_1_3)
            .build()
            .map_err(|e| VeritasError::QrngError(format!("Failed to create HTTP client: {e}")))?;

        info!("ID Quantique QRNG client created");
        Ok(Self { client, config })
    }

    /// Get provider capabilities.
    #[instrument(level = "debug", skip(self))]
    pub async fn capabilities(&self) -> Result<QrngCapabilities> {
        let url = format!("{}/capabilities", self.config.api_url);

        let response = self
            .client
            .get(&url)
            .bearer_auth(&self.config.api_key)
            .send()
            .await
            .map_err(|e| VeritasError::QrngError(format!("Capabilities request failed: {e}")))?;

        if !response.status().is_success() {
            return Err(VeritasError::QrngError(format!(
                "Capabilities returned status: {}",
                response.status()
            )));
        }

        let caps: CapabilitiesResponse = response
            .json()
            .await
            .map_err(|e| VeritasError::QrngError(format!("Failed to parse capabilities: {e}")))?;

        Ok(QrngCapabilities {
            min_block_size: caps.entropy.min_block_size,
            max_block_size: caps.entropy.max_block_size,
            max_block_count: caps.entropy.max_block_count,
            entropy_types: caps.entropy.entropy_types,
            source: QrngSource::IdQuantiqueCloud,
        })
    }

    /// Check provider health status.
    #[instrument(level = "debug", skip(self))]
    pub async fn health(&self) -> Result<QrngHealthStatus> {
        let url = format!("{}/healthtest", self.config.api_url);

        let response = self
            .client
            .get(&url)
            .bearer_auth(&self.config.api_key)
            .send()
            .await
            .map_err(|e| VeritasError::QrngError(format!("Health check request failed: {e}")))?;

        match response.status() {
            StatusCode::OK => {
                let health: HealthResponse = response.json().await.map_err(|e| {
                    VeritasError::QrngError(format!("Failed to parse health response: {e}"))
                })?;

                // Check if any test failed
                let failed = health
                    .test_result
                    .iter()
                    .any(|t| t.result.to_lowercase() == "fail");

                if failed {
                    Ok(QrngHealthStatus::Degraded {
                        reason: "One or more health tests failed".into(),
                    })
                } else {
                    Ok(QrngHealthStatus::Healthy)
                }
            }
            StatusCode::SERVICE_UNAVAILABLE => Ok(QrngHealthStatus::Unavailable {
                reason: "Service unavailable".into(),
            }),
            status => Ok(QrngHealthStatus::Unavailable {
                reason: format!("Unexpected status: {status}"),
            }),
        }
    }

    /// Fetch entropy with retry logic.
    async fn fetch_entropy_internal(&self) -> Result<[u8; 32]> {
        let url = format!("{}/entropy", self.config.api_url);
        let start = Instant::now();

        let request = EntropyRequest {
            block_size: 32,
            block_count: Some(1),
            entropy_type: None,
        };

        let response = self
            .client
            .post(&url)
            .bearer_auth(&self.config.api_key)
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                let latency_ms = start.elapsed().as_millis();
                warn!(error = %e, latency_ms = latency_ms as u64, "Entropy request failed");
                VeritasError::QrngError(format!("Entropy request failed: {e}"))
            })?;

        if !response.status().is_success() {
            return Err(VeritasError::QrngError(format!(
                "Entropy returned status: {}",
                response.status()
            )));
        }

        let entropy_response: EntropyResponse = response
            .json()
            .await
            .map_err(|e| VeritasError::QrngError(format!("Failed to parse entropy: {e}")))?;

        if entropy_response.entropy.is_empty() {
            return Err(VeritasError::QrngError("Empty entropy response".into()));
        }

        // Decode base64 entropy
        let bytes = base64_decode(&entropy_response.entropy[0])?;

        if bytes.len() != 32 {
            return Err(VeritasError::QrngError(format!(
                "Expected 32 bytes, got {}",
                bytes.len()
            )));
        }

        let mut result = [0u8; 32];
        result.copy_from_slice(&bytes);

        let latency_ms = start.elapsed().as_millis();
        debug!(
            latency_ms = latency_ms as u64,
            "Entropy fetched successfully"
        );

        Ok(result)
    }
}

/// Decode base64 string to bytes.
fn base64_decode(encoded: &str) -> Result<Vec<u8>> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| VeritasError::QrngError(format!("Base64 decode error: {e}")))
}

#[async_trait]
impl QuantumEntropySource for IdQuantiqueQrng {
    #[instrument(
        level = "info",
        skip(self),
        fields(source = "idquantique", max_retries = self.config.max_retries)
    )]
    async fn get_entropy(&self) -> Result<[u8; 32]> {
        let start = Instant::now();
        debug!("Fetching quantum entropy from ID Quantique");

        // Simple retry with backoff
        let mut last_error = None;
        let mut delay = Duration::from_millis(100);

        for attempt in 1..=self.config.max_retries {
            match self.fetch_entropy_internal().await {
                Ok(entropy) => {
                    let total_ms = start.elapsed().as_millis();
                    info!(
                        total_latency_ms = total_ms as u64,
                        attempts = attempt,
                        "Successfully fetched quantum entropy"
                    );
                    return Ok(entropy);
                }
                Err(e) => {
                    warn!(
                        error = %e,
                        attempt = attempt,
                        max_retries = self.config.max_retries,
                        "Entropy fetch failed, retrying"
                    );
                    last_error = Some(e);

                    if attempt < self.config.max_retries {
                        tokio::time::sleep(delay).await;
                        delay = std::cmp::min(delay * 2, Duration::from_secs(2));
                    }
                }
            }
        }

        let total_ms = start.elapsed().as_millis();
        warn!(
            total_latency_ms = total_ms as u64,
            "Failed to fetch entropy after all retries"
        );

        Err(last_error.unwrap_or_else(|| VeritasError::QrngError("Unknown error".into())))
    }

    fn source_id(&self) -> QrngSource {
        QrngSource::IdQuantiqueCloud
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_config_default() {
        let config = QrngProviderConfig::default();
        assert!(matches!(config, QrngProviderConfig::Auto));
    }

    #[test]
    fn test_capabilities_default() {
        let caps = QrngCapabilities::default();
        assert_eq!(caps.min_block_size, 1);
        assert_eq!(caps.max_block_size, 1024);
    }

    #[test]
    fn test_health_status_variants() {
        let healthy = QrngHealthStatus::Healthy;
        let degraded = QrngHealthStatus::Degraded {
            reason: "test".into(),
        };
        let unavailable = QrngHealthStatus::Unavailable {
            reason: "test".into(),
        };

        assert_eq!(healthy, QrngHealthStatus::Healthy);
        assert!(matches!(degraded, QrngHealthStatus::Degraded { .. }));
        assert!(matches!(unavailable, QrngHealthStatus::Unavailable { .. }));
    }

    #[test]
    fn test_create_mock_provider() {
        let provider = QrngProviderFactory::create_mock();
        assert_eq!(provider.source_id(), QrngSource::Mock);
    }

    #[test]
    fn test_create_anu_provider() {
        let config = QrngProviderConfig::Anu(AnuQrngConfig::default());
        let provider = QrngProviderFactory::create(config).unwrap();
        assert_eq!(provider.source_id(), QrngSource::AnuCloud);
    }

    #[tokio::test]
    async fn test_mock_provider_entropy() {
        let provider = QrngProviderFactory::create_mock();
        let entropy = provider.get_entropy().await.unwrap();
        assert_eq!(entropy.len(), 32);
    }
}
