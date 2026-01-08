//! Perceptual hashing for images.
//!
//! This module provides perceptual hash computation for detecting similar images
//! even after re-encoding, compression, or minor modifications.
//!
//! # Algorithm
//!
//! Uses the Blockhash algorithm which produces a consistent 64-bit (8 byte) hash.
//! This hash is robust against JPEG compression, resizing, and minor cropping.
//!
//! # Usage
//!
//! ```no_run
//! use veritas_core::watermark::{PerceptualHasher, HashAlgorithm};
//!
//! let image_data = std::fs::read("image.jpg").unwrap();
//! let hasher = PerceptualHasher::new(HashAlgorithm::Blockhash64);
//! let hash1 = hasher.hash_bytes(&image_data).unwrap();
//!
//! // Compare two hashes
//! let image_data2 = std::fs::read("image2.jpg").unwrap();
//! let hash2 = hasher.hash_bytes(&image_data2).unwrap();
//! let distance = hash1.hamming_distance(&hash2).unwrap();
//! let similar = distance <= 10; // Threshold for similarity
//! ```

use crate::error::{Result, VeritasError};
use blockhash::{blockhash64, Blockhash64};
use image::DynamicImage;
use serde::{Deserialize, Serialize};

/// Fixed hash size in bytes (64 bits = 8 bytes).
pub const PERCEPTUAL_HASH_SIZE: usize = 8;

/// Perceptual hash algorithm selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum HashAlgorithm {
    /// Blockhash64 - consistent 64-bit output, grid-based algorithm.
    /// This is the recommended algorithm for production use.
    #[default]
    Blockhash64,
}

/// Computed perceptual hash with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerceptualHash {
    /// The hash bytes (exactly 8 bytes for Blockhash64)
    pub hash: Vec<u8>,
    /// Algorithm used to compute the hash
    pub algorithm: HashAlgorithm,
    /// Hash size in bits (64 for Blockhash64)
    pub bit_size: u32,
}

impl PerceptualHash {
    /// Create a new perceptual hash from fixed-size bytes.
    pub fn new(hash: [u8; PERCEPTUAL_HASH_SIZE], algorithm: HashAlgorithm) -> Self {
        Self {
            hash: hash.to_vec(),
            algorithm,
            bit_size: (PERCEPTUAL_HASH_SIZE * 8) as u32,
        }
    }

    /// Create from variable-size bytes (for legacy compatibility).
    pub fn from_bytes(hash: Vec<u8>, algorithm: HashAlgorithm) -> Self {
        let bit_size = (hash.len() * 8) as u32;
        Self {
            hash,
            algorithm,
            bit_size,
        }
    }

    /// Compute the Hamming distance between two perceptual hashes.
    ///
    /// Supports comparing hashes of different sizes for backwards compatibility
    /// with legacy hashes. A size mismatch incurs a penalty of 8 bits per
    /// missing byte.
    ///
    /// # Returns
    ///
    /// - `Ok(distance)` if hashes are comparable
    /// - `Err` if either hash is empty
    pub fn hamming_distance(&self, other: &Self) -> Result<u32> {
        if self.hash.is_empty() || other.hash.is_empty() {
            return Err(VeritasError::PerceptualHashError(
                "Cannot compare empty hashes".into(),
            ));
        }

        hamming_distance(&self.hash, &other.hash).ok_or_else(|| {
            VeritasError::PerceptualHashError("Failed to compute Hamming distance".into())
        })
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
        Ok(Self::from_bytes(hash, algorithm))
    }

    /// Check if this hash has the standard size (8 bytes).
    pub fn is_standard_size(&self) -> bool {
        self.hash.len() == PERCEPTUAL_HASH_SIZE
    }
}

/// Perceptual hasher configuration and computation.
#[derive(Debug, Clone, Default)]
pub struct PerceptualHasher {
    algorithm: HashAlgorithm,
}

impl PerceptualHasher {
    /// Create a new perceptual hasher with the specified algorithm.
    pub fn new(algorithm: HashAlgorithm) -> Self {
        Self { algorithm }
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
        match self.algorithm {
            HashAlgorithm::Blockhash64 => {
                let hash: Blockhash64 = blockhash64(image);
                let hash_bytes: [u8; 8] = hash.into();
                Ok(PerceptualHash::new(hash_bytes, HashAlgorithm::Blockhash64))
            }
        }
    }

    /// Check if the provided bytes appear to be a supported image format.
    pub fn is_supported_format(data: &[u8]) -> bool {
        image::guess_format(data).is_ok()
    }

    /// Get the algorithm used by this hasher.
    pub fn algorithm(&self) -> HashAlgorithm {
        self.algorithm
    }
}

/// Compute a perceptual hash for image data using default settings.
///
/// Uses Blockhash64 algorithm which produces exactly 8 bytes.
///
/// # Arguments
///
/// * `image_data` - Raw image bytes (JPEG, PNG, GIF, or WebP)
///
/// # Returns
///
/// The computed perceptual hash bytes (exactly 8 bytes), or `None` if the data
/// is not a valid image.
pub fn compute_phash(image_data: &[u8]) -> Option<Vec<u8>> {
    let hasher = PerceptualHasher::default();
    hasher.hash_bytes(image_data).ok().map(|h| h.hash)
}

/// Compute Hamming distance between two perceptual hash byte arrays.
///
/// Supports comparing hashes of different sizes for backwards compatibility.
/// When sizes differ, compares the overlapping portion and adds a penalty
/// of 8 bits per byte of size difference.
///
/// # Returns
///
/// The number of differing bits (including size penalty), or `None` if either
/// array is empty.
pub fn hamming_distance(hash1: &[u8], hash2: &[u8]) -> Option<u32> {
    if hash1.is_empty() || hash2.is_empty() {
        return None;
    }

    let min_len = hash1.len().min(hash2.len());

    // Compute Hamming distance for overlapping bytes
    let distance: u32 = hash1[..min_len]
        .iter()
        .zip(hash2[..min_len].iter())
        .map(|(a, b)| (a ^ b).count_ones())
        .sum();

    // Add penalty for size mismatch (8 bits per byte difference)
    let size_penalty = (hash1.len().abs_diff(hash2.len()) * 8) as u32;

    Some(distance + size_penalty)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_algorithm_default() {
        assert_eq!(HashAlgorithm::default(), HashAlgorithm::Blockhash64);
    }

    #[test]
    fn test_perceptual_hasher_default() {
        let hasher = PerceptualHasher::default();
        assert_eq!(hasher.algorithm(), HashAlgorithm::Blockhash64);
    }

    #[test]
    fn test_perceptual_hash_size() {
        assert_eq!(PERCEPTUAL_HASH_SIZE, 8);
    }

    #[test]
    fn test_hamming_distance_identical() {
        let hash1 = vec![0x00, 0xFF, 0xAA, 0x55, 0x00, 0xFF, 0xAA, 0x55];
        let hash2 = vec![0x00, 0xFF, 0xAA, 0x55, 0x00, 0xFF, 0xAA, 0x55];
        assert_eq!(hamming_distance(&hash1, &hash2), Some(0));
    }

    #[test]
    fn test_hamming_distance_different() {
        let hash1 = vec![0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        let hash2 = vec![0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
        assert_eq!(hamming_distance(&hash1, &hash2), Some(64)); // 8 bytes * 8 bits
    }

    #[test]
    fn test_hamming_distance_partial() {
        let hash1 = vec![0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        let hash2 = vec![0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]; // 1 bit different
        assert_eq!(hamming_distance(&hash1, &hash2), Some(1));
    }

    #[test]
    fn test_hamming_distance_size_mismatch_with_penalty() {
        // Legacy 5-byte hash vs new 8-byte hash
        let hash1 = vec![0x00, 0x00, 0x00, 0x00, 0x00]; // 5 bytes
        let hash2 = vec![0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]; // 8 bytes

        // Should have penalty of 3 bytes * 8 bits = 24 bits
        assert_eq!(hamming_distance(&hash1, &hash2), Some(24));
    }

    #[test]
    fn test_hamming_distance_empty() {
        let hash1: Vec<u8> = vec![];
        let hash2 = vec![0x00, 0x00];
        assert_eq!(hamming_distance(&hash1, &hash2), None);
    }

    #[test]
    fn test_perceptual_hash_hex_roundtrip() {
        let original = PerceptualHash::new(
            [0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE],
            HashAlgorithm::Blockhash64,
        );
        let hex = original.to_hex();
        assert_eq!(hex, "deadbeefcafebabe");

        let restored = PerceptualHash::from_hex(&hex, HashAlgorithm::Blockhash64).unwrap();
        assert_eq!(restored.hash, original.hash);
        assert_eq!(restored.algorithm, original.algorithm);
    }

    #[test]
    fn test_perceptual_hash_similarity() {
        let hash1 = PerceptualHash::new(
            [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
            HashAlgorithm::Blockhash64,
        );
        let hash2 = PerceptualHash::new(
            [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
            HashAlgorithm::Blockhash64,
        );

        // 1 bit difference, within default threshold of 10
        assert!(hash1.is_similar(&hash2, None).unwrap());

        // With threshold of 0, not similar
        assert!(!hash1.is_similar(&hash2, Some(0)).unwrap());
    }

    #[test]
    fn test_is_standard_size() {
        let standard =
            PerceptualHash::new([0x00; PERCEPTUAL_HASH_SIZE], HashAlgorithm::Blockhash64);
        assert!(standard.is_standard_size());

        let legacy = PerceptualHash::from_bytes(vec![0x00; 5], HashAlgorithm::Blockhash64);
        assert!(!legacy.is_standard_size());
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
}
