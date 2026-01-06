use chrono::Utc;
use pqcrypto_mldsa::mldsa65;
use pqcrypto_traits::sign::{PublicKey, SecretKey as SecretKeyTrait, SignedMessage};
use serde::{Deserialize, Serialize};
use sha3::{Digest, Sha3_256};
use zeroize::Zeroize;

use crate::error::{Result, VeritasError, CURRENT_SEAL_VERSION, MAX_SEAL_SIZE};
use crate::qrng::QrngSource;
#[cfg(feature = "network")]
use crate::qrng::QuantumEntropySource;

/// Maximum allowed difference between entropy and capture timestamps (in seconds).
#[cfg(feature = "network")]
const MAX_ENTROPY_TIMESTAMP_DRIFT_SECS: u64 = 5;

/// Wrapper for ML-DSA-65 secret key that zeroizes memory on drop.
///
/// This ensures secret key material is securely erased from memory
/// when it goes out of scope, preventing potential leakage.
///
/// # Security
///
/// The secret key bytes are stored in a separate Vec that is explicitly
/// zeroized when the wrapper is dropped. This provides defense-in-depth
/// even though the original key struct may still contain the key data.
pub struct ZeroizingSecretKey {
    /// Copy of secret key bytes that will be zeroized on drop
    bytes: Vec<u8>,
    /// The actual key used for signing operations
    key: mldsa65::SecretKey,
}

impl ZeroizingSecretKey {
    /// Create a new zeroizing wrapper from an ML-DSA-65 secret key.
    pub fn new(key: mldsa65::SecretKey) -> Self {
        let bytes = key.as_bytes().to_vec();
        Self { bytes, key }
    }

    /// Get a reference to the underlying secret key for signing.
    pub fn as_inner(&self) -> &mldsa65::SecretKey {
        &self.key
    }
}

impl Drop for ZeroizingSecretKey {
    fn drop(&mut self) {
        self.bytes.zeroize();
    }
}

// Prevent Debug from leaking key material
impl std::fmt::Debug for ZeroizingSecretKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ZeroizingSecretKey")
            .field("bytes", &"[REDACTED]")
            .finish()
    }
}

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
    // === Format Version ===
    /// Seal format version for forward compatibility
    #[serde(default = "default_version")]
    pub version: u8,

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

/// Default version for deserializing legacy seals without version field.
fn default_version() -> u8 {
    1
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
    ///
    /// Accepts either a raw `mldsa65::SecretKey` or a `ZeroizingSecretKey` wrapper.
    pub async fn build<Q: QuantumEntropySource>(
        self,
        qrng: &Q,
        secret_key: &mldsa65::SecretKey,
        public_key: &mldsa65::PublicKey,
    ) -> Result<VeritasSeal> {
        let now = Utc::now();
        let capture_timestamp_utc =
            u64::try_from(now.timestamp_millis()).map_err(|_| VeritasError::InvalidTimestamp {
                reason: "timestamp before Unix epoch".into(),
            })?;

        // Fetch quantum entropy
        let qrng_entropy = qrng.get_entropy().await?;
        let entropy_timestamp = u64::try_from(Utc::now().timestamp_millis()).map_err(|_| {
            VeritasError::InvalidTimestamp {
                reason: "entropy timestamp before Unix epoch".into(),
            }
        })?;

        // Validate entropy timestamp is within acceptable drift (bidirectional)
        let drift_ms = entropy_timestamp.abs_diff(capture_timestamp_utc);
        if drift_ms > MAX_ENTROPY_TIMESTAMP_DRIFT_SECS * 1000 {
            return Err(VeritasError::EntropyTimestampMismatch {
                entropy_ts: entropy_timestamp,
                capture_ts: capture_timestamp_utc,
                drift_ms,
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

        // Serialize signable payload to CBOR for signing (pre-allocate buffer)
        let mut signable_bytes = Vec::with_capacity(512);
        ciborium::into_writer(&signable, &mut signable_bytes)
            .map_err(|e| VeritasError::SerializationError(e.to_string()))?;

        // Sign with ML-DSA-65
        let signed_message = mldsa65::sign(&signable_bytes, secret_key);
        let signature = signed_message.as_bytes().to_vec();

        Ok(VeritasSeal {
            version: CURRENT_SEAL_VERSION,
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

    /// Build and sign the seal using a zeroizing secret key wrapper.
    ///
    /// This is the recommended method as it ensures the secret key is
    /// securely erased from memory when the wrapper is dropped.
    pub async fn build_secure<Q: QuantumEntropySource>(
        self,
        qrng: &Q,
        secret_key: &ZeroizingSecretKey,
        public_key: &mldsa65::PublicKey,
    ) -> Result<VeritasSeal> {
        self.build(qrng, secret_key.as_inner(), public_key).await
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
        let mut bytes = Vec::with_capacity(4096);
        ciborium::into_writer(self, &mut bytes)
            .map_err(|e| VeritasError::SerializationError(e.to_string()))?;
        Ok(bytes)
    }

    /// Deserialize a seal from CBOR bytes.
    ///
    /// # Security
    ///
    /// This method enforces a maximum size limit to prevent denial-of-service
    /// attacks via maliciously crafted large inputs.
    pub fn from_cbor(bytes: &[u8]) -> Result<Self> {
        // Security: Prevent DoS via oversized input
        if bytes.len() > MAX_SEAL_SIZE {
            return Err(VeritasError::SealTooLarge {
                size: bytes.len(),
                max: MAX_SEAL_SIZE,
            });
        }

        let seal: Self = ciborium::from_reader(bytes)
            .map_err(|e| VeritasError::SerializationError(e.to_string()))?;

        // Validate version compatibility
        if seal.version > CURRENT_SEAL_VERSION {
            return Err(VeritasError::UnsupportedSealVersion(
                seal.version,
                CURRENT_SEAL_VERSION,
            ));
        }

        Ok(seal)
    }
}

/// Generate a new ML-DSA-65 keypair for seal signing.
///
/// Returns the public key and a zeroizing wrapper for the secret key.
/// The secret key will be securely erased from memory when dropped.
pub fn generate_keypair() -> (mldsa65::PublicKey, ZeroizingSecretKey) {
    let (pk, sk) = mldsa65::keypair();
    (pk, ZeroizingSecretKey::new(sk))
}

/// Generate a new ML-DSA-65 keypair returning raw keys (for testing).
///
/// **Warning**: Prefer `generate_keypair()` for production use as it
/// returns a `ZeroizingSecretKey` that securely erases memory on drop.
pub fn generate_keypair_raw() -> (mldsa65::PublicKey, mldsa65::SecretKey) {
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
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        assert!(
            seal.verify().expect("Verification failed"),
            "Seal should be valid"
        );
        assert_eq!(seal.version, CURRENT_SEAL_VERSION);
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
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        let cbor = seal.to_cbor().expect("Failed to serialize");
        let restored = VeritasSeal::from_cbor(&cbor).expect("Failed to deserialize");

        assert!(
            restored.verify().expect("Verification failed"),
            "Restored seal should be valid"
        );
        assert_eq!(restored.version, CURRENT_SEAL_VERSION);
        assert_eq!(restored.capture_location, Some("u4pruydqqvj".to_string()));
    }

    #[tokio::test]
    async fn test_tampered_seal_fails_verification() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Original content".to_vec();
        let mut seal = SealBuilder::new(content, MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        // Tamper with the content hash
        seal.content_hash.crypto_hash[0] ^= 0xFF;

        assert!(
            !seal.verify().expect("Verification call failed"),
            "Tampered seal should fail verification"
        );
    }

    #[tokio::test]
    async fn test_seal_too_large_rejected() {
        // Create a byte array larger than MAX_SEAL_SIZE
        let oversized = vec![0u8; MAX_SEAL_SIZE + 1];

        let result = VeritasSeal::from_cbor(&oversized);
        assert!(matches!(
            result,
            Err(VeritasError::SealTooLarge { size, max })
            if size == MAX_SEAL_SIZE + 1 && max == MAX_SEAL_SIZE
        ));
    }

    #[tokio::test]
    async fn test_unsupported_version_rejected() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Test".to_vec();
        let mut seal = SealBuilder::new(content, MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        // Bump version to unsupported
        seal.version = CURRENT_SEAL_VERSION + 1;

        let cbor = seal.to_cbor().expect("Failed to serialize");
        let result = VeritasSeal::from_cbor(&cbor);

        assert!(matches!(
            result,
            Err(VeritasError::UnsupportedSealVersion(v, current))
            if v == CURRENT_SEAL_VERSION + 1 && current == CURRENT_SEAL_VERSION
        ));
    }
}
