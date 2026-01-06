//! Custom C2PA assertion for Veritas quantum seals
//!
//! This module defines the `QuantumSealAssertion` which embeds Veritas Q's
//! post-quantum signature and QRNG entropy within a C2PA manifest.

use serde::{Deserialize, Serialize};

use crate::seal::{BlockchainAnchor, VeritasSeal};
use crate::QrngSource;

/// Label for the Veritas quantum seal assertion in C2PA manifests
pub const VERITAS_ASSERTION_LABEL: &str = "veritas.quantum_seal";

/// Version of the Veritas assertion schema
pub const VERITAS_ASSERTION_VERSION: usize = 1;

/// Custom C2PA assertion containing the Veritas quantum seal data.
///
/// This assertion is embedded within a C2PA manifest to provide:
/// - Post-quantum signature (ML-DSA-65) alongside the standard C2PA signature
/// - QRNG entropy binding for capture-time authenticity
/// - Optional blockchain anchor for immutable timestamping
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuantumSealAssertion {
    /// Schema version for forward compatibility
    pub version: usize,

    /// QRNG entropy (256 bits) bound to content at capture time
    #[serde(with = "hex_bytes")]
    pub qrng_entropy: [u8; 32],

    /// Source of quantum randomness
    pub qrng_source: String,

    /// Timestamp when entropy was fetched (Unix milliseconds)
    pub entropy_timestamp: u64,

    /// Capture timestamp (Unix milliseconds)
    pub capture_timestamp: u64,

    /// ML-DSA-65 post-quantum signature
    #[serde(with = "base64_bytes")]
    pub ml_dsa_signature: Vec<u8>,

    /// ML-DSA-65 public key for verification
    #[serde(with = "base64_bytes")]
    pub ml_dsa_public_key: Vec<u8>,

    /// Cryptographic hash of the content (SHA3-256)
    #[serde(with = "hex_bytes")]
    pub content_hash: [u8; 32],

    /// Optional perceptual hash for robustness
    #[serde(skip_serializing_if = "Option::is_none")]
    pub perceptual_hash: Option<String>,

    /// Optional blockchain anchor for immutable timestamping
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blockchain_anchor: Option<BlockchainAnchorInfo>,
}

/// Blockchain anchor information for immutable timestamping
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockchainAnchorInfo {
    /// Blockchain identifier (e.g., "solana")
    pub chain: String,
    /// Network identifier (e.g., "mainnet-beta", "devnet")
    pub network: String,
    /// Transaction ID on the blockchain
    pub transaction_id: String,
    /// Block height when anchored
    pub block_height: u64,
}

impl From<&VeritasSeal> for QuantumSealAssertion {
    fn from(seal: &VeritasSeal) -> Self {
        Self {
            version: VERITAS_ASSERTION_VERSION,
            qrng_entropy: seal.qrng_entropy,
            qrng_source: qrng_source_to_string(&seal.qrng_source),
            entropy_timestamp: seal.entropy_timestamp,
            capture_timestamp: seal.capture_timestamp_utc,
            ml_dsa_signature: seal.signature.clone(),
            ml_dsa_public_key: seal.public_key.clone(),
            content_hash: seal.content_hash.crypto_hash,
            perceptual_hash: seal.content_hash.perceptual_hash.as_ref().map(hex::encode),
            blockchain_anchor: seal
                .blockchain_anchor
                .as_ref()
                .map(|a| BlockchainAnchorInfo {
                    chain: a.chain.clone(),
                    network: extract_network(&a.chain),
                    transaction_id: a.tx_id.clone(),
                    block_height: a.block_height,
                }),
        }
    }
}

impl QuantumSealAssertion {
    /// Convert this assertion back to blockchain anchor info for a VeritasSeal
    pub fn to_blockchain_anchor(&self) -> Option<BlockchainAnchor> {
        self.blockchain_anchor.as_ref().map(|a| BlockchainAnchor {
            chain: format!("{}-{}", a.chain, a.network),
            tx_id: a.transaction_id.clone(),
            block_height: a.block_height,
        })
    }

    /// Get the assertion label for C2PA
    pub fn label() -> &'static str {
        VERITAS_ASSERTION_LABEL
    }
}

/// Convert QrngSource enum to string for serialization
fn qrng_source_to_string(source: &QrngSource) -> String {
    match source {
        QrngSource::Mock => "MOCK".to_string(),
        QrngSource::AnuCloud => "ANU_CLOUD".to_string(),
        QrngSource::IdQuantiqueCloud => "ID_QUANTIQUE_CLOUD".to_string(),
        QrngSource::DeviceHardware { device_id } => format!("DEVICE_HARDWARE:{}", device_id),
    }
}

/// Extract network from chain string (e.g., "solana-devnet" -> "devnet")
fn extract_network(chain: &str) -> String {
    chain
        .split('-')
        .nth(1)
        .unwrap_or("mainnet-beta")
        .to_string()
}

/// Hex encoding/decoding for fixed-size byte arrays
mod hex_bytes {
    use serde::{self, Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(bytes: &[u8; 32], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&hex::encode(bytes))
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<[u8; 32], D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        let bytes = hex::decode(&s).map_err(serde::de::Error::custom)?;
        let arr: [u8; 32] = bytes
            .try_into()
            .map_err(|_| serde::de::Error::custom("expected 32 bytes"))?;
        Ok(arr)
    }
}

/// Base64 encoding/decoding for variable-length byte vectors
mod base64_bytes {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use serde::{self, Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(bytes: &[u8], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&STANDARD.encode(bytes))
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        STANDARD.decode(&s).map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qrng_source_to_string() {
        assert_eq!(qrng_source_to_string(&QrngSource::Mock), "MOCK");
        assert_eq!(qrng_source_to_string(&QrngSource::AnuCloud), "ANU_CLOUD");
        assert_eq!(
            qrng_source_to_string(&QrngSource::IdQuantiqueCloud),
            "ID_QUANTIQUE_CLOUD"
        );
    }

    #[test]
    fn test_extract_network() {
        assert_eq!(extract_network("solana-devnet"), "devnet");
        // "solana-mainnet-beta" splits into ["solana", "mainnet", "beta"]
        // so nth(1) returns "mainnet"
        assert_eq!(extract_network("solana-mainnet-beta"), "mainnet");
        assert_eq!(extract_network("solana"), "mainnet-beta"); // fallback
    }

    #[test]
    fn test_quantum_seal_assertion_serialization() {
        let assertion = QuantumSealAssertion {
            version: 1,
            qrng_entropy: [0u8; 32],
            qrng_source: "MOCK".to_string(),
            entropy_timestamp: 1704067200000,
            capture_timestamp: 1704067200000,
            ml_dsa_signature: vec![1, 2, 3, 4],
            ml_dsa_public_key: vec![5, 6, 7, 8],
            content_hash: [0xAB; 32],
            perceptual_hash: None,
            blockchain_anchor: None,
        };

        let json = serde_json::to_string(&assertion).expect("serialize");
        let parsed: QuantumSealAssertion = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(parsed.version, assertion.version);
        assert_eq!(parsed.qrng_entropy, assertion.qrng_entropy);
        assert_eq!(parsed.qrng_source, assertion.qrng_source);
        assert_eq!(parsed.ml_dsa_signature, assertion.ml_dsa_signature);
    }
}
