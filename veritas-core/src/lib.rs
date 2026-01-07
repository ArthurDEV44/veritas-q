//! Veritas Core - Quantum-authenticated media sealing library
//!
//! This crate provides the core cryptographic primitives for creating and verifying
//! Veritas Seals - quantum-grade authenticated signatures for media content.
//!
//! # Features
//!
//! - Post-quantum signatures using ML-DSA-65 (FIPS 204)
//! - QRNG entropy binding for capture-time authenticity
//! - CBOR serialization for compact, efficient storage
//! - C2PA-compatible metadata format
//! - Secure key zeroization on drop
//!
//! # Example
//!
//! ```no_run
//! use veritas_core::{SealBuilder, MediaType, MockQrng, QuantumEntropySource, generate_keypair};
//!
//! # async fn example() -> veritas_core::Result<()> {
//! // Generate signing keypair (in production, use TEE-protected keys)
//! // The secret key is wrapped in ZeroizingSecretKey for secure memory handling
//! let (public_key, secret_key) = generate_keypair();
//!
//! // Use mock QRNG for testing (in production, use IdQuantiqueQrng)
//! let qrng = MockQrng::default();
//!
//! // Create and sign a seal for some content using the secure builder
//! let content = b"Hello World".to_vec();
//! let seal = SealBuilder::new(content, MediaType::Image)
//!     .build_secure(&qrng, &secret_key, &public_key)
//!     .await?;
//!
//! // Verify the seal
//! assert!(seal.verify()?);
//! # Ok(())
//! # }
//! ```

pub mod error;
pub mod qrng;
pub mod seal;
#[cfg(feature = "perceptual-hash")]
pub mod watermark;

#[cfg(feature = "c2pa")]
pub mod c2pa;

// Re-export main types for convenience
pub use error::{Result, VeritasError, CURRENT_SEAL_VERSION, MAX_SEAL_SIZE};
pub use qrng::QrngSource;
pub use seal::{
    generate_keypair, generate_keypair_raw, BlockchainAnchor, ContentHash,
    ContentVerificationResult, DeviceAttestation, MediaType, VerificationResult, VeritasSeal,
    ZeroizingSecretKey, MLDSA65_PUBLIC_KEY_BYTES, MLDSA65_SECRET_KEY_BYTES,
    MLDSA65_SIGNATURE_BYTES,
};

#[cfg(feature = "network")]
pub use seal::SealBuilder;

// Network-dependent exports (not available in Wasm)
#[cfg(feature = "network")]
pub use qrng::{AnuQrng, LfdQrng, MockQrng, QuantumEntropySource};

// Perceptual hashing exports (soft binding)
#[cfg(feature = "perceptual-hash")]
pub use watermark::{
    compute_phash, hamming_distance, HashAlgorithm, PerceptualHash, PerceptualHasher,
};

#[cfg(all(test, feature = "network"))]
mod tests {
    use super::*;

    /// Integration test: Generate entropy, create seal, sign and verify.
    #[tokio::test]
    async fn test_full_seal_workflow() {
        // Step 1: Generate mock entropy
        let qrng = MockQrng::default();
        let entropy = qrng.get_entropy().await.expect("Failed to get entropy");
        assert_eq!(entropy.len(), 32, "Entropy should be 256 bits");

        // Step 2: Create a seal for fictional content "Hello World"
        let (public_key, secret_key) = generate_keypair();
        let content = b"Hello World".to_vec();

        let seal = SealBuilder::new(content, MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        // Step 3: Verify the signature is valid
        let is_valid = seal.verify().expect("Verification failed");
        assert!(is_valid, "Seal signature should be valid");

        // Additional assertions
        assert_eq!(seal.version, CURRENT_SEAL_VERSION);
        assert_eq!(seal.qrng_source, QrngSource::Mock);
        assert_eq!(seal.media_type, MediaType::Image);
        assert!(!seal.signature.is_empty(), "Signature should not be empty");
        assert!(
            !seal.public_key.is_empty(),
            "Public key should not be empty"
        );
    }

    /// Test that seals with different content have different hashes.
    #[tokio::test]
    async fn test_different_content_different_hash() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let seal1 = SealBuilder::new(b"Content A".to_vec(), MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal 1");

        let seal2 = SealBuilder::new(b"Content B".to_vec(), MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal 2");

        assert_ne!(
            seal1.content_hash.crypto_hash, seal2.content_hash.crypto_hash,
            "Different content should have different hashes"
        );
    }
}
