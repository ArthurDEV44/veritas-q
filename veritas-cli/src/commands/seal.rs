//! Seal command implementation.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use colored::Colorize;
use pqcrypto_mldsa::mldsa65;
use pqcrypto_traits::sign::{PublicKey, SecretKey};
use tracing::{debug, info, warn};
use veritas_core::{
    generate_keypair, LfdQrng, MediaType, MockQrng, QuantumEntropySource, SealBuilder, VeritasSeal,
    ZeroizingSecretKey, MLDSA65_PUBLIC_KEY_BYTES, MLDSA65_SECRET_KEY_BYTES,
};

use crate::utils::build_seal_path;
use crate::OutputFormat;

/// Keypair file format: public key (1952 bytes) || secret key (4032 bytes)
const KEYPAIR_FILE_SIZE: usize = MLDSA65_PUBLIC_KEY_BYTES + MLDSA65_SECRET_KEY_BYTES;

/// Detect media type from file extension.
fn detect_media_type(path: &Path) -> MediaType {
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

/// Load an ML-DSA-65 keypair from a file.
fn load_keypair(path: &Path) -> Result<(mldsa65::PublicKey, ZeroizingSecretKey)> {
    let data = std::fs::read(path)
        .with_context(|| format!("Failed to read keypair file: {}", path.display()))?;

    if data.len() != KEYPAIR_FILE_SIZE {
        bail!(
            "Invalid keypair file size: expected {} bytes, got {}",
            KEYPAIR_FILE_SIZE,
            data.len()
        );
    }

    let public_key = mldsa65::PublicKey::from_bytes(&data[..MLDSA65_PUBLIC_KEY_BYTES])
        .map_err(|_| anyhow::anyhow!("Invalid public key in keypair file"))?;

    let secret_key = mldsa65::SecretKey::from_bytes(&data[MLDSA65_PUBLIC_KEY_BYTES..])
        .map_err(|_| anyhow::anyhow!("Invalid secret key in keypair file"))?;

    Ok((public_key, ZeroizingSecretKey::new(secret_key)))
}

/// Save an ML-DSA-65 keypair to a file.
fn save_keypair(
    path: &Path,
    public_key: &mldsa65::PublicKey,
    secret_key: &ZeroizingSecretKey,
) -> Result<()> {
    let mut data = Vec::with_capacity(KEYPAIR_FILE_SIZE);
    data.extend_from_slice(public_key.as_bytes());
    data.extend_from_slice(secret_key.as_inner().as_bytes());

    std::fs::write(path, &data)
        .with_context(|| format!("Failed to write keypair file: {}", path.display()))?;

    // Set restrictive permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(path, permissions)?;
    }

    Ok(())
}

/// Execute the seal command.
pub async fn execute(
    file: PathBuf,
    format: OutputFormat,
    use_mock: bool,
    keypair_path: Option<PathBuf>,
    save_keypair_path: Option<PathBuf>,
    dry_run: bool,
    quiet: bool,
) -> Result<()> {
    // Read the file content
    let content =
        std::fs::read(&file).with_context(|| format!("Failed to read file: {}", file.display()))?;

    info!(path = %file.display(), bytes = content.len(), "Read file");

    // Detect media type
    let media_type = detect_media_type(&file);
    debug!(media_type = ?media_type, "Detected media type");

    // Determine output path
    let seal_path = build_seal_path(&file);

    // Dry run: show what would be done and exit
    if dry_run {
        println!("{}", "[DRY RUN] Would perform the following:".cyan().bold());
        println!();
        println!("   {} {}", "Input file:".dimmed(), file.display());
        println!("   {} {} bytes", "File size:".dimmed(), content.len());
        println!("   {} {:?}", "Media type:".dimmed(), media_type);
        println!("   {} {:?}", "Output format:".dimmed(), format);
        println!("   {} {}", "Seal output:".dimmed(), seal_path.display());
        println!(
            "   {} {}",
            "QRNG source:".dimmed(),
            if use_mock {
                "Mock (testing)"
            } else {
                "Auto (best available)"
            }
        );
        println!(
            "   {} {}",
            "Keypair:".dimmed(),
            if let Some(kp) = &keypair_path {
                format!("load from {}", kp.display())
            } else if save_keypair_path.is_some() {
                "generate and save".to_string()
            } else {
                "generate (ephemeral)".to_string()
            }
        );
        if let Some(save_path) = &save_keypair_path {
            println!("   {} {}", "Save keypair to:".dimmed(), save_path.display());
        }
        return Ok(());
    }

    // Load or generate keypair
    let (public_key, secret_key) = if let Some(kp_path) = &keypair_path {
        info!(path = %kp_path.display(), "Loading keypair from file");
        load_keypair(kp_path)?
    } else {
        let (pk, sk) = generate_keypair();
        debug!("Generated new ML-DSA-65 keypair");

        // Save keypair if requested (only when generating new)
        if let Some(save_path) = &save_keypair_path {
            save_keypair(save_path, &pk, &sk)?;
            info!(path = %save_path.display(), "Saved keypair to file");
            if !quiet {
                println!(
                    "{}",
                    format!("Keypair saved to: {}", save_path.display()).dimmed()
                );
            }
        }

        (pk, sk)
    };

    // Get quantum entropy and create seal
    let seal = if use_mock {
        warn!("Using MOCK entropy (not quantum-safe!)");
        if !quiet {
            eprintln!("{}", "Using MOCK entropy (not quantum-safe!)".yellow());
        }
        let qrng = MockQrng::default();
        create_seal(content, media_type, &qrng, &public_key, &secret_key).await?
    } else {
        // Auto-select QRNG: try ID Quantique first (if API key set), fall back to LfD
        use veritas_core::qrng::IdQuantiqueConfig;

        if let Ok(idq_config) = IdQuantiqueConfig::from_env() {
            info!("Auto-selected ID Quantique QRNG provider");
            let provider = veritas_core::qrng::IdQuantiqueQrng::new(idq_config)
                .context("Failed to create ID Quantique QRNG")?;
            if !quiet {
                eprintln!(
                    "{}",
                    format!("Using QRNG: {}", provider.source_id()).dimmed()
                );
            }
            create_seal(content, media_type, &provider, &public_key, &secret_key).await?
        } else {
            info!("Auto-selected LfD QRNG provider (Germany)");
            let provider = LfdQrng::new().context("Failed to create LfD QRNG")?;
            if !quiet {
                eprintln!(
                    "{}",
                    format!("Using QRNG: {}", provider.source_id()).dimmed()
                );
            }
            create_seal(content, media_type, &provider, &public_key, &secret_key).await?
        }
    };

    // Serialize and save
    match format {
        OutputFormat::Json => {
            let json =
                serde_json::to_string_pretty(&seal).context("Failed to serialize seal to JSON")?;
            std::fs::write(&seal_path, json).context("Failed to write seal file")?;
            debug!(format = "json", "Serialized seal");
        }
        OutputFormat::Cbor => {
            let cbor = seal.to_cbor().context("Failed to serialize seal to CBOR")?;
            std::fs::write(&seal_path, cbor).context("Failed to write seal file")?;
            debug!(format = "cbor", "Serialized seal");
        }
    }

    info!(path = %seal_path.display(), "Seal saved");

    // Print success message (user-facing output)
    if !quiet {
        let content_hash = hex::encode(seal.content_hash.crypto_hash);
        let qrng_source = format!("{:?}", seal.qrng_source);

        println!();
        println!("{}", "File sealed with Quantum Entropy!".green().bold());
        println!();
        println!("   {} {}", "Seal saved:".dimmed(), seal_path.display());
        println!("   {} {}", "Content hash:".dimmed(), &content_hash[..16]);
        println!("   {} {}", "QRNG source:".dimmed(), qrng_source);
        println!(
            "   {} {} bytes",
            "Signature size:".dimmed(),
            seal.signature.len()
        );
        if keypair_path.is_some() {
            println!("   {} {}", "Keypair:".dimmed(), "loaded from file".cyan());
        }
    }

    Ok(())
}

async fn create_seal<Q: QuantumEntropySource>(
    content: Vec<u8>,
    media_type: MediaType,
    qrng: &Q,
    public_key: &mldsa65::PublicKey,
    secret_key: &ZeroizingSecretKey,
) -> Result<VeritasSeal> {
    // Create the seal using secure builder
    let seal = SealBuilder::new(content, media_type)
        .build_secure(qrng, secret_key, public_key)
        .await
        .context("Failed to create seal")?;

    debug!(
        qrng_source = ?seal.qrng_source,
        signature_len = seal.signature.len(),
        "Seal created"
    );

    Ok(seal)
}
