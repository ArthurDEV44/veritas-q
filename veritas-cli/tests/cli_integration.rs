//! CLI integration tests for veritas-cli.
//!
//! These tests verify the CLI behavior by running the actual binary
//! and checking outputs, exit codes, and file artifacts.

use assert_cmd::Command;
use predicates::prelude::*;
use std::fs;
use tempfile::TempDir;

/// Get a Command for the veritas binary.
fn veritas() -> Command {
    Command::cargo_bin("veritas").unwrap()
}

// ============================================================================
// Help and Version Tests
// ============================================================================

#[test]
fn test_help_displays_usage() {
    veritas()
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains(
            "Quantum-authenticated media sealing",
        ))
        .stdout(predicate::str::contains("seal"))
        .stdout(predicate::str::contains("verify"))
        .stdout(predicate::str::contains("anchor"));
}

#[test]
fn test_version_displays_version() {
    veritas()
        .arg("--version")
        .assert()
        .success()
        .stdout(predicate::str::contains("veritas"));
}

#[test]
fn test_help_shows_exit_codes() {
    veritas()
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Exit codes:"))
        .stdout(predicate::str::contains("65"))
        .stdout(predicate::str::contains("66"));
}

#[test]
fn test_seal_help_shows_options() {
    veritas()
        .args(["seal", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("--format"))
        .stdout(predicate::str::contains("--mock"))
        .stdout(predicate::str::contains("--keypair"))
        .stdout(predicate::str::contains("--dry-run"));
}

#[test]
fn test_verify_help_shows_options() {
    veritas()
        .args(["verify", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("FILE"))
        .stdout(predicate::str::contains("SEAL"));
}

#[test]
fn test_anchor_help_shows_options() {
    veritas()
        .args(["anchor", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("--update-seal"))
        .stdout(predicate::str::contains("--dry-run"));
}

// ============================================================================
// Exit Code Tests
// ============================================================================

#[test]
fn test_missing_file_returns_input_error() {
    // Exit code 66 = EX_NOINPUT
    veritas()
        .args(["seal", "nonexistent_file.jpg"])
        .assert()
        .code(66)
        .stderr(predicate::str::contains("Failed to read file"));
}

#[test]
fn test_missing_seal_file_returns_input_error() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.jpg");
    fs::write(&test_file, b"test content").unwrap();

    // Exit code 66 = EX_NOINPUT (seal file not found)
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .code(66)
        .stderr(predicate::str::contains("Failed to read seal file"));
}

#[test]
fn test_invalid_seal_returns_error() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.jpg");
    let seal_file = temp.path().join("test.jpg.veritas");

    fs::write(&test_file, b"test content").unwrap();
    fs::write(&seal_file, b"invalid seal data").unwrap();

    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .failure()
        .stderr(predicate::str::contains("Failed to parse seal"));
}

// ============================================================================
// Dry Run Tests
// ============================================================================

#[test]
fn test_seal_dry_run_shows_preview() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.jpg");
    fs::write(&test_file, b"test image content").unwrap();

    veritas()
        .args(["seal", "--dry-run", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("[DRY RUN]"))
        .stdout(predicate::str::contains("Input file:"))
        .stdout(predicate::str::contains("Media type:"))
        .stdout(predicate::str::contains("Output format:"));

    // Verify no seal file was created
    let seal_path = temp.path().join("test.jpg.veritas");
    assert!(!seal_path.exists(), "Dry run should not create seal file");
}

#[test]
fn test_seal_dry_run_shows_keypair_info() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.jpg");
    let keypair_path = temp.path().join("test.key");

    fs::write(&test_file, b"test content").unwrap();

    // Test ephemeral keypair message
    veritas()
        .args(["seal", "-n", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("generate (ephemeral)"));

    // Test save keypair message
    veritas()
        .args([
            "seal",
            "-n",
            "--mock",
            "--save-keypair",
            keypair_path.to_str().unwrap(),
            test_file.to_str().unwrap(),
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("generate and save"));
}

// ============================================================================
// Seal and Verify Roundtrip Tests
// ============================================================================

#[test]
fn test_seal_creates_seal_file() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("image.jpg");
    fs::write(&test_file, b"fake image content for testing").unwrap();

    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("File sealed with Quantum Entropy"));

    let seal_path = temp.path().join("image.jpg.veritas");
    assert!(seal_path.exists(), "Seal file should be created");
    assert!(
        fs::metadata(&seal_path).unwrap().len() > 0,
        "Seal file should not be empty"
    );
}

#[test]
fn test_seal_verify_roundtrip_authentic() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("document.pdf");
    let content = b"This is a test PDF document content";
    fs::write(&test_file, content).unwrap();

    // Seal the file
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success();

    // Verify the file - should be authentic
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("AUTHENTIC"));
}

#[test]
fn test_seal_verify_roundtrip_tampered() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("document.pdf");
    fs::write(&test_file, b"Original content").unwrap();

    // Seal the file
    veritas()
        .args(["seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success();

    // Tamper with the file
    fs::write(&test_file, b"Modified content!").unwrap();

    // Verify should fail with exit code 65 (VERIFICATION_FAILED)
    veritas()
        .args(["verify", test_file.to_str().unwrap()])
        .assert()
        .code(65)
        .stdout(predicate::str::contains("TAMPERED"));
}

#[test]
fn test_seal_with_json_format() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.png");
    fs::write(&test_file, b"PNG content").unwrap();

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

    let seal_path = temp.path().join("test.png.veritas");
    let seal_content = fs::read_to_string(&seal_path).unwrap();

    // JSON seal should be valid JSON
    assert!(
        seal_content.starts_with('{'),
        "JSON seal should start with opening brace"
    );
    assert!(
        serde_json::from_str::<serde_json::Value>(&seal_content).is_ok(),
        "Seal should be valid JSON"
    );
}

#[test]
fn test_seal_with_cbor_format() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.mp4");
    fs::write(&test_file, b"MP4 content").unwrap();

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

    let seal_path = temp.path().join("test.mp4.veritas");
    let seal_bytes = fs::read(&seal_path).unwrap();

    // CBOR seal should be binary (not start with '{')
    assert!(
        !seal_bytes.starts_with(b"{"),
        "CBOR seal should be binary, not JSON"
    );
}

// ============================================================================
// Keypair Management Tests
// ============================================================================

#[test]
fn test_save_and_load_keypair() {
    let temp = TempDir::new().unwrap();
    let test_file1 = temp.path().join("file1.jpg");
    let test_file2 = temp.path().join("file2.jpg");
    let keypair_path = temp.path().join("my.keypair");

    fs::write(&test_file1, b"First file content").unwrap();
    fs::write(&test_file2, b"Second file content").unwrap();

    // Seal first file and save keypair
    veritas()
        .args([
            "seal",
            "--mock",
            "--save-keypair",
            keypair_path.to_str().unwrap(),
            test_file1.to_str().unwrap(),
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("Keypair saved to"));

    assert!(keypair_path.exists(), "Keypair file should be created");

    // Keypair should be 5984 bytes (1952 + 4032)
    let keypair_size = fs::metadata(&keypair_path).unwrap().len();
    assert_eq!(keypair_size, 5984, "Keypair file should be 5984 bytes");

    // Seal second file using the saved keypair
    veritas()
        .args([
            "seal",
            "--mock",
            "--keypair",
            keypair_path.to_str().unwrap(),
            test_file2.to_str().unwrap(),
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("loaded from file"));
}

// ============================================================================
// Quiet and Verbose Mode Tests
// ============================================================================

#[test]
fn test_quiet_mode_minimal_output() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.jpg");
    fs::write(&test_file, b"test content").unwrap();

    let output = veritas()
        .args(["--quiet", "seal", "--mock", test_file.to_str().unwrap()])
        .assert()
        .success();

    // Quiet mode should have minimal stdout
    let stdout = String::from_utf8_lossy(&output.get_output().stdout);
    assert!(
        stdout.is_empty() || stdout.trim().is_empty(),
        "Quiet mode should have no stdout, got: {}",
        stdout
    );
}

#[test]
fn test_color_never_no_ansi() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.jpg");
    fs::write(&test_file, b"test content").unwrap();

    let output = veritas()
        .args([
            "--color=never",
            "seal",
            "--mock",
            test_file.to_str().unwrap(),
        ])
        .assert()
        .success();

    let stdout = String::from_utf8_lossy(&output.get_output().stdout);
    let stderr = String::from_utf8_lossy(&output.get_output().stderr);

    // ANSI escape codes start with \x1b[
    assert!(
        !stdout.contains("\x1b["),
        "Color=never stdout should not contain ANSI codes"
    );
    assert!(
        !stderr.contains("\x1b["),
        "Color=never stderr should not contain ANSI codes"
    );
}

// ============================================================================
// Error Message Tests
// ============================================================================

#[test]
fn test_invalid_format_rejected() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.jpg");
    fs::write(&test_file, b"content").unwrap();

    veritas()
        .args([
            "seal",
            "--format",
            "invalid",
            "--mock",
            test_file.to_str().unwrap(),
        ])
        .assert()
        .failure()
        .stderr(
            predicate::str::contains("invalid").or(predicate::str::contains("possible values")),
        );
}

#[test]
fn test_conflicting_verbose_quiet_rejected() {
    let temp = TempDir::new().unwrap();
    let test_file = temp.path().join("test.jpg");
    fs::write(&test_file, b"content").unwrap();

    // Use an actual command (not --help which bypasses conflicts)
    veritas()
        .args([
            "--verbose",
            "--quiet",
            "seal",
            "--mock",
            test_file.to_str().unwrap(),
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("cannot be used with"));
}
