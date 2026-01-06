//! C2PA manifest builder for Veritas seals
//!
//! This module provides functionality to build C2PA manifests that embed
//! Veritas quantum seals as custom assertions.

use std::io::{Read, Seek, Write};
use std::path::Path;

use c2pa::{Builder, CallbackSigner, Reader, SigningAlg};

use super::assertion::{QuantumSealAssertion, VERITAS_ASSERTION_LABEL};
use super::error::{C2paError, C2paResult};
use super::signer::VeritasSigner;
use crate::seal::VeritasSeal;

/// Helper to concatenate DER certificates into PEM format for c2pa
fn certs_to_pem_chain(der_certs: &[Vec<u8>]) -> Vec<u8> {
    use base64::{engine::general_purpose::STANDARD, Engine};

    let mut pem_chain = Vec::new();
    for der in der_certs {
        pem_chain.extend_from_slice(b"-----BEGIN CERTIFICATE-----\n");
        let b64 = STANDARD.encode(der);
        // Split into 64-char lines
        for chunk in b64.as_bytes().chunks(64) {
            pem_chain.extend_from_slice(chunk);
            pem_chain.push(b'\n');
        }
        pem_chain.extend_from_slice(b"-----END CERTIFICATE-----\n");
    }
    pem_chain
}

/// Builder for creating C2PA manifests with embedded Veritas seals.
///
/// This builder creates C2PA-compliant manifests that include:
/// - Standard C2PA claims and assertions
/// - A custom `veritas.quantum_seal` assertion containing the post-quantum signature
pub struct VeritasManifestBuilder {
    seal: VeritasSeal,
    claim_generator: String,
}

impl VeritasManifestBuilder {
    /// Create a new manifest builder from a VeritasSeal.
    pub fn new(seal: VeritasSeal) -> Self {
        Self {
            seal,
            claim_generator: format!(
                "Veritas Q {} / c2pa-rs {}",
                env!("CARGO_PKG_VERSION"),
                c2pa::VERSION
            ),
        }
    }

    /// Set a custom claim generator string.
    pub fn with_claim_generator(mut self, generator: impl Into<String>) -> Self {
        self.claim_generator = generator.into();
        self
    }

    /// Build the manifest definition JSON for signing.
    ///
    /// This creates a JSON structure that can be signed and embedded into media files.
    pub fn build_manifest_json(&self) -> C2paResult<String> {
        let quantum_assertion = QuantumSealAssertion::from(&self.seal);

        // Build the manifest definition as JSON
        let manifest_def = serde_json::json!({
            "claim_generator": self.claim_generator,
            "claim_generator_info": [{
                "name": "Veritas Q",
                "version": env!("CARGO_PKG_VERSION"),
                "icon": null
            }],
            "title": "Veritas Q Quantum-Authenticated Media",
            "assertions": [
                {
                    "label": "c2pa.actions",
                    "data": {
                        "actions": [
                            {
                                "action": "c2pa.created",
                                "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
                                "softwareAgent": self.claim_generator
                            },
                            {
                                "action": "c2pa.published",
                                "softwareAgent": self.claim_generator
                            }
                        ]
                    }
                },
                {
                    "label": VERITAS_ASSERTION_LABEL,
                    "data": quantum_assertion
                }
            ]
        });

        serde_json::to_string_pretty(&manifest_def)
            .map_err(|e| C2paError::Serialization(e.to_string()))
    }

    /// Embed the manifest into a media file using the provided signer.
    ///
    /// # Arguments
    ///
    /// * `input_path` - Path to the source media file
    /// * `output_path` - Path where the signed media will be written
    /// * `signer` - The certificate signer for C2PA signing (consumed)
    pub fn embed_in_file(
        &self,
        input_path: &Path,
        output_path: &Path,
        signer: VeritasSigner,
    ) -> C2paResult<()> {
        let manifest_json = self.build_manifest_json()?;
        let format = get_format_from_path(input_path)?;

        // Create the builder from JSON definition
        let mut builder = Builder::from_json(&manifest_json)?;

        // Create a callback signer from our VeritasSigner
        let der_certs = signer.certs()?;
        let pem_chain = certs_to_pem_chain(&der_certs);
        let callback_signer = CallbackSigner::new(
            move |_context, data: &[u8]| signer.sign(data),
            SigningAlg::Es256,
            pem_chain,
        );

        // Open input and output files
        let mut input = std::fs::File::open(input_path)?;
        let mut output = std::fs::File::create(output_path)?;

        // Sign and embed the manifest
        builder.sign(&callback_signer, &format, &mut input, &mut output)?;

        Ok(())
    }

    /// Embed the manifest into streams using the provided signer.
    ///
    /// # Arguments
    ///
    /// * `format` - MIME type of the media (e.g., "image/jpeg")
    /// * `input` - Input stream with the media data
    /// * `output` - Output stream for the signed media
    /// * `signer` - The certificate signer for C2PA signing (consumed)
    pub fn embed_in_stream<R, W>(
        &self,
        format: &str,
        input: &mut R,
        output: &mut W,
        signer: VeritasSigner,
    ) -> C2paResult<()>
    where
        R: Read + Seek + Send,
        W: Read + Write + Seek + Send,
    {
        let manifest_json = self.build_manifest_json()?;

        // Create the builder from JSON definition
        let mut builder = Builder::from_json(&manifest_json)?;

        // Create a callback signer from our VeritasSigner
        let der_certs = signer.certs()?;
        let pem_chain = certs_to_pem_chain(&der_certs);
        let callback_signer = CallbackSigner::new(
            move |_context, data: &[u8]| signer.sign(data),
            SigningAlg::Es256,
            pem_chain,
        );

        // Sign and embed the manifest
        builder.sign(&callback_signer, format, input, output)?;

        Ok(())
    }
}

/// Extract a VeritasSeal from a C2PA manifest in a media file.
///
/// # Arguments
///
/// * `path` - Path to the media file containing a C2PA manifest
///
/// # Returns
///
/// The `QuantumSealAssertion` if found, or an error if not present.
pub fn extract_quantum_seal(path: &Path) -> C2paResult<QuantumSealAssertion> {
    let format = get_format_from_path(path)?;
    let mut file = std::fs::File::open(path)?;
    extract_quantum_seal_from_stream(&format, &mut file)
}

/// Extract quantum seal from a stream.
pub fn extract_quantum_seal_from_stream<R: Read + Seek + Send>(
    format: &str,
    stream: R,
) -> C2paResult<QuantumSealAssertion> {
    let reader = Reader::from_stream(format, stream)?;

    let _manifest = reader
        .active_manifest()
        .ok_or(C2paError::NoVeritasSealFound)?;

    // Find the Veritas quantum seal assertion by examining the JSON representation
    let json = reader.json();
    let json_value: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| C2paError::Serialization(e.to_string()))?;

    // Navigate to find the veritas.quantum_seal assertion
    if let Some(manifests) = json_value.get("manifests").and_then(|m| m.as_object()) {
        for (_key, manifest_obj) in manifests {
            if let Some(assertions) = manifest_obj.get("assertions").and_then(|a| a.as_array()) {
                for assertion in assertions {
                    if let Some(label) = assertion.get("label").and_then(|l| l.as_str()) {
                        if label == VERITAS_ASSERTION_LABEL {
                            if let Some(data) = assertion.get("data") {
                                let quantum_seal: QuantumSealAssertion =
                                    serde_json::from_value(data.clone())
                                        .map_err(|e| C2paError::Serialization(e.to_string()))?;
                                return Ok(quantum_seal);
                            }
                        }
                    }
                }
            }
        }
    }

    Err(C2paError::NoVeritasSealFound)
}

/// Verify a C2PA manifest and return validation status.
pub fn verify_c2pa_manifest(path: &Path) -> C2paResult<C2paValidationResult> {
    let format = get_format_from_path(path)?;
    let mut file = std::fs::File::open(path)?;
    let reader = Reader::from_stream(&format, &mut file)?;

    let manifest = reader
        .active_manifest()
        .ok_or(C2paError::NoVeritasSealFound)?;

    let validation_status = reader.validation_status();
    let has_errors = validation_status
        .map(|statuses| {
            statuses
                .iter()
                .any(|s| s.code().starts_with("assertion") || s.code().starts_with("claim"))
        })
        .unwrap_or(false);

    // Check for Veritas quantum seal via JSON
    let json = reader.json();
    let json_value: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| C2paError::Serialization(e.to_string()))?;

    let mut quantum_seal: Option<QuantumSealAssertion> = None;

    if let Some(manifests) = json_value.get("manifests").and_then(|m| m.as_object()) {
        for (_key, manifest_obj) in manifests {
            if let Some(assertions) = manifest_obj.get("assertions").and_then(|a| a.as_array()) {
                for assertion in assertions {
                    if let Some(label) = assertion.get("label").and_then(|l| l.as_str()) {
                        if label == VERITAS_ASSERTION_LABEL {
                            if let Some(data) = assertion.get("data") {
                                quantum_seal = serde_json::from_value(data.clone()).ok();
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(C2paValidationResult {
        c2pa_valid: !has_errors,
        claim_generator: Some(manifest.claim_generator().to_string()),
        quantum_seal,
        validation_errors: validation_status
            .map(|statuses| {
                statuses
                    .iter()
                    .map(|s| format!("{}: {}", s.code(), s.explanation().unwrap_or("Unknown")))
                    .collect()
            })
            .unwrap_or_default(),
    })
}

/// Result of C2PA manifest validation
#[derive(Debug)]
pub struct C2paValidationResult {
    /// Whether the C2PA signature is valid
    pub c2pa_valid: bool,
    /// The claim generator string
    pub claim_generator: Option<String>,
    /// The Veritas quantum seal assertion, if present
    pub quantum_seal: Option<QuantumSealAssertion>,
    /// List of validation errors/warnings
    pub validation_errors: Vec<String>,
}

/// Get the MIME type from a file path extension
fn get_format_from_path(path: &Path) -> C2paResult<String> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let format = match extension.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "heic" | "heif" => "image/heic",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "pdf" => "application/pdf",
        _ => {
            return Err(C2paError::Serialization(format!(
                "Unsupported file format: {}",
                extension
            )))
        }
    };

    Ok(format.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_format_from_path() {
        assert_eq!(
            get_format_from_path(Path::new("test.jpg")).unwrap(),
            "image/jpeg"
        );
        assert_eq!(
            get_format_from_path(Path::new("test.PNG")).unwrap(),
            "image/png"
        );
        assert_eq!(
            get_format_from_path(Path::new("video.mp4")).unwrap(),
            "video/mp4"
        );
        assert!(get_format_from_path(Path::new("test.xyz")).is_err());
    }
}
