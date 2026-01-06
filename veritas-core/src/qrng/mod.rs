//! Quantum Random Number Generator sources.
//!
//! All entropy in Veritas Q must come from QRNG sources.

#[cfg(feature = "network")]
mod anu;
#[cfg(feature = "network")]
mod mock;

#[cfg(feature = "network")]
pub use anu::{AnuQrng, AnuQrngConfig};
#[cfg(feature = "network")]
pub use mock::MockQrng;

#[cfg(feature = "network")]
use async_trait::async_trait;

#[cfg(feature = "network")]
use crate::error::Result;

/// Trait for quantum entropy sources.
/// All entropy in Veritas Q must come from QRNG sources.
#[cfg(feature = "network")]
#[async_trait]
pub trait QuantumEntropySource: Send + Sync {
    /// Fetch 256 bits (32 bytes) of quantum random entropy.
    async fn get_entropy(&self) -> Result<[u8; 32]>;

    /// Returns the source identifier for attestation.
    fn source_id(&self) -> QrngSource;
}

/// Identifies the QRNG source for attestation purposes.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum QrngSource {
    /// ID Quantique cloud API
    IdQuantiqueCloud,
    /// Australian National University QRNG API
    AnuCloud,
    /// Device-embedded QRNG hardware (e.g., Samsung Quantum chip)
    DeviceHardware { device_id: String },
    /// Mock source for testing only
    Mock,
}
