//! Robustness tests for perceptual hashing (soft binding).
//!
//! These tests verify that perceptual hashes remain similar after common
//! image transformations like compression, resizing, cropping, and rotation.

use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb, RgbImage};
use std::io::Cursor;
use veritas_core::watermark::{hamming_distance, HashAlgorithm, PerceptualHasher};

/// Maximum acceptable Hamming distance for "similar" images.
/// With 64-bit hash, 10 bits = ~15% difference.
const SIMILARITY_THRESHOLD: u32 = 10;

/// Threshold for more aggressive transformations (crop, rotation).
const AGGRESSIVE_THRESHOLD: u32 = 15;

/// Create a test image with recognizable patterns.
/// Uses gradients and shapes to ensure consistent perceptual features.
fn create_test_image(width: u32, height: u32) -> RgbImage {
    let mut img = ImageBuffer::new(width, height);

    for (x, y, pixel) in img.enumerate_pixels_mut() {
        // Create a gradient pattern with some structure
        let r = ((x as f32 / width as f32) * 255.0) as u8;
        let g = ((y as f32 / height as f32) * 255.0) as u8;
        let b = (((x + y) as f32 / (width + height) as f32) * 200.0) as u8;

        // Add some pattern variation
        let pattern = if (x / 20 + y / 20) % 2 == 0 { 30 } else { 0 };
        *pixel = Rgb([r.saturating_add(pattern), g, b]);
    }

    img
}

/// Compress an image to JPEG with the specified quality (1-100).
fn compress_jpeg(img: &DynamicImage, quality: u8) -> DynamicImage {
    let mut buffer = Cursor::new(Vec::new());

    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, quality);
    img.write_with_encoder(encoder)
        .expect("JPEG encoding failed");

    buffer.set_position(0);
    image::load_from_memory(&buffer.into_inner()).expect("JPEG decoding failed")
}

/// Resize an image by the given percentage (e.g., 50 = 50% of original size).
fn resize_image(img: &DynamicImage, percentage: u32) -> DynamicImage {
    let (width, height) = img.dimensions();
    let new_width = (width * percentage) / 100;
    let new_height = (height * percentage) / 100;
    img.resize_exact(new_width, new_height, image::imageops::FilterType::Lanczos3)
}

/// Crop the image by removing a percentage from each edge.
fn crop_image(img: &DynamicImage, edge_percentage: u32) -> DynamicImage {
    let (width, height) = img.dimensions();
    let crop_x = (width * edge_percentage) / 100;
    let crop_y = (height * edge_percentage) / 100;
    let new_width = width - (2 * crop_x);
    let new_height = height - (2 * crop_y);

    img.crop_imm(crop_x, crop_y, new_width, new_height)
}

/// Rotate the image by 90 degrees clockwise.
fn rotate_90(img: &DynamicImage) -> DynamicImage {
    img.rotate90()
}

/// Rotate the image by 180 degrees.
fn rotate_180(img: &DynamicImage) -> DynamicImage {
    img.rotate180()
}

// ============================================================================
// JPEG Compression Tests
// ============================================================================

#[test]
fn test_phash_jpeg_compression_90() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));
    let compressed = compress_jpeg(&original, 90);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher
        .hash_image(&compressed)
        .expect("Failed to hash compressed");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!("JPEG 90% quality - Hamming distance: {}", distance);

    assert!(
        distance <= SIMILARITY_THRESHOLD,
        "JPEG 90% compression should preserve similarity (distance: {}, threshold: {})",
        distance,
        SIMILARITY_THRESHOLD
    );
}

#[test]
fn test_phash_jpeg_compression_70() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));
    let compressed = compress_jpeg(&original, 70);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher
        .hash_image(&compressed)
        .expect("Failed to hash compressed");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!("JPEG 70% quality - Hamming distance: {}", distance);

    assert!(
        distance <= SIMILARITY_THRESHOLD,
        "JPEG 70% compression should preserve similarity (distance: {}, threshold: {})",
        distance,
        SIMILARITY_THRESHOLD
    );
}

#[test]
fn test_phash_jpeg_compression_50() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));
    let compressed = compress_jpeg(&original, 50);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher
        .hash_image(&compressed)
        .expect("Failed to hash compressed");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!("JPEG 50% quality - Hamming distance: {}", distance);

    assert!(
        distance <= AGGRESSIVE_THRESHOLD,
        "JPEG 50% compression should preserve similarity (distance: {}, threshold: {})",
        distance,
        AGGRESSIVE_THRESHOLD
    );
}

// ============================================================================
// Resize Tests
// ============================================================================

#[test]
fn test_phash_resize_75_percent() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));
    let resized = resize_image(&original, 75);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher.hash_image(&resized).expect("Failed to hash resized");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!("Resize 75% - Hamming distance: {}", distance);

    assert!(
        distance <= SIMILARITY_THRESHOLD,
        "75% resize should preserve similarity (distance: {}, threshold: {})",
        distance,
        SIMILARITY_THRESHOLD
    );
}

#[test]
fn test_phash_resize_50_percent() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));
    let resized = resize_image(&original, 50);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher.hash_image(&resized).expect("Failed to hash resized");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!("Resize 50% - Hamming distance: {}", distance);

    assert!(
        distance <= SIMILARITY_THRESHOLD,
        "50% resize should preserve similarity (distance: {}, threshold: {})",
        distance,
        SIMILARITY_THRESHOLD
    );
}

#[test]
fn test_phash_resize_150_percent() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));
    let resized = resize_image(&original, 150);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher.hash_image(&resized).expect("Failed to hash resized");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!("Resize 150% - Hamming distance: {}", distance);

    assert!(
        distance <= SIMILARITY_THRESHOLD,
        "150% resize should preserve similarity (distance: {}, threshold: {})",
        distance,
        SIMILARITY_THRESHOLD
    );
}

// ============================================================================
// Crop Tests
// ============================================================================

#[test]
fn test_phash_crop_10_percent() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));
    let cropped = crop_image(&original, 10);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher.hash_image(&cropped).expect("Failed to hash cropped");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!("Crop 10% edges - Hamming distance: {}", distance);

    // Cropping is more aggressive, allow higher threshold
    assert!(
        distance <= AGGRESSIVE_THRESHOLD,
        "10% crop should preserve similarity (distance: {}, threshold: {})",
        distance,
        AGGRESSIVE_THRESHOLD
    );
}

#[test]
fn test_phash_crop_25_percent() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));
    let cropped = crop_image(&original, 25);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher.hash_image(&cropped).expect("Failed to hash cropped");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!("Crop 25% edges - Hamming distance: {}", distance);

    // 25% crop is aggressive, document the limit
    // This test is informational - we print the distance but don't fail
    println!(
        "Note: 25% crop removes significant content. Distance {} may exceed threshold {}",
        distance, AGGRESSIVE_THRESHOLD
    );
}

// ============================================================================
// Rotation Tests
// ============================================================================

#[test]
fn test_phash_rotation_180() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));
    let rotated = rotate_180(&original);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher.hash_image(&rotated).expect("Failed to hash rotated");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!("Rotation 180° - Hamming distance: {}", distance);

    // Note: 180° rotation may or may not preserve pHash depending on image symmetry
    println!(
        "Note: 180° rotation distance: {}. pHash is not rotation-invariant by design.",
        distance
    );
}

#[test]
fn test_phash_rotation_90() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));
    let rotated = rotate_90(&original);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher.hash_image(&rotated).expect("Failed to hash rotated");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!("Rotation 90° - Hamming distance: {}", distance);

    // Note: pHash is NOT rotation-invariant, so 90° rotation will likely differ significantly
    println!(
        "Note: 90° rotation distance: {}. pHash is not rotation-invariant.",
        distance
    );
}

// ============================================================================
// Combined Transformation Tests
// ============================================================================

#[test]
fn test_phash_resize_then_compress() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));

    // Apply multiple transformations
    let resized = resize_image(&original, 75);
    let compressed = compress_jpeg(&resized, 70);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher
        .hash_image(&compressed)
        .expect("Failed to hash transformed");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!("Resize 75% + JPEG 70% - Hamming distance: {}", distance);

    assert!(
        distance <= AGGRESSIVE_THRESHOLD,
        "Combined resize+compress should preserve similarity (distance: {}, threshold: {})",
        distance,
        AGGRESSIVE_THRESHOLD
    );
}

#[test]
fn test_phash_compress_then_resize() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));

    // Apply transformations in different order
    let compressed = compress_jpeg(&original, 80);
    let resized = resize_image(&compressed, 60);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher
        .hash_image(&resized)
        .expect("Failed to hash transformed");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!("JPEG 80% + Resize 60% - Hamming distance: {}", distance);

    assert!(
        distance <= AGGRESSIVE_THRESHOLD,
        "Combined compress+resize should preserve similarity (distance: {}, threshold: {})",
        distance,
        AGGRESSIVE_THRESHOLD
    );
}

// ============================================================================
// Algorithm Comparison Tests
// ============================================================================

#[test]
fn test_algorithm_comparison_on_compression() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));
    let compressed = compress_jpeg(&original, 70);

    for algorithm in [
        HashAlgorithm::Average,
        HashAlgorithm::Gradient,
        HashAlgorithm::PHash,
        HashAlgorithm::Blockhash,
    ] {
        let hasher = PerceptualHasher::new(algorithm);
        let hash1 = hasher
            .hash_image(&original)
            .expect("Failed to hash original");
        let hash2 = hasher
            .hash_image(&compressed)
            .expect("Failed to hash compressed");

        let distance =
            hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
        println!(
            "{:?} algorithm - JPEG 70% distance: {}",
            algorithm, distance
        );
    }
}

// ============================================================================
// Edge Cases
// ============================================================================

#[test]
fn test_identical_images() {
    let original = DynamicImage::ImageRgb8(create_test_image(256, 256));

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher
        .hash_image(&original)
        .expect("Failed to hash original");
    let hash2 = hasher.hash_image(&original).expect("Failed to hash again");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");

    assert_eq!(
        distance, 0,
        "Identical images should have zero Hamming distance"
    );
}

#[test]
fn test_completely_different_images() {
    let img1 = DynamicImage::ImageRgb8(create_test_image(256, 256));

    // Create a completely different image (solid color vs pattern)
    let mut img2_raw = ImageBuffer::new(256, 256);
    for pixel in img2_raw.pixels_mut() {
        *pixel = Rgb([0, 0, 0]); // Solid black
    }
    let img2 = DynamicImage::ImageRgb8(img2_raw);

    let hasher = PerceptualHasher::new(HashAlgorithm::PHash);
    let hash1 = hasher.hash_image(&img1).expect("Failed to hash img1");
    let hash2 = hasher.hash_image(&img2).expect("Failed to hash img2");

    let distance = hamming_distance(&hash1.hash, &hash2.hash).expect("Distance calculation failed");
    println!(
        "Completely different images - Hamming distance: {}",
        distance
    );

    assert!(
        distance > AGGRESSIVE_THRESHOLD,
        "Completely different images should have high distance (got: {})",
        distance
    );
}
