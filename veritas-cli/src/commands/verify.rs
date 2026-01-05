//! Verify command implementation.

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use colored::Colorize;
use veritas_core::{ContentHash, VeritasSeal};

/// Execute the verify command.
pub async fn execute(file: PathBuf, seal_path: Option<PathBuf>) -> Result<()> {
    // Determine seal path
    let seal_path = seal_path.unwrap_or_else(|| {
        file.with_extension(format!(
            "{}.veritas",
            file.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("bin")
        ))
    });

    // Read the original file
    let content = std::fs::read(&file)
        .with_context(|| format!("Failed to read file: {}", file.display()))?;

    println!(
        "{}",
        format!("📄 Read {} bytes from {}", content.len(), file.display()).dimmed()
    );

    // Read and parse the seal
    let seal_bytes = std::fs::read(&seal_path)
        .with_context(|| format!("Failed to read seal file: {}", seal_path.display()))?;

    println!(
        "{}",
        format!("🔏 Read seal from {}", seal_path.display()).dimmed()
    );

    // Try CBOR first, then JSON
    let seal: VeritasSeal = if let Ok(seal) = VeritasSeal::from_cbor(&seal_bytes) {
        seal
    } else if let Ok(seal) = serde_json::from_slice(&seal_bytes) {
        seal
    } else {
        bail!("Failed to parse seal file (tried CBOR and JSON)");
    };

    // Compute content hash of the current file
    let current_hash = ContentHash::from_bytes(&content);

    // Verify signature
    println!("{}", "🔐 Verifying ML-DSA signature...".dimmed());
    let signature_valid = seal
        .verify()
        .context("Signature verification failed")?;

    // Verify content hash matches
    let hash_matches = seal.content_hash.crypto_hash == current_hash.crypto_hash;

    println!();

    if signature_valid && hash_matches {
        println!("{}", "╔════════════════════════════════════════╗".green());
        println!("{}", "║         ✅ AUTHENTIC                   ║".green().bold());
        println!("{}", "╚════════════════════════════════════════╝".green());
        println!();
        println!("   {} {}", "Signature:".dimmed(), "Valid (ML-DSA-65)".green());
        println!("   {} {}", "Content:".dimmed(), "Matches original".green());
        println!(
            "   {} {:?}",
            "QRNG source:".dimmed(),
            seal.qrng_source
        );
        println!(
            "   {} {}",
            "Sealed at:".dimmed(),
            format_timestamp(seal.capture_timestamp_utc)
        );
        Ok(())
    } else {
        println!("{}", "╔════════════════════════════════════════╗".red());
        println!("{}", "║         ❌ TAMPERED                    ║".red().bold());
        println!("{}", "╚════════════════════════════════════════╝".red());
        println!();

        if !signature_valid {
            println!(
                "   {} {}",
                "Signature:".dimmed(),
                "INVALID - seal may be forged".red()
            );
        } else {
            println!("   {} {}", "Signature:".dimmed(), "Valid".green());
        }

        if !hash_matches {
            println!(
                "   {} {}",
                "Content:".dimmed(),
                "MODIFIED since sealing".red()
            );
            println!(
                "   {} {}",
                "Expected:".dimmed(),
                hex::encode(&seal.content_hash.crypto_hash[..8])
            );
            println!(
                "   {} {}",
                "Got:".dimmed(),
                hex::encode(&current_hash.crypto_hash[..8])
            );
        } else {
            println!("   {} {}", "Content:".dimmed(), "Matches".green());
        }

        bail!("Verification failed: file has been tampered with");
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
