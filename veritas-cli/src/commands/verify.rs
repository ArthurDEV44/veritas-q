//! Verify command implementation.

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use colored::Colorize;
use tracing::{debug, error, info};
use veritas_core::ContentVerificationResult;

use crate::utils::{build_seal_path, format_timestamp, load_seal};

/// Execute the verify command.
pub async fn execute(file: PathBuf, seal_path: Option<PathBuf>, quiet: bool) -> Result<()> {
    // Determine seal path
    let seal_path = seal_path.unwrap_or_else(|| build_seal_path(&file));

    // Read the original file
    let content =
        std::fs::read(&file).with_context(|| format!("Failed to read file: {}", file.display()))?;

    info!(path = %file.display(), bytes = content.len(), "Read file");

    // Load and parse the seal
    info!(path = %seal_path.display(), "Loading seal");
    let seal = load_seal(&seal_path)?;

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
