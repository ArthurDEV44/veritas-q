//! C2PA integration for Veritas Q seals
//!
//! This module provides bidirectional conversion between VeritasSeals
//! and C2PA manifests, enabling interoperability with the Content
//! Authenticity Initiative ecosystem (Adobe, Microsoft, BBC, etc.).
//!
//! # Architecture
//!
//! Veritas Q uses a dual-signature strategy:
//! - **C2PA standard signature** (ES256/ECDSA P-256) for ecosystem compatibility
//! - **Veritas quantum seal** (ML-DSA-65) as a custom assertion for post-quantum security
//!
//! # Example
//!
//! ```no_run
//! use veritas_core::c2pa::{VeritasManifestBuilder, QuantumSealAssertion};
//! use veritas_core::VeritasSeal;
//!
//! # fn example(seal: VeritasSeal) -> Result<(), Box<dyn std::error::Error>> {
//! // Convert a VeritasSeal to a C2PA-compatible assertion
//! let assertion = QuantumSealAssertion::from(&seal);
//!
//! // Build a C2PA manifest with the embedded Veritas seal
//! let builder = VeritasManifestBuilder::new(seal);
//! # Ok(())
//! # }
//! ```

mod assertion;
mod error;
mod manifest;
mod signer;

pub use assertion::{BlockchainAnchorInfo, QuantumSealAssertion};
pub use error::{C2paError, C2paResult};
pub use manifest::{
    extract_quantum_seal, extract_quantum_seal_from_stream, verify_c2pa_manifest,
    C2paValidationResult, VeritasManifestBuilder,
};
pub use signer::VeritasSigner;
