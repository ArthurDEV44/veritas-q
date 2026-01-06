//! Quantum Random Number Generator sources.
//!
//! All entropy in Veritas Q must come from QRNG sources.
//!
//! ## Multi-Vendor Support
//!
//! This module implements the QRNG Open API Framework for interoperability
//! between different quantum entropy providers:
//!
//! - **ANU QRNG** - Australian National University (free, development)
//! - **ID Quantique** - Production-grade quantum entropy (requires API key)
//! - **Mock** - Deterministic mock for testing
//!
//! ## Quick Start
//!
//! ```no_run
//! use veritas_core::qrng::{QrngProviderFactory, QrngProviderConfig, QuantumEntropySource};
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! // Auto-select best available provider
//! let provider = QrngProviderFactory::create(QrngProviderConfig::Auto)?;
//! let entropy = provider.get_entropy().await?;
//! # Ok(())
//! # }
//! ```
//!
//! ## QRNG Open API Compliance
//!
//! Based on the Palo Alto Networks QRNG Open API Framework (2025).
//! See: <https://github.com/PaloAltoNetworks/QRNG-OPENAPI>

#[cfg(feature = "network")]
mod anu;
#[cfg(feature = "network")]
mod mock;
#[cfg(feature = "network")]
mod provider;

#[cfg(feature = "network")]
pub use anu::{AnuQrng, AnuQrngConfig};
#[cfg(feature = "network")]
pub use mock::MockQrng;
#[cfg(feature = "network")]
pub use provider::{
    IdQuantiqueConfig, IdQuantiqueQrng, QrngCapabilities, QrngHealthStatus, QrngProviderConfig,
    QrngProviderFactory,
};

#[cfg(feature = "network")]
use async_trait::async_trait;

#[cfg(feature = "network")]
use crate::error::Result;

/// Trait for quantum entropy sources.
///
/// All entropy in Veritas Q must come from QRNG sources.
/// Implementations must be thread-safe (`Send + Sync`).
///
/// ## Example
///
/// ```no_run
/// use veritas_core::qrng::{AnuQrng, QuantumEntropySource};
///
/// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
/// let qrng = AnuQrng::new()?;
/// let entropy = qrng.get_entropy().await?;
/// println!("Got {} bytes of quantum entropy", entropy.len());
/// # Ok(())
/// # }
/// ```
#[cfg(feature = "network")]
#[async_trait]
pub trait QuantumEntropySource: Send + Sync {
    /// Fetch 256 bits (32 bytes) of quantum random entropy.
    ///
    /// This method may perform network requests and should be called
    /// asynchronously. Implementations should handle retries internally.
    async fn get_entropy(&self) -> Result<[u8; 32]>;

    /// Returns the source identifier for attestation.
    ///
    /// This identifier is included in the VeritasSeal to prove
    /// the origin of the quantum entropy.
    fn source_id(&self) -> QrngSource;
}

/// Identifies the QRNG source for attestation purposes.
///
/// This enum is serialized into the VeritasSeal to provide
/// proof of entropy origin.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum QrngSource {
    /// ID Quantique cloud API (production)
    IdQuantiqueCloud,
    /// Australian National University QRNG API (development)
    AnuCloud,
    /// Device-embedded QRNG hardware (e.g., Samsung Quantum chip)
    DeviceHardware { device_id: String },
    /// Mock source for testing only (NOT quantum-safe!)
    Mock,
}

impl std::fmt::Display for QrngSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::IdQuantiqueCloud => write!(f, "ID Quantique Cloud"),
            Self::AnuCloud => write!(f, "ANU QRNG"),
            Self::DeviceHardware { device_id } => write!(f, "Hardware: {device_id}"),
            Self::Mock => write!(f, "Mock (NOT QUANTUM-SAFE)"),
        }
    }
}
