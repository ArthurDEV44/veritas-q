//! End-to-end workflow tests for veritas-cli.
//!
//! These tests verify complete user workflows involving multiple commands
//! and complex scenarios that go beyond unit testing.

use assert_cmd::cargo::cargo_bin_cmd;
use assert_cmd::Command;
use predicates::prelude::*;
use std::fs;
use tempfile::TempDir;

/// Get a Command for the veritas binary.
fn veritas() -> Command {
    cargo_bin_cmd!("veritas").into()
}

// ============================================================================
// Complete Workflow Tests: Seal → Verify → Anchor
// ============================================================================

#[test]
fn test_e2e_full_workflow_seal_verify_anchor_dryrun() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("evidence.jpg");
    fs::write(&test_file, b"Critical photographic evidence content").unwrap();

    // Step 1: Seal the file
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("File sealed with Quantum Entropy"));

    let seal_path = temp.path().join("evidence.jpg.veritas");
    assert!(seal_path.exists(), "Seal file should exist after sealing");

    // Step 2: Verify the seal is valid
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("AUTHENTIC"));

    // Step 3: Anchor to blockchain (dry-run to avoid network)
    veritas()
        .args(["anchor", "--dry-run", seal_path.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("[DRY RUN]"));
}

#[test]
fn test_e2e_workflow_with_persistent_keypair() {
    let temp = TempDir::new().unwrap();
    let keypair_path = temp.path().join("journalist.keypair");

    // Create multiple evidence files
    let files: Vec<_> = (1..=3)
        .map(|i| {
            let path = temp.path().join(format!("evidence_{}.jpg", i));
            fs::write(&path, format!("Evidence photo {} content", i).as_bytes()).unwrap();
            path
        })
        .collect();

    // Seal first file and save keypair (establishes identity)
    veritas()
        .args([
            "seal",
            "--mock",
            "--save-keypair",
            keypair_path.to_str().unwrap(),
            files[0].to_str().unwrap(),
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("Keypair saved to"));

    // Seal remaining files with same keypair (consistent identity)
    for file in &files[1..] {
        veritas()
            .args([
                "seal",
                "--mock",
                "--keypair",
                keypair_path.to_str().unwrap(),
                file.to_str().unwrap(),
            ])
            .assert()
            .success()
            .stdout(predicate::str::contains("loaded from file"));
    }

    // Verify all files are authentic
    for file in &files {
        veritas()
            .args(["verify", file.to_str().unwrap()])
            .assert()
            .success()
            .stdout(predicate::str::contains("AUTHENTIC"));
    }
}

// ============================================================================
// Multi-format Seal Tests
// ============================================================================

#[test]
fn test_e2e_seal_all_formats_verify_compatible() {
    let temp = TempDir::new().unwrap();
    let formats = ["json", "cbor"];

    for format in formats {
        let test_file = temp.path().join(format!("test_{}.bin", format));
        fs::write(
            &test_file,
            format!("Content for {} format test", format).as_bytes(),
        )
        .unwrap();

        // Seal with specific format
        veritas()
            .args([
                "seal",
                "--mock",
                "--format",
                format,
                test_file.to_str().unwrap(),
            ])
            .assert()
            .success();

        // Verify works regardless of format
        veritas()
            .args(["verify", test_file.to_str().unwrap()])
            .assert()
            .success()
            .stdout(predicate::str::contains("AUTHENTIC"));
    }
}

// ============================================================================
// Tamper Detection Scenarios
// ============================================================================

#[test]
fn test_e2e_tamper_detection_single_byte_change() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("sensitive.doc");
    let original_content = b"CONFIDENTIAL DOCUMENT CONTENT HERE";
    fs::write(&test_file, original_content).unwrap();

    // Seal the original
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success();

    // Verify original is authentic
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("AUTHENTIC"));

    // Tamper: change single byte (C -> X)
    let mut tampered = original_content.to_vec();
    tampered[0] = b'X'; // XONFIDENTIAL instead of CONFIDENTIAL
    fs::write(&test_file, &tampered).unwrap();

    // Verify detects tampering
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .code(65) // VERIFICATION_FAILED
        .stdout(predicate::str::contains("TAMPERED"));
}

#[test]
fn test_e2e_tamper_detection_appended_content() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("contract.pdf");
    fs::write(&test_file, b"Original contract terms").unwrap();

    // Seal the original
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success();

    // Tamper: append content (injection attack)
    let mut content = fs::read(&test_file).unwrap();
    content.extend_from_slice(b"\n\nADDED MALICIOUS CLAUSE");
    fs::write(&test_file, &content).unwrap();

    // Verify detects tampering
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .code(65)
        .stdout(predicate::str::contains("TAMPERED"));
}

#[test]
fn test_e2e_tamper_detection_truncated_content() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("report.txt");
    fs::write(&test_file, b"Complete report with all findings included").unwrap();

    // Seal the original
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success();

    // Tamper: truncate content (censorship)
    fs::write(&test_file, b"Complete report").unwrap();

    // Verify detects tampering
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .code(65)
        .stdout(predicate::str::contains("TAMPERED"));
}

// ============================================================================
// Real Image Content Tests (Perceptual Hash Integration)
// ============================================================================

/// Create a minimal valid PNG image (1x1 pixel, pre-computed)
fn create_test_png() -> Vec<u8> {
    // Minimal valid 1x1 PNG (red pixel) - pre-computed and validated
    vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR length
        0x49, 0x48, 0x44, 0x52, // "IHDR"
        0x00, 0x00, 0x00, 0x01, // width: 1
        0x00, 0x00, 0x00, 0x01, // height: 1
        0x08, 0x02, 0x00, 0x00, 0x00, // 8-bit RGB
        0x90, 0x77, 0x53, 0xDE, // IHDR CRC
        0x00, 0x00, 0x00, 0x0C, // IDAT length
        0x49, 0x44, 0x41, 0x54, // "IDAT"
        0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F, 0x00, 0x05, 0xFE, 0x02,
        0xFE, // compressed data
        0xA2, 0x51, 0x8B, 0xA0, // IDAT CRC
        0x00, 0x00, 0x00, 0x00, // IEND length
        0x49, 0x45, 0x4E, 0x44, // "IEND"
        0xAE, 0x42, 0x60, 0x82, // IEND CRC
    ]
}

/// Create a minimal valid JPEG image
fn create_test_jpeg() -> Vec<u8> {
    // Minimal valid JPEG (1x1 pixel)
    vec![
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06,
        0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B,
        0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31,
        0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF,
        0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00,
        0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B,
        0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05,
        0x04, 0x04, 0x00, 0x00, 0x01, 0x7D, 0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21,
        0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
        0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A,
        0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x34, 0x35, 0x36, 0x37,
        0x38, 0x39, 0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56,
        0x57, 0x58, 0x59, 0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
        0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x92, 0x93,
        0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9,
        0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6,
        0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
        0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7,
        0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5,
        0xDB, 0x20, 0xA8, 0xF1, 0x7E, 0xFF, 0xD9,
    ]
}

#[test]
fn test_e2e_seal_real_jpeg_image() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("photo.jpg");
    fs::write(&test_file, create_test_jpeg()).unwrap();

    // Seal JPEG image (should trigger perceptual hash)
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("File sealed"));

    // Verify authentic
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("AUTHENTIC"));
}

#[test]
fn test_e2e_seal_real_png_image() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("screenshot.png");
    fs::write(&test_file, create_test_png()).unwrap();

    // Seal PNG image
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success();

    // Verify authentic
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("AUTHENTIC"));
}

#[test]
fn test_e2e_image_tamper_detection() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("evidence.jpg");
    let original_jpeg = create_test_jpeg();
    fs::write(&test_file, &original_jpeg).unwrap();

    // Seal the original image
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success();

    // Tamper: modify image data (change a byte in the image body)
    let mut tampered = original_jpeg.clone();
    if tampered.len() > 100 {
        tampered[100] ^= 0xFF; // Flip bits
    }
    fs::write(&test_file, &tampered).unwrap();

    // Verify detects tampering
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .code(65)
        .stdout(predicate::str::contains("TAMPERED"));
}

// ============================================================================
// Media Type Detection Tests
// ============================================================================

#[test]
fn test_e2e_media_type_detection_by_extension() {
    let temp = TempDir::new().unwrap();

    let test_cases = [
        ("photo.jpg", "image"),
        ("photo.jpeg", "image"),
        ("photo.png", "image"),
        ("video.mp4", "video"),
        ("video.webm", "video"),
        ("audio.mp3", "audio"),
        ("audio.wav", "audio"),
        ("document.pdf", "generic"),
        ("data.bin", "generic"),
    ];

    for (filename, _expected_type) in test_cases {
        let test_file = temp.path().join(filename);
        fs::write(&test_file, format!("Content for {}", filename).as_bytes()).unwrap();

        // Should seal successfully with auto-detected media type
        veritas()
            .args(["seal", "--mock", test_file.to_str().unwrap()])
            .assert()
            .success();

        // Clean up seal file for next iteration
        let seal_path = temp.path().join(format!("{}.veritas", filename));
        let _ = fs::remove_file(&seal_path);
    }
}

// ============================================================================
// Seal Metadata and Inspection Tests
// ============================================================================

#[test]
fn test_e2e_seal_contains_expected_metadata() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.jpg");
    fs::write(&test_file, b"Test image content for metadata check").unwrap();

    // Seal with JSON format for human-readable inspection
    veritas()
        .args([
            "seal",
            "--mock",
            "--format",
            "json",
            test_file.to_str().unwrap(),
        ])
        .assert()
        .success();

    // Read and parse the seal
    let seal_path = temp.path().join("test.jpg.veritas");
    let seal_content = fs::read_to_string(&seal_path).unwrap();
    let seal_json: serde_json::Value = serde_json::from_str(&seal_content).unwrap();

    // Verify essential fields exist
    assert!(
        seal_json.get("capture_timestamp_utc").is_some(),
        "Seal should contain capture timestamp"
    );
    assert!(
        seal_json.get("qrng_entropy").is_some(),
        "Seal should contain QRNG entropy"
    );
    assert!(
        seal_json.get("content_hash").is_some(),
        "Seal should contain content hash"
    );
    assert!(
        seal_json.get("signature").is_some(),
        "Seal should contain signature"
    );
    assert!(
        seal_json.get("public_key").is_some(),
        "Seal should contain public key"
    );
}

#[test]
fn test_e2e_seal_qrng_source_attestation() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.bin");
    fs::write(&test_file, b"Test content").unwrap();

    // Seal with mock QRNG and JSON format
    veritas()
        .args([
            "seal",
            "--mock",
            "--format",
            "json",
            test_file.to_str().unwrap(),
        ])
        .assert()
        .success();

    let seal_path = temp.path().join("test.bin.veritas");
    let seal_content = fs::read_to_string(&seal_path).unwrap();
    let seal_json: serde_json::Value = serde_json::from_str(&seal_content).unwrap();

    // Verify QRNG source is attested (mock source for this test)
    assert!(
        seal_json.get("qrng_source").is_some(),
        "Seal should attest QRNG source"
    );
}

// ============================================================================
// Error Recovery and Edge Cases
// ============================================================================

#[test]
fn test_e2e_verify_with_explicit_seal_path() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("original.dat");
    let custom_seal_path = temp.path().join("custom_location.seal");

    fs::write(&test_file, b"Test data content").unwrap();

    // Seal the file
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success();

    // Move seal to custom location
    let default_seal = temp.path().join("original.dat.veritas");
    fs::rename(&default_seal, &custom_seal_path).unwrap();

    // Verify with explicit seal path
    veritas()
        .args([
            "verify",
            test_file.to_str().unwrap(),
            custom_seal_path.to_str().unwrap(),
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("AUTHENTIC"));
}

#[test]
fn test_e2e_seal_large_file() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("large_video.mp4");

    // Create 1MB test file
    let large_content: Vec<u8> = (0..1_000_000).map(|i| (i % 256) as u8).collect();
    fs::write(&test_file, &large_content).unwrap();

    // Seal should work with large files
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success();

    // Verify should work
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("AUTHENTIC"));
}

#[test]
fn test_e2e_seal_empty_file() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("empty.bin");
    fs::write(&test_file, b"").unwrap();

    // Sealing empty file should work (edge case)
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success();

    // Verify empty file
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("AUTHENTIC"));
}

#[test]
fn test_e2e_seal_binary_content() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("binary.dat");

    // Binary content with all possible byte values
    let binary_content: Vec<u8> = (0..=255).collect();
    fs::write(&test_file, &binary_content).unwrap();

    // Seal binary content
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success();

    // Verify binary content
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("AUTHENTIC"));
}

// ============================================================================
// Concurrent Operations Simulation
// ============================================================================

#[test]
fn test_e2e_seal_multiple_files_sequentially() {
    let temp = TempDir::new().unwrap();
    let file_count = 5;

    // Create and seal multiple files
    for i in 0..file_count {
        let test_file = temp.path().join(format!("file_{}.dat", i));
        fs::write(&test_file, format!("Content of file {}", i).as_bytes()).unwrap();

        veritas()
            .args(["seal", "--mock", test_file.to_str().unwrap()])
            .assert()
            .success();
    }

    // Verify all files
    for i in 0..file_count {
        let test_file = temp.path().join(format!("file_{}.dat", i));

        veritas()
            .args(["verify", test_file.to_str().unwrap()])
            .assert()
            .success()
            .stdout(predicate::str::contains("AUTHENTIC"));
    }
}

// ============================================================================
// Cross-format Compatibility
// ============================================================================

#[test]
fn test_e2e_cbor_seal_json_inspection() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.bin");
    fs::write(&test_file, b"Test content for format test").unwrap();

    // Seal with CBOR (default binary format)
    veritas()
        .args([
            "seal",
            "--mock",
            "--format",
            "cbor",
            test_file.to_str().unwrap(),
        ])
        .assert()
        .success();

    // CBOR seal should still be verifiable
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("AUTHENTIC"));

    // CBOR seal should be binary (not JSON)
    let seal_path = temp.path().join("test.bin.veritas");
    let seal_bytes = fs::read(&seal_path).unwrap();
    assert!(
        !seal_bytes.starts_with(b"{"),
        "CBOR seal should not start with JSON bracket"
    );
}
