use chrono::Utc;
use pqcrypto_mldsa::mldsa65;
use pqcrypto_traits::sign::{PublicKey, SignedMessage};
use serde::{Deserialize, Serialize};
use sha3::{Digest, Sha3_256};

use crate::error::{Result, VeritasError};
use crate::qrng::QrngSource;
#[cfg(feature = "network")]
use crate::qrng::QuantumEntropySource;

/// Maximum allowed difference between entropy and capture timestamps (in seconds).
#[cfg(feature = "network")]
const MAX_ENTROPY_TIMESTAMP_DRIFT_SECS: u64 = 5;

/// Device attestation information from TEE.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceAttestation {
    /// Unique device identifier from TEE
    pub device_id: String,
    /// TEE type (e.g., "ARM_TRUSTZONE", "APPLE_SECURE_ENCLAVE")
    pub tee_type: String,
    /// Attestation certificate or token
    pub attestation_token: Vec<u8>,
}

/// Content hash combining perceptual and cryptographic hashes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentHash {
    /// SHA3-256 cryptographic hash of raw content
    pub crypto_hash: [u8; 32],
    /// Optional perceptual hash for images/video (for robustness to re-encoding)
    pub perceptual_hash: Option<Vec<u8>>,
}

impl ContentHash {
    /// Create a content hash from raw bytes.
    pub fn from_bytes(data: &[u8]) -> Self {
        let mut hasher = Sha3_256::new();
        hasher.update(data);
        let result = hasher.finalize();

        let mut crypto_hash = [0u8; 32];
        crypto_hash.copy_from_slice(&result);

        Self {
            crypto_hash,
            perceptual_hash: None,
        }
    }
}

/// Media type being sealed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MediaType {
    Image,
    Video,
    Audio,
}

/// Blockchain anchor reference for immutable timestamping.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockchainAnchor {
    /// Chain identifier (e.g., "solana-mainnet", "solana-devnet")
    pub chain: String,
    /// Transaction ID on the blockchain
    pub tx_id: String,
    /// Block height when anchored
    pub block_height: u64,
}

/// The Veritas Seal - core data structure for authenticated media.
///
/// Contains all information needed to verify the authenticity of media
/// captured at a specific moment with quantum-grade cryptographic assurance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VeritasSeal {
    // === Capture Context ===
    /// NTP-synced Unix timestamp (milliseconds)
    pub capture_timestamp_utc: u64,
    /// Privacy-preserving location (configurable precision geohash)
    pub capture_location: Option<String>,
    /// TEE-signed device identity
    pub device_attestation: Option<DeviceAttestation>,

    // === Quantum Entropy ===
    /// 256 bits from QRNG at capture moment
    pub qrng_entropy: [u8; 32],
    /// Cloud API or local chip attestation
    pub qrng_source: QrngSource,
    /// When entropy was generated (Unix timestamp ms)
    pub entropy_timestamp: u64,

    // === Content Binding ===
    /// Perceptual hash + cryptographic hash
    pub content_hash: ContentHash,
    /// Image, Video, Audio
    pub media_type: MediaType,

    // === Post-Quantum Signature ===
    /// FIPS 204 ML-DSA-65 signature (128-bit security)
    pub signature: Vec<u8>,
    /// ML-DSA-65 public key
    pub public_key: Vec<u8>,

    // === Anchoring ===
    /// Optional blockchain anchor for public verification
    pub blockchain_anchor: Option<BlockchainAnchor>,
}

/// Builder for creating VeritasSeal instances.
/// Only available with the "network" feature (requires async).
#[cfg(feature = "network")]
pub struct SealBuilder {
    content: Vec<u8>,
    media_type: MediaType,
    capture_location: Option<String>,
    device_attestation: Option<DeviceAttestation>,
}

#[cfg(feature = "network")]
impl SealBuilder {
    /// Create a new seal builder for the given content.
    pub fn new(content: Vec<u8>, media_type: MediaType) -> Self {
        Self {
            content,
            media_type,
            capture_location: None,
            device_attestation: None,
        }
    }

    /// Set the capture location (geohash).
    pub fn with_location(mut self, geohash: String) -> Self {
        self.capture_location = Some(geohash);
        self
    }

    /// Set device attestation.
    pub fn with_attestation(mut self, attestation: DeviceAttestation) -> Self {
        self.device_attestation = Some(attestation);
        self
    }

    /// Build and sign the seal using the provided QRNG source and signing key.
    pub async fn build<Q: QuantumEntropySource>(
        self,
        qrng: &Q,
        secret_key: &mldsa65::SecretKey,
        public_key: &mldsa65::PublicKey,
    ) -> Result<VeritasSeal> {
        let now = Utc::now();
        let capture_timestamp_utc = now.timestamp_millis() as u64;

        // Fetch quantum entropy
        let qrng_entropy = qrng.get_entropy().await?;
        let entropy_timestamp = Utc::now().timestamp_millis() as u64;

        // Validate entropy timestamp is within acceptable drift
        let drift = entropy_timestamp.saturating_sub(capture_timestamp_utc);
        if drift > MAX_ENTROPY_TIMESTAMP_DRIFT_SECS * 1000 {
            return Err(VeritasError::EntropyTimestampMismatch {
                entropy_ts: entropy_timestamp,
                capture_ts: capture_timestamp_utc,
            });
        }

        // Create content hash
        let content_hash = ContentHash::from_bytes(&self.content);

        // Create the signable payload (everything except signature)
        let signable = SignablePayload {
            capture_timestamp_utc,
            capture_location: &self.capture_location,
            device_attestation: &self.device_attestation,
            qrng_entropy: &qrng_entropy,
            qrng_source: qrng.source_id(),
            entropy_timestamp,
            content_hash: &content_hash,
            media_type: self.media_type,
        };

        // Serialize signable payload to CBOR for signing
        let mut signable_bytes = Vec::new();
        ciborium::into_writer(&signable, &mut signable_bytes)
            .map_err(|e| VeritasError::SerializationError(e.to_string()))?;

        // Sign with ML-DSA-65
        let signed_message = mldsa65::sign(&signable_bytes, secret_key);
        let signature = signed_message.as_bytes().to_vec();

        Ok(VeritasSeal {
            capture_timestamp_utc,
            capture_location: self.capture_location,
            device_attestation: self.device_attestation,
            qrng_entropy,
            qrng_source: qrng.source_id(),
            entropy_timestamp,
            content_hash,
            media_type: self.media_type,
            signature,
            public_key: public_key.as_bytes().to_vec(),
            blockchain_anchor: None,
        })
    }
}

/// Internal structure for the signable portion of a seal.
#[derive(Serialize)]
struct SignablePayload<'a> {
    capture_timestamp_utc: u64,
    capture_location: &'a Option<String>,
    device_attestation: &'a Option<DeviceAttestation>,
    qrng_entropy: &'a [u8; 32],
    qrng_source: QrngSource,
    entropy_timestamp: u64,
    content_hash: &'a ContentHash,
    media_type: MediaType,
}

impl VeritasSeal {
    /// Verify the seal's signature is valid.
    pub fn verify(&self) -> Result<bool> {
        // Reconstruct the signable payload
        let signable = SignablePayload {
            capture_timestamp_utc: self.capture_timestamp_utc,
            capture_location: &self.capture_location,
            device_attestation: &self.device_attestation,
            qrng_entropy: &self.qrng_entropy,
            qrng_source: self.qrng_source.clone(),
            entropy_timestamp: self.entropy_timestamp,
            content_hash: &self.content_hash,
            media_type: self.media_type,
        };

        // Serialize to CBOR
        let mut signable_bytes = Vec::new();
        ciborium::into_writer(&signable, &mut signable_bytes)
            .map_err(|e| VeritasError::SerializationError(e.to_string()))?;

        // Reconstruct public key
        let public_key = mldsa65::PublicKey::from_bytes(&self.public_key)
            .map_err(|_| VeritasError::SignatureError("Invalid public key".into()))?;

        // Verify signature
        let signed_message = mldsa65::SignedMessage::from_bytes(&self.signature)
            .map_err(|_| VeritasError::SignatureError("Invalid signature format".into()))?;

        match mldsa65::open(&signed_message, &public_key) {
            Ok(verified_message) => {
                // Check that the verified message matches our signable payload
                if verified_message == signable_bytes {
                    Ok(true)
                } else {
                    Ok(false)
                }
            }
            Err(_) => Ok(false),
        }
    }

    /// Serialize the seal to CBOR bytes.
    pub fn to_cbor(&self) -> Result<Vec<u8>> {
        let mut bytes = Vec::new();
        ciborium::into_writer(self, &mut bytes)
            .map_err(|e| VeritasError::SerializationError(e.to_string()))?;
        Ok(bytes)
    }

    /// Deserialize a seal from CBOR bytes.
    pub fn from_cbor(bytes: &[u8]) -> Result<Self> {
        ciborium::from_reader(bytes).map_err(|e| VeritasError::SerializationError(e.to_string()))
    }
}

/// Generate a new ML-DSA-65 keypair for seal signing.
pub fn generate_keypair() -> (mldsa65::PublicKey, mldsa65::SecretKey) {
    mldsa65::keypair()
}

#[cfg(all(test, feature = "network"))]
mod tests {
    use super::*;
    use crate::qrng::MockQrng;

    #[tokio::test]
    async fn test_seal_creation_and_verification() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Hello World".to_vec();
        let seal = SealBuilder::new(content, MediaType::Image)
            .build(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        assert!(
            seal.verify().expect("Verification failed"),
            "Seal should be valid"
        );
        assert_eq!(seal.qrng_source, QrngSource::Mock);
        assert_eq!(seal.media_type, MediaType::Image);
    }

    #[tokio::test]
    async fn test_seal_cbor_roundtrip() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Test content".to_vec();
        let seal = SealBuilder::new(content, MediaType::Video)
            .with_location("u4pruydqqvj".to_string())
            .build(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        let cbor = seal.to_cbor().expect("Failed to serialize");
        let restored = VeritasSeal::from_cbor(&cbor).expect("Failed to deserialize");

        assert!(
            restored.verify().expect("Verification failed"),
            "Restored seal should be valid"
        );
        assert_eq!(restored.capture_location, Some("u4pruydqqvj".to_string()));
    }

    #[tokio::test]
    async fn test_tampered_seal_fails_verification() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Original content".to_vec();
        let mut seal = SealBuilder::new(content, MediaType::Image)
            .build(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        // Tamper with the content hash
        seal.content_hash.crypto_hash[0] ^= 0xFF;

        assert!(
            !seal.verify().expect("Verification call failed"),
            "Tampered seal should fail verification"
        );
    }
}
