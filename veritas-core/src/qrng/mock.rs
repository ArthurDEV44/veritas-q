//! Mock QRNG implementation for testing.

use async_trait::async_trait;
use sha3::{Digest, Sha3_256};

use super::{QrngSource, QuantumEntropySource};
use crate::error::Result;

/// Mock QRNG implementation for testing.
/// WARNING: Do not use in production - uses deterministic entropy!
pub struct MockQrng {
    seed: u64,
}

impl MockQrng {
    pub fn new(seed: u64) -> Self {
        Self { seed }
    }

    /// Create a mock with default seed for simple tests.
    pub fn default_test() -> Self {
        Self::new(0xDEADBEEF_CAFEBABE)
    }
}

impl Default for MockQrng {
    fn default() -> Self {
        Self::default_test()
    }
}

#[async_trait]
impl QuantumEntropySource for MockQrng {
    async fn get_entropy(&self) -> Result<[u8; 32]> {
        // Generate deterministic "entropy" from seed using SHA3
        // This is NOT cryptographically random - for testing only!
        let mut hasher = Sha3_256::new();
        hasher.update(self.seed.to_le_bytes());
        hasher.update(b"veritas-mock-entropy");

        let result = hasher.finalize();
        let mut entropy = [0u8; 32];
        entropy.copy_from_slice(&result);
        Ok(entropy)
    }

    fn source_id(&self) -> QrngSource {
        QrngSource::Mock
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_qrng_deterministic() {
        let qrng1 = MockQrng::new(42);
        let qrng2 = MockQrng::new(42);

        let entropy1 = qrng1.get_entropy().await.unwrap();
        let entropy2 = qrng2.get_entropy().await.unwrap();

        assert_eq!(entropy1, entropy2, "Same seed should produce same entropy");
    }

    #[tokio::test]
    async fn test_mock_qrng_different_seeds() {
        let qrng1 = MockQrng::new(1);
        let qrng2 = MockQrng::new(2);

        let entropy1 = qrng1.get_entropy().await.unwrap();
        let entropy2 = qrng2.get_entropy().await.unwrap();

        assert_ne!(
            entropy1, entropy2,
            "Different seeds should produce different entropy"
        );
    }

    #[tokio::test]
    async fn test_mock_source_id() {
        let qrng = MockQrng::default();
        assert_eq!(qrng.source_id(), QrngSource::Mock);
    }
}
