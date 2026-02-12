//! Quantum Random Number Generator sources.
//!
//! All entropy in Veritas Q must come from QRNG sources.
//!
//! ## Multi-Vendor Support
//!
//! This module implements the QRNG Open API Framework for interoperability
//! between different quantum entropy providers:
//!
//! - **LfD QRNG** - LfD Germany (default fallback, free, backed by ID Quantique hardware)
//! - **ID Quantique** - Production-grade quantum entropy (requires API key)
//! - **ANU QRNG** - Australian National University (deprecated - SSL expired)
//! - **Mock** - Deterministic mock for testing (always available, no network required)
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

// MockQrng is always available (no network dependency)
mod mock;
pub use mock::MockQrng;

#[cfg(feature = "network")]
mod anu;
#[cfg(feature = "network")]
mod http_client;
#[cfg(feature = "network")]
mod lfd;
#[cfg(feature = "network")]
mod provider;

#[cfg(feature = "network")]
pub use anu::{AnuQrng, AnuQrngConfig};
#[cfg(feature = "network")]
pub use lfd::{LfdQrng, LfdQrngConfig};
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
#[cfg(feature = "network")]
#[async_trait]
pub trait QuantumEntropySource: Send + Sync {
    /// Fetch 256 bits (32 bytes) of quantum random entropy.
    ///
    /// This method may perform network requests and should be called
    /// asynchronously. Implementations should handle retries internally.
    async fn get_entropy(&self) -> Result<[u8; 32]>;

    /// Returns the source identifier for attestation.
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
    /// Australian National University QRNG API (deprecated - SSL expired)
    AnuCloud,
    /// LfD QRNG API (Germany, backed by ID Quantique hardware)
    LfdCloud,
    /// Device-embedded QRNG hardware (e.g., Samsung Quantum chip)
    DeviceHardware { device_id: String },
    /// Mock source for testing only (NOT quantum-safe!)
    Mock,
}

/// Validate that entropy bytes are not degenerate.
///
/// Performs basic sanity checks to detect broken or stuck QRNG sources:
/// - Rejects all-zero bytes
/// - Rejects all-identical bytes (e.g., all 0xFF)
/// - Rejects repeating 2-byte patterns (e.g., 0xAB 0xCD repeated)
///
/// This is NOT a full NIST SP 800-90B test — it only catches obvious failures.
#[cfg(feature = "network")]
pub fn validate_entropy(entropy: &[u8; 32]) -> crate::error::Result<()> {
    // Check all-zero
    if entropy.iter().all(|&b| b == 0) {
        return Err(crate::error::VeritasError::QrngError(
            "Degenerate entropy detected: all zeros".into(),
        ));
    }

    // Check all-identical bytes
    if entropy.iter().all(|&b| b == entropy[0]) {
        return Err(crate::error::VeritasError::QrngError(
            "Degenerate entropy detected: all identical bytes".into(),
        ));
    }

    // Check repeating 2-byte pattern
    if entropy.len() >= 4 {
        let pattern = &entropy[0..2];
        let is_repeating = entropy.chunks(2).all(|chunk| chunk == pattern);
        if is_repeating {
            return Err(crate::error::VeritasError::QrngError(
                "Degenerate entropy detected: repeating 2-byte pattern".into(),
            ));
        }
    }

    Ok(())
}

impl std::fmt::Display for QrngSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::IdQuantiqueCloud => write!(f, "ID Quantique Cloud"),
            Self::AnuCloud => write!(f, "ANU QRNG"),
            Self::LfdCloud => write!(f, "LfD QRNG (Germany)"),
            Self::DeviceHardware { device_id } => write!(f, "Hardware: {device_id}"),
            Self::Mock => write!(f, "Mock (NOT QUANTUM-SAFE)"),
        }
    }
}

#[cfg(all(test, feature = "network"))]
mod tests {
    use super::validate_entropy;

    #[test]
    fn test_validate_entropy_rejects_all_zeros() {
        let entropy = [0u8; 32];
        assert!(validate_entropy(&entropy).is_err());
    }

    #[test]
    fn test_validate_entropy_rejects_all_identical() {
        let entropy = [0xFF; 32];
        assert!(validate_entropy(&entropy).is_err());
    }

    #[test]
    fn test_validate_entropy_rejects_repeating_2byte() {
        let mut entropy = [0u8; 32];
        for i in 0..16 {
            entropy[i * 2] = 0xAB;
            entropy[i * 2 + 1] = 0xCD;
        }
        assert!(validate_entropy(&entropy).is_err());
    }

    #[test]
    fn test_validate_entropy_accepts_good_entropy() {
        let entropy: [u8; 32] = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, 32,
        ];
        assert!(validate_entropy(&entropy).is_ok());
    }
}
