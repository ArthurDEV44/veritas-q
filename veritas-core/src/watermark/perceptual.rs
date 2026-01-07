//! Perceptual hashing for images.
//!
//! This module provides perceptual hash computation for detecting similar images
//! even after re-encoding, compression, or minor modifications.
//!
//! # Algorithms
//!
//! - **pHash (DCT-based)**: Most robust against compression and scaling
//! - **dHash (Gradient)**: Fast and effective for detecting duplicates
//! - **aHash (Average)**: Simple but less robust
//!
//! # Usage
//!
//! ```no_run
//! use veritas_core::watermark::{PerceptualHasher, HashAlgorithm};
//!
//! let image_data = std::fs::read("image.jpg").unwrap();
//! let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
//! let hash1 = hasher.hash_bytes(&image_data).unwrap();
//!
//! // Compare two hashes
//! let image_data2 = std::fs::read("image2.jpg").unwrap();
//! let hash2 = hasher.hash_bytes(&image_data2).unwrap();
//! let distance = hash1.hamming_distance(&hash2).unwrap();
//! let similar = distance <= 10; // Threshold for similarity
//! ```

use crate::error::{Result, VeritasError};
use image::DynamicImage;
use image_hasher::{HashAlg, HasherConfig, ImageHash};
use serde::{Deserialize, Serialize};

/// Perceptual hash algorithm selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum HashAlgorithm {
    /// Average hash (aHash) - simple but less robust
    Average,
    /// Gradient hash (dHash) - fast and effective
    Gradient,
    /// DCT-based perceptual hash (pHash) - most robust
    #[default]
    PHash,
    /// Blockhash algorithm
    Blockhash,
}

impl HashAlgorithm {
    /// Convert to image_hasher's HashAlg enum.
    fn to_hash_alg(self) -> HashAlg {
        match self {
            Self::Average => HashAlg::Mean,
            Self::Gradient => HashAlg::Gradient,
            Self::PHash => HashAlg::DoubleGradient, // DCT-based in image_hasher
            Self::Blockhash => HashAlg::Blockhash,
        }
    }
}

/// Computed perceptual hash with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerceptualHash {
    /// The hash bytes (typically 8 or 16 bytes depending on config)
    pub hash: Vec<u8>,
    /// Algorithm used to compute the hash
    pub algorithm: HashAlgorithm,
    /// Hash size in bits
    pub bit_size: u32,
}

impl PerceptualHash {
    /// Create a new perceptual hash from raw bytes.
    pub fn new(hash: Vec<u8>, algorithm: HashAlgorithm) -> Self {
        let bit_size = (hash.len() * 8) as u32;
        Self {
            hash,
            algorithm,
            bit_size,
        }
    }

    /// Compute the Hamming distance between two perceptual hashes.
    ///
    /// Lower values indicate more similar images.
    /// A distance of 0 means identical hashes.
    ///
    /// # Returns
    ///
    /// - `Ok(distance)` if hashes are comparable
    /// - `Err` if hashes have different sizes or algorithms
    pub fn hamming_distance(&self, other: &Self) -> Result<u32> {
        if self.algorithm != other.algorithm {
            return Err(VeritasError::PerceptualHashError(
                "Cannot compare hashes with different algorithms".into(),
            ));
        }

        if self.hash.len() != other.hash.len() {
            return Err(VeritasError::PerceptualHashError(format!(
                "Hash size mismatch: {} vs {} bytes",
                self.hash.len(),
                other.hash.len()
            )));
        }

        let distance = self
            .hash
            .iter()
            .zip(other.hash.iter())
            .map(|(a, b)| (a ^ b).count_ones())
            .sum();

        Ok(distance)
    }

    /// Check if two images are similar based on Hamming distance threshold.
    ///
    /// # Arguments
    ///
    /// * `other` - The other hash to compare against
    /// * `threshold` - Maximum Hamming distance to consider similar (default: 10)
    ///
    /// # Returns
    ///
    /// `true` if the hashes are within the threshold distance
    pub fn is_similar(&self, other: &Self, threshold: Option<u32>) -> Result<bool> {
        let threshold = threshold.unwrap_or(10);
        let distance = self.hamming_distance(other)?;
        Ok(distance <= threshold)
    }

    /// Get the hash as a hexadecimal string.
    pub fn to_hex(&self) -> String {
        hex::encode(&self.hash)
    }

    /// Create a perceptual hash from a hexadecimal string.
    pub fn from_hex(hex_str: &str, algorithm: HashAlgorithm) -> Result<Self> {
        let hash = hex::decode(hex_str)
            .map_err(|e| VeritasError::PerceptualHashError(format!("Invalid hex string: {}", e)))?;
        Ok(Self::new(hash, algorithm))
    }
}

/// Perceptual hasher configuration and computation.
#[derive(Debug, Clone)]
pub struct PerceptualHasher {
    algorithm: HashAlgorithm,
    hash_size: u32,
}

impl Default for PerceptualHasher {
    fn default() -> Self {
        Self::new(HashAlgorithm::default())
    }
}

impl PerceptualHasher {
    /// Create a new perceptual hasher with the specified algorithm.
    ///
    /// Uses a default hash size of 8x8 = 64 bits.
    pub fn new(algorithm: HashAlgorithm) -> Self {
        Self {
            algorithm,
            hash_size: 8,
        }
    }

    /// Create a perceptual hasher with custom hash size.
    ///
    /// # Arguments
    ///
    /// * `algorithm` - The hashing algorithm to use
    /// * `hash_size` - Size of the hash (width and height), e.g., 8 for 8x8=64 bits
    pub fn with_size(algorithm: HashAlgorithm, hash_size: u32) -> Self {
        Self {
            algorithm,
            hash_size,
        }
    }

    /// Compute perceptual hash from raw image bytes.
    ///
    /// Supports JPEG, PNG, GIF, and WebP formats.
    pub fn hash_bytes(&self, image_data: &[u8]) -> Result<PerceptualHash> {
        // Load image from bytes
        let image = image::load_from_memory(image_data).map_err(|e| {
            VeritasError::PerceptualHashError(format!("Failed to decode image: {}", e))
        })?;

        self.hash_image(&image)
    }

    /// Compute perceptual hash from a DynamicImage.
    pub fn hash_image(&self, image: &DynamicImage) -> Result<PerceptualHash> {
        let hasher = HasherConfig::new()
            .hash_size(self.hash_size, self.hash_size)
            .hash_alg(self.algorithm.to_hash_alg())
            .to_hasher();

        let hash: ImageHash = hasher.hash_image(image);
        let hash_bytes = hash.as_bytes().to_vec();

        Ok(PerceptualHash::new(hash_bytes, self.algorithm))
    }

    /// Check if the provided bytes appear to be a supported image format.
    pub fn is_supported_format(data: &[u8]) -> bool {
        image::guess_format(data).is_ok()
    }

    /// Get the algorithm used by this hasher.
    pub fn algorithm(&self) -> HashAlgorithm {
        self.algorithm
    }

    /// Get the hash size (width/height).
    pub fn hash_size(&self) -> u32 {
        self.hash_size
    }
}

/// Compute a perceptual hash for image data using default settings.
///
/// This is a convenience function that uses pHash (DCT-based) algorithm
/// with 8x8 hash size (64 bits).
///
/// # Arguments
///
/// * `image_data` - Raw image bytes (JPEG, PNG, GIF, or WebP)
///
/// # Returns
///
/// The computed perceptual hash bytes, or `None` if the data is not a valid image.
pub fn compute_phash(image_data: &[u8]) -> Option<Vec<u8>> {
    let hasher = PerceptualHasher::default();
    hasher.hash_bytes(image_data).ok().map(|h| h.hash)
}

/// Compute Hamming distance between two perceptual hash byte arrays.
///
/// # Returns
///
/// The number of differing bits, or `None` if the arrays have different lengths.
pub fn hamming_distance(hash1: &[u8], hash2: &[u8]) -> Option<u32> {
    if hash1.len() != hash2.len() {
        return None;
    }

    Some(
        hash1
            .iter()
            .zip(hash2.iter())
            .map(|(a, b)| (a ^ b).count_ones())
            .sum(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_algorithm_default() {
        assert_eq!(HashAlgorithm::default(), HashAlgorithm::PHash);
    }

    #[test]
    fn test_perceptual_hasher_default() {
        let hasher = PerceptualHasher::default();
        assert_eq!(hasher.algorithm(), HashAlgorithm::PHash);
        assert_eq!(hasher.hash_size(), 8);
    }

    #[test]
    fn test_hamming_distance_identical() {
        let hash1 = vec![0x00, 0xFF, 0xAA, 0x55];
        let hash2 = vec![0x00, 0xFF, 0xAA, 0x55];
        assert_eq!(hamming_distance(&hash1, &hash2), Some(0));
    }

    #[test]
    fn test_hamming_distance_different() {
        let hash1 = vec![0x00, 0x00, 0x00, 0x00];
        let hash2 = vec![0xFF, 0xFF, 0xFF, 0xFF];
        assert_eq!(hamming_distance(&hash1, &hash2), Some(32)); // 4 bytes * 8 bits
    }

    #[test]
    fn test_hamming_distance_partial() {
        let hash1 = vec![0x00, 0x00];
        let hash2 = vec![0x01, 0x00]; // 1 bit different
        assert_eq!(hamming_distance(&hash1, &hash2), Some(1));
    }

    #[test]
    fn test_hamming_distance_length_mismatch() {
        let hash1 = vec![0x00, 0x00];
        let hash2 = vec![0x00, 0x00, 0x00];
        assert_eq!(hamming_distance(&hash1, &hash2), None);
    }

    #[test]
    fn test_perceptual_hash_hex_roundtrip() {
        let original = PerceptualHash::new(vec![0xDE, 0xAD, 0xBE, 0xEF], HashAlgorithm::PHash);
        let hex = original.to_hex();
        assert_eq!(hex, "deadbeef");

        let restored = PerceptualHash::from_hex(&hex, HashAlgorithm::PHash).unwrap();
        assert_eq!(restored.hash, original.hash);
        assert_eq!(restored.algorithm, original.algorithm);
    }

    #[test]
    fn test_perceptual_hash_similarity() {
        let hash1 = PerceptualHash::new(vec![0x00, 0x00, 0x00, 0x00], HashAlgorithm::PHash);
        let hash2 = PerceptualHash::new(vec![0x01, 0x00, 0x00, 0x00], HashAlgorithm::PHash);

        // 1 bit difference, within default threshold of 10
        assert!(hash1.is_similar(&hash2, None).unwrap());

        // With threshold of 0, not similar
        assert!(!hash1.is_similar(&hash2, Some(0)).unwrap());
    }

    #[test]
    fn test_is_supported_format() {
        // PNG magic bytes
        assert!(PerceptualHasher::is_supported_format(&[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
        ]));

        // JPEG magic bytes
        assert!(PerceptualHasher::is_supported_format(&[0xFF, 0xD8, 0xFF]));

        // Invalid
        assert!(!PerceptualHasher::is_supported_format(&[0x00, 0x00, 0x00]));
    }

    #[test]
    fn test_algorithm_conversion() {
        assert!(matches!(
            HashAlgorithm::Average.to_hash_alg(),
            HashAlg::Mean
        ));
        assert!(matches!(
            HashAlgorithm::Gradient.to_hash_alg(),
            HashAlg::Gradient
        ));
        assert!(matches!(
            HashAlgorithm::Blockhash.to_hash_alg(),
            HashAlg::Blockhash
        ));
    }
}
