//! C2PA command implementation.
//!
//! Provides commands for embedding and extracting Veritas seals
//! in C2PA-compatible manifests.

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use colored::Colorize;
use tracing::{debug, info};
use veritas_core::c2pa::{
    extract_quantum_seal, verify_c2pa_manifest, VeritasManifestBuilder, VeritasSigner,
};
use veritas_core::VeritasSeal;

use crate::utils::build_seal_path;

/// Execute the C2PA embed command.
///
/// Embeds a Veritas seal into a media file as a C2PA manifest.
pub async fn execute_embed(
    input: PathBuf,
    output: Option<PathBuf>,
    seal_path: Option<PathBuf>,
    key_path: Option<PathBuf>,
    cert_path: Option<PathBuf>,
    dry_run: bool,
    quiet: bool,
) -> Result<()> {
    // Determine seal path
    let seal_file = seal_path.unwrap_or_else(|| build_seal_path(&input));

    // Check seal exists
    if !seal_file.exists() {
        bail!(
            "Seal file not found: {}. Run 'veritas seal' first.",
            seal_file.display()
        );
    }

    // Determine output path
    let output_path = output.unwrap_or_else(|| {
        let stem = input.file_stem().unwrap().to_str().unwrap();
        let ext = input.extension().unwrap_or_default().to_str().unwrap();
        input.with_file_name(format!("{}_c2pa.{}", stem, ext))
    });

    // Dry run
    if dry_run {
        println!("{}", "[DRY RUN] Would perform the following:".cyan().bold());
        println!();
        println!("   {} {}", "Input file:".dimmed(), input.display());
        println!("   {} {}", "Seal file:".dimmed(), seal_file.display());
        println!("   {} {}", "Output file:".dimmed(), output_path.display());
        println!(
            "   {} {}",
            "Signing key:".dimmed(),
            key_path
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "from C2PA_SIGNING_KEY env".to_string())
        );
        println!(
            "   {} {}",
            "Certificate:".dimmed(),
            cert_path
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "from C2PA_SIGNING_CERT env".to_string())
        );
        return Ok(());
    }

    // Load the seal
    let seal_data = std::fs::read(&seal_file)
        .with_context(|| format!("Failed to read seal file: {}", seal_file.display()))?;

    let seal = VeritasSeal::from_cbor(&seal_data)
        .with_context(|| "Failed to parse seal (is it CBOR format?)")?;

    info!(seal_path = %seal_file.display(), "Loaded seal");

    // Create signer
    let signer = match (key_path, cert_path) {
        (Some(key), Some(cert)) => VeritasSigner::from_files(&key, &cert)
            .with_context(|| "Failed to load signing credentials from files")?,
        (None, None) => VeritasSigner::from_env()
            .with_context(|| "Failed to load signing credentials from environment. Set C2PA_SIGNING_KEY and C2PA_SIGNING_CERT")?,
        _ => bail!("Both --key and --cert must be provided together, or neither (use env vars)"),
    };

    // Build and embed manifest
    let builder = VeritasManifestBuilder::new(seal);
    builder
        .embed_in_file(&input, &output_path, signer)
        .with_context(|| "Failed to embed C2PA manifest")?;

    info!(output = %output_path.display(), "C2PA manifest embedded");

    if !quiet {
        println!();
        println!("{}", "C2PA manifest embedded!".green().bold());
        println!();
        println!("   {} {}", "Output file:".dimmed(), output_path.display());
        println!(
            "   {}",
            "Verify with: c2patool <file> or veritas c2pa verify <file>".dimmed()
        );
    }

    Ok(())
}

/// Execute the C2PA extract command.
///
/// Extracts a Veritas seal from a C2PA manifest in a media file.
pub async fn execute_extract(file: PathBuf, output: Option<PathBuf>, quiet: bool) -> Result<()> {
    // Extract the quantum seal assertion
    let quantum_seal = extract_quantum_seal(&file)
        .with_context(|| format!("Failed to extract from: {}", file.display()))?;

    info!(file = %file.display(), "Extracted quantum seal assertion");

    // Determine output path
    let output_path = output.unwrap_or_else(|| file.with_extension("veritas"));

    // Build a partial seal info (for display purposes)
    // Note: We can't fully reconstruct a VeritasSeal because we need more context
    // But we can save the quantum seal assertion as JSON
    let json =
        serde_json::to_string_pretty(&quantum_seal).context("Failed to serialize quantum seal")?;

    std::fs::write(&output_path, &json).context("Failed to write output file")?;

    if !quiet {
        println!();
        println!("{}", "Quantum seal extracted!".green().bold());
        println!();
        println!("   {} {}", "Output file:".dimmed(), output_path.display());
        println!(
            "   {} {}",
            "QRNG source:".dimmed(),
            quantum_seal.qrng_source
        );
        println!(
            "   {} {}",
            "Content hash:".dimmed(),
            hex::encode(&quantum_seal.content_hash[..8])
        );
        if let Some(anchor) = &quantum_seal.blockchain_anchor {
            println!(
                "   {} {} ({})",
                "Blockchain:".dimmed(),
                anchor.chain,
                anchor.transaction_id
            );
        }
    }

    Ok(())
}

/// Execute the C2PA verify command.
///
/// Verifies both the C2PA signature and the embedded Veritas seal.
pub async fn execute_verify(file: PathBuf, quiet: bool) -> Result<()> {
    let validation = verify_c2pa_manifest(&file)
        .with_context(|| format!("Failed to verify: {}", file.display()))?;

    debug!(
        c2pa_valid = validation.c2pa_valid,
        "C2PA validation complete"
    );

    if !quiet {
        println!();
        println!("{}", "C2PA Manifest Verification".cyan().bold());
        println!();

        // C2PA status
        let c2pa_status = if validation.c2pa_valid {
            "VALID".green()
        } else {
            "INVALID".red()
        };
        println!("   {} {}", "C2PA signature:".dimmed(), c2pa_status);

        if let Some(generator) = &validation.claim_generator {
            println!("   {} {}", "Claim generator:".dimmed(), generator);
        }

        // Validation errors
        if !validation.validation_errors.is_empty() {
            println!();
            println!("   {}:", "Validation issues".yellow());
            for error in &validation.validation_errors {
                println!("     - {}", error);
            }
        }

        // Veritas quantum seal
        if let Some(quantum_seal) = &validation.quantum_seal {
            println!();
            println!("{}", "Veritas Quantum Seal".magenta().bold());
            println!();
            println!(
                "   {} {}",
                "QRNG source:".dimmed(),
                quantum_seal.qrng_source
            );
            println!(
                "   {} {}",
                "Capture time:".dimmed(),
                format_timestamp(quantum_seal.capture_timestamp)
            );
            println!(
                "   {} {}",
                "Content hash:".dimmed(),
                hex::encode(&quantum_seal.content_hash[..8])
            );
            println!(
                "   {} {} bytes",
                "ML-DSA-65 sig:".dimmed(),
                quantum_seal.ml_dsa_signature.len()
            );

            if let Some(anchor) = &quantum_seal.blockchain_anchor {
                println!();
                println!("   {}:", "Blockchain anchor".dimmed());
                println!("     {} {}", "Chain:".dimmed(), anchor.chain);
                println!("     {} {}", "Network:".dimmed(), anchor.network);
                println!("     {} {}", "TX ID:".dimmed(), anchor.transaction_id);
            }
        } else {
            println!();
            println!(
                "   {}",
                "No Veritas quantum seal found in manifest".yellow()
            );
        }
    }

    // Return error if validation failed
    if !validation.c2pa_valid {
        bail!("C2PA manifest validation failed");
    }

    Ok(())
}

/// Format a Unix timestamp (milliseconds) to human-readable string
fn format_timestamp(timestamp_ms: u64) -> String {
    use chrono::{TimeZone, Utc};

    let secs = (timestamp_ms / 1000) as i64;
    let nsecs = ((timestamp_ms % 1000) * 1_000_000) as u32;

    match Utc.timestamp_opt(secs, nsecs) {
        chrono::LocalResult::Single(dt) => dt.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
        _ => format!("{} ms", timestamp_ms),
    }
}
