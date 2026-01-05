//! WebAssembly bindings for Veritas Q seal verification.
//!
//! This module provides client-side verification of Veritas Seals
//! directly in the browser without sending files to a server.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use veritas_core::{ContentHash, VeritasSeal};

/// Initialize panic hook for better error messages in browser console.
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Result of seal verification.
#[derive(Serialize, Deserialize)]
pub struct VerificationResult {
    /// Whether the seal signature is valid
    pub valid: bool,
    /// Whether the content hash matches
    pub content_matches: bool,
    /// Capture timestamp (ISO 8601 format)
    pub timestamp: String,
    /// Content hash (hex encoded)
    pub content_hash: String,
    /// Expected hash from seal (hex encoded)
    pub expected_hash: String,
    /// QRNG source used
    pub qrng_source: String,
    /// Media type
    pub media_type: String,
    /// Error message if verification failed
    pub error: Option<String>,
}

/// Verify a file against its Veritas seal.
///
/// # Arguments
/// * `file_bytes` - The original file content as bytes
/// * `seal_bytes` - The seal file content (CBOR or JSON format)
///
/// # Returns
/// A JSON string containing the verification result
#[wasm_bindgen]
pub fn verify_file_wasm(file_bytes: &[u8], seal_bytes: &[u8]) -> String {
    match verify_internal(file_bytes, seal_bytes) {
        Ok(result) => serde_json::to_string(&result).unwrap_or_else(|e| {
            format!(r#"{{"valid":false,"error":"Serialization error: {}"}}"#, e)
        }),
        Err(e) => {
            let result = VerificationResult {
                valid: false,
                content_matches: false,
                timestamp: String::new(),
                content_hash: String::new(),
                expected_hash: String::new(),
                qrng_source: String::new(),
                media_type: String::new(),
                error: Some(e),
            };
            serde_json::to_string(&result).unwrap_or_else(|_| {
                r#"{"valid":false,"error":"Unknown error"}"#.to_string()
            })
        }
    }
}

fn verify_internal(file_bytes: &[u8], seal_bytes: &[u8]) -> Result<VerificationResult, String> {
    // Try to parse seal (CBOR first, then JSON)
    let seal: VeritasSeal = VeritasSeal::from_cbor(seal_bytes)
        .or_else(|_| serde_json::from_slice(seal_bytes).map_err(|e| e.to_string()))
        .map_err(|e| format!("Failed to parse seal: {}", e))?;

    // Compute content hash of the file
    let actual_hash = ContentHash::from_bytes(file_bytes);

    // Check if content hash matches
    let content_matches = seal.content_hash.crypto_hash == actual_hash.crypto_hash;

    // Verify the ML-DSA signature
    let signature_valid = seal.verify().map_err(|e| format!("Verification error: {}", e))?;

    // Format timestamp
    let timestamp = format_timestamp(seal.capture_timestamp_utc);

    // Format QRNG source
    let qrng_source = format!("{:?}", seal.qrng_source);

    // Format media type
    let media_type = format!("{:?}", seal.media_type);

    Ok(VerificationResult {
        valid: signature_valid && content_matches,
        content_matches,
        timestamp,
        content_hash: hex::encode(&actual_hash.crypto_hash),
        expected_hash: hex::encode(&seal.content_hash.crypto_hash),
        qrng_source,
        media_type,
        error: None,
    })
}

fn format_timestamp(timestamp_ms: u64) -> String {
    use chrono::{TimeZone, Utc};
    let secs = (timestamp_ms / 1000) as i64;
    let nsecs = ((timestamp_ms % 1000) * 1_000_000) as u32;
    match Utc.timestamp_opt(secs, nsecs) {
        chrono::LocalResult::Single(dt) => dt.to_rfc3339(),
        _ => format!("{}ms", timestamp_ms),
    }
}

/// Get the library version.
#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
