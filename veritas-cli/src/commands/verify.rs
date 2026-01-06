//! Verify command implementation.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use colored::Colorize;
use tracing::{debug, error, info};
use veritas_core::{ContentVerificationResult, VeritasSeal};

/// Build the seal path from the original file path.
fn build_seal_path(file: &Path) -> PathBuf {
    file.with_extension(format!(
        "{}.veritas",
        file.extension().and_then(|e| e.to_str()).unwrap_or("bin")
    ))
}

/// Execute the verify command.
pub async fn execute(file: PathBuf, seal_path: Option<PathBuf>, quiet: bool) -> Result<()> {
    // Determine seal path
    let seal_path = seal_path.unwrap_or_else(|| build_seal_path(&file));

    // Read the original file
    let content =
        std::fs::read(&file).with_context(|| format!("Failed to read file: {}", file.display()))?;

    info!(path = %file.display(), bytes = content.len(), "Read file");

    // Read and parse the seal
    let seal_bytes = std::fs::read(&seal_path)
        .with_context(|| format!("Failed to read seal file: {}", seal_path.display()))?;

    info!(path = %seal_path.display(), bytes = seal_bytes.len(), "Read seal");

    // Try CBOR first, then JSON
    let seal: VeritasSeal = if let Ok(seal) = VeritasSeal::from_cbor(&seal_bytes) {
        debug!(format = "cbor", "Parsed seal");
        seal
    } else if let Ok(seal) = serde_json::from_slice(&seal_bytes) {
        debug!(format = "json", "Parsed seal");
        seal
    } else {
        bail!("Failed to parse seal file (tried CBOR and JSON)");
    };

    // Verify signature and content in one call
    debug!("Verifying ML-DSA signature");
    let result = seal
        .verify_content(&content)
        .context("Verification failed")?;

    match result {
        ContentVerificationResult::Authentic => {
            info!(
                qrng_source = ?seal.qrng_source,
                timestamp = seal.capture_timestamp_utc,
                "Verification successful"
            );

            if !quiet {
                println!();
                println!("{}", "╔════════════════════════════════════════╗".green());
                println!(
                    "{}",
                    "║              AUTHENTIC                 ║".green().bold()
                );
                println!("{}", "╚════════════════════════════════════════╝".green());
                println!();
                println!(
                    "   {} {}",
                    "Signature:".dimmed(),
                    "Valid (ML-DSA-65)".green()
                );
                println!("   {} {}", "Content:".dimmed(), "Matches original".green());
                println!("   {} {:?}", "QRNG source:".dimmed(), seal.qrng_source);
                println!(
                    "   {} {}",
                    "Sealed at:".dimmed(),
                    format_timestamp(seal.capture_timestamp_utc)
                );
            }
            Ok(())
        }
        ContentVerificationResult::ContentModified {
            expected_hash,
            actual_hash,
        } => {
            error!(
                expected = hex::encode(&expected_hash[..8]),
                actual = hex::encode(&actual_hash[..8]),
                "Content has been modified"
            );

            if !quiet {
                println!();
                println!("{}", "╔════════════════════════════════════════╗".red());
                println!(
                    "{}",
                    "║              TAMPERED                  ║".red().bold()
                );
                println!("{}", "╚════════════════════════════════════════╝".red());
                println!();
                println!("   {} {}", "Signature:".dimmed(), "Valid".green());
                println!(
                    "   {} {}",
                    "Content:".dimmed(),
                    "MODIFIED since sealing".red()
                );
                println!(
                    "   {} {}",
                    "Expected:".dimmed(),
                    hex::encode(&expected_hash[..8])
                );
                println!("   {} {}", "Got:".dimmed(), hex::encode(&actual_hash[..8]));
            }
            bail!("Verification failed: content has been modified")
        }
        ContentVerificationResult::SignatureFailed(sig_result) => {
            error!(reason = %sig_result.description(), "Signature verification failed");

            if !quiet {
                println!();
                println!("{}", "╔════════════════════════════════════════╗".red());
                println!(
                    "{}",
                    "║              TAMPERED                  ║".red().bold()
                );
                println!("{}", "╚════════════════════════════════════════╝".red());
                println!();
                println!(
                    "   {} {}",
                    "Signature:".dimmed(),
                    sig_result.description().red()
                );
            }
            bail!("Verification failed: {}", sig_result.description())
        }
    }
}

fn format_timestamp(timestamp_ms: u64) -> String {
    use chrono::{TimeZone, Utc};
    let secs = (timestamp_ms / 1000) as i64;
    let nsecs = ((timestamp_ms % 1000) * 1_000_000) as u32;
    match Utc.timestamp_opt(secs, nsecs) {
        chrono::LocalResult::Single(dt) => dt.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
        _ => format!("{}ms", timestamp_ms),
    }
}
