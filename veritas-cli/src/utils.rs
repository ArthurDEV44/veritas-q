//! Common utility functions shared across CLI commands.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use chrono::{TimeZone, Utc};
use tracing::debug;
use veritas_core::VeritasSeal;

/// Build the seal output path from the original file path.
///
/// Transforms `file.ext` into `file.ext.veritas`.
pub fn build_seal_path(file: &Path) -> PathBuf {
    file.with_extension(format!(
        "{}.veritas",
        file.extension().and_then(|e| e.to_str()).unwrap_or("bin")
    ))
}

/// Load and parse a seal file, trying CBOR first then JSON.
pub fn load_seal(path: &Path) -> Result<VeritasSeal> {
    let seal_bytes = std::fs::read(path)
        .with_context(|| format!("Failed to read seal file: {}", path.display()))?;

    let seal = if let Ok(seal) = VeritasSeal::from_cbor(&seal_bytes) {
        debug!(format = "cbor", "Parsed seal");
        seal
    } else if let Ok(seal) = serde_json::from_slice(&seal_bytes) {
        debug!(format = "json", "Parsed seal");
        seal
    } else {
        bail!("Failed to parse seal file (tried CBOR and JSON)");
    };

    Ok(seal)
}

/// Format a Unix timestamp (milliseconds) as a human-readable UTC string.
pub fn format_timestamp(timestamp_ms: u64) -> String {
    let secs = (timestamp_ms / 1000) as i64;
    let nsecs = ((timestamp_ms % 1000) * 1_000_000) as u32;
    match Utc.timestamp_opt(secs, nsecs) {
        chrono::LocalResult::Single(dt) => dt.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
        _ => format!("{}ms", timestamp_ms),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_seal_path() {
        assert_eq!(
            build_seal_path(Path::new("image.jpg")),
            PathBuf::from("image.jpg.veritas")
        );
        assert_eq!(
            build_seal_path(Path::new("video.mp4")),
            PathBuf::from("video.mp4.veritas")
        );
        assert_eq!(
            build_seal_path(Path::new("noext")),
            PathBuf::from("noext.bin.veritas")
        );
    }

    #[test]
    fn test_format_timestamp() {
        // 2024-01-15 12:30:45.123 UTC
        let ts = 1705321845123;
        let formatted = format_timestamp(ts);
        assert!(formatted.contains("2024-01-15"));
        assert!(formatted.contains("UTC"));
    }
}
