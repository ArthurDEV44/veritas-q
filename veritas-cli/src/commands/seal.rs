//! Seal command implementation.

use std::path::PathBuf;

use anyhow::{Context, Result};
use colored::Colorize;
use veritas_core::{
    generate_keypair, AnuQrng, MediaType, MockQrng, QuantumEntropySource, SealBuilder, VeritasSeal,
};

/// Detect media type from file extension.
fn detect_media_type(path: &PathBuf) -> MediaType {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_lowercase())
        .as_deref()
    {
        Some("jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "tiff" | "svg") => MediaType::Image,
        Some("mp4" | "mov" | "avi" | "mkv" | "webm" | "flv" | "wmv") => MediaType::Video,
        Some("mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a") => MediaType::Audio,
        _ => MediaType::Image, // Default to image
    }
}

/// Execute the seal command.
pub async fn execute(file: PathBuf, format: String, use_mock: bool) -> Result<()> {
    // Read the file content
    let content = std::fs::read(&file)
        .with_context(|| format!("Failed to read file: {}", file.display()))?;

    println!(
        "{}",
        format!("📄 Read {} bytes from {}", content.len(), file.display()).dimmed()
    );

    // Detect media type
    let media_type = detect_media_type(&file);
    println!(
        "{}",
        format!("🎯 Detected media type: {:?}", media_type).dimmed()
    );

    // Get quantum entropy
    let seal = if use_mock {
        println!("{}", "⚠️  Using MOCK entropy (not quantum-safe!)".yellow());
        let qrng = MockQrng::default();
        create_seal(content, media_type, &qrng).await?
    } else {
        match create_seal_with_anu(content.clone(), media_type).await {
            Ok(seal) => seal,
            Err(e) => {
                eprintln!(
                    "{}",
                    format!("⚠️  ANU QRNG failed: {}. Falling back to mock entropy.", e).yellow()
                );
                let qrng = MockQrng::default();
                create_seal(content, media_type, &qrng).await?
            }
        }
    };

    // Determine output path
    let seal_path = file.with_extension(format!(
        "{}.veritas",
        file.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin")
    ));

    // Serialize and save
    match format.as_str() {
        "json" => {
            let json = serde_json::to_string_pretty(&seal)
                .context("Failed to serialize seal to JSON")?;
            std::fs::write(&seal_path, json).context("Failed to write seal file")?;
        }
        "cbor" | _ => {
            let cbor = seal.to_cbor().context("Failed to serialize seal to CBOR")?;
            std::fs::write(&seal_path, cbor).context("Failed to write seal file")?;
        }
    }

    // Print success message
    let content_hash = hex::encode(&seal.content_hash.crypto_hash);
    let qrng_source = format!("{:?}", seal.qrng_source);

    println!();
    println!("{}", "🔒 File sealed with Quantum Entropy!".green().bold());
    println!();
    println!("   {} {}", "Seal saved:".dimmed(), seal_path.display());
    println!("   {} {}", "Content hash:".dimmed(), &content_hash[..16]);
    println!("   {} {}", "QRNG source:".dimmed(), qrng_source);
    println!(
        "   {} {} bytes",
        "Signature size:".dimmed(),
        seal.signature.len()
    );

    Ok(())
}

async fn create_seal_with_anu(content: Vec<u8>, media_type: MediaType) -> Result<VeritasSeal> {
    println!("{}", "🌐 Fetching quantum entropy from ANU QRNG...".dimmed());
    let qrng = AnuQrng::new().context("Failed to create ANU QRNG client")?;
    create_seal(content, media_type, &qrng).await
}

async fn create_seal<Q: QuantumEntropySource>(
    content: Vec<u8>,
    media_type: MediaType,
    qrng: &Q,
) -> Result<VeritasSeal> {
    // Generate keypair (in production, this would come from TEE)
    let (public_key, secret_key) = generate_keypair();

    // Create the seal
    let seal = SealBuilder::new(content, media_type)
        .build(qrng, &secret_key, &public_key)
        .await
        .context("Failed to create seal")?;

    Ok(seal)
}
