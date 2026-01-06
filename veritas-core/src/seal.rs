use pqcrypto_mldsa::mldsa65;
use pqcrypto_traits::sign::{PublicKey, SecretKey as SecretKeyTrait, SignedMessage};
use serde::{Deserialize, Serialize};
use sha3::{Digest, Sha3_256};
use zeroize::Zeroize;

use crate::error::{Result, VeritasError, CURRENT_SEAL_VERSION, MAX_SEAL_SIZE};
use crate::qrng::QrngSource;
#[cfg(feature = "network")]
use chrono::Utc;
#[cfg(feature = "network")]
use crate::qrng::QuantumEntropySource;

/// Maximum allowed difference between entropy and capture timestamps (in seconds).
#[cfg(feature = "network")]
const MAX_ENTROPY_TIMESTAMP_DRIFT_SECS: u64 = 5;

// ML-DSA-65 (FIPS 204) cryptographic sizes
/// ML-DSA-65 public key size in bytes.
pub const MLDSA65_PUBLIC_KEY_BYTES: usize = 1952;
/// ML-DSA-65 secret key size in bytes.
pub const MLDSA65_SECRET_KEY_BYTES: usize = 4032;
/// ML-DSA-65 detached signature size in bytes.
pub const MLDSA65_SIGNATURE_BYTES: usize = 3309;

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

/// Result of seal verification with detailed failure information.
///
/// This enum provides more granular information about verification failures
/// compared to a simple boolean result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VerificationResult {
    /// Signature is valid and payload matches
    Valid,
    /// ML-DSA signature verification failed (forged or corrupted seal)
    InvalidSignature,
    /// Signature valid but signed payload doesn't match reconstructed payload
    PayloadMismatch,
    /// Public key in seal is malformed
    InvalidPublicKey,
    /// Signature format is malformed
    MalformedSignature,
}

impl VerificationResult {
    /// Returns true if verification succeeded.
    #[inline]
    pub fn is_valid(&self) -> bool {
        matches!(self, Self::Valid)
    }

    /// Returns a human-readable description of the result.
    pub fn description(&self) -> &'static str {
        match self {
            Self::Valid => "Signature is valid",
            Self::InvalidSignature => "Signature verification failed - seal may be forged",
            Self::PayloadMismatch => "Payload mismatch - seal data may have been modified",
            Self::InvalidPublicKey => "Public key in seal is malformed",
            Self::MalformedSignature => "Signature format is invalid",
        }
    }
}

/// Result of full content verification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentVerificationResult {
    /// Both signature and content hash are valid
    Authentic,
    /// Signature valid but content has been modified
    ContentModified {
        expected_hash: [u8; 32],
        actual_hash: [u8; 32],
    },
    /// Signature verification failed
    SignatureFailed(VerificationResult),
}

impl ContentVerificationResult {
    /// Returns true if content is fully authentic.
    #[inline]
    pub fn is_authentic(&self) -> bool {
        matches!(self, Self::Authentic)
    }

    /// Returns a human-readable description of the result.
    pub fn description(&self) -> String {
        match self {
            Self::Authentic => "Content is authentic - signature valid and hash matches".into(),
            Self::ContentModified { .. } => {
                "Content has been modified since sealing - hash mismatch".into()
            }
            Self::SignatureFailed(result) => result.description().into(),
        }
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

        // Get QRNG source identifier
        let qrng_source = qrng.source_id();

        // Create the signable payload (everything except signature)
        let signable = SignablePayload {
            capture_timestamp_utc,
            capture_location: &self.capture_location,
            device_attestation: &self.device_attestation,
            qrng_entropy: &qrng_entropy,
            qrng_source: &qrng_source,
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
    qrng_source: &'a QrngSource,
    entropy_timestamp: u64,
    content_hash: &'a ContentHash,
    media_type: MediaType,
}

impl VeritasSeal {
    /// Verify the seal's signature is valid.
    ///
    /// Returns `Ok(true)` if valid, `Ok(false)` if invalid.
    /// Returns `Err` only for serialization errors.
    ///
    /// For more detailed failure information, use [`verify_detailed`].
    pub fn verify(&self) -> Result<bool> {
        self.verify_detailed().map(|result| result.is_valid())
    }

    /// Verify the seal's signature with detailed result information.
    ///
    /// Unlike [`verify`], this method distinguishes between different
    /// failure modes (invalid signature, payload mismatch, malformed keys).
    pub fn verify_detailed(&self) -> Result<VerificationResult> {
        // Reconstruct the signable payload (no clone needed - use reference)
        let signable = SignablePayload {
            capture_timestamp_utc: self.capture_timestamp_utc,
            capture_location: &self.capture_location,
            device_attestation: &self.device_attestation,
            qrng_entropy: &self.qrng_entropy,
            qrng_source: &self.qrng_source,
            entropy_timestamp: self.entropy_timestamp,
            content_hash: &self.content_hash,
            media_type: self.media_type,
        };

        // Serialize to CBOR (pre-allocate buffer)
        let mut signable_bytes = Vec::with_capacity(512);
        ciborium::into_writer(&signable, &mut signable_bytes)
            .map_err(|e| VeritasError::SerializationError(e.to_string()))?;

        // Reconstruct public key
        let public_key = match mldsa65::PublicKey::from_bytes(&self.public_key) {
            Ok(pk) => pk,
            Err(_) => return Ok(VerificationResult::InvalidPublicKey),
        };

        // Verify signature format
        let signed_message = match mldsa65::SignedMessage::from_bytes(&self.signature) {
            Ok(sm) => sm,
            Err(_) => return Ok(VerificationResult::MalformedSignature),
        };

        // Verify ML-DSA signature
        match mldsa65::open(&signed_message, &public_key) {
            Ok(verified_message) => {
                if verified_message == signable_bytes {
                    Ok(VerificationResult::Valid)
                } else {
                    Ok(VerificationResult::PayloadMismatch)
                }
            }
            Err(_) => Ok(VerificationResult::InvalidSignature),
        }
    }

    /// Verify both the seal's signature and that the content matches.
    ///
    /// This is a convenience method that combines signature verification
    /// with content hash validation in a single call.
    pub fn verify_content(&self, content: &[u8]) -> Result<ContentVerificationResult> {
        // First verify the signature
        let sig_result = self.verify_detailed()?;

        if !sig_result.is_valid() {
            return Ok(ContentVerificationResult::SignatureFailed(sig_result));
        }

        // Then verify content hash
        let actual_hash = ContentHash::from_bytes(content);

        if self.content_hash.crypto_hash == actual_hash.crypto_hash {
            Ok(ContentVerificationResult::Authentic)
        } else {
            Ok(ContentVerificationResult::ContentModified {
                expected_hash: self.content_hash.crypto_hash,
                actual_hash: actual_hash.crypto_hash,
            })
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

        // Validate cryptographic field sizes (ML-DSA-65)
        if seal.public_key.len() != MLDSA65_PUBLIC_KEY_BYTES {
            return Err(VeritasError::InvalidSeal(format!(
                "invalid public key size: expected {} bytes, got {}",
                MLDSA65_PUBLIC_KEY_BYTES,
                seal.public_key.len()
            )));
        }

        // Note: signature size varies because SignedMessage includes the message
        // Minimum size is MLDSA65_SIGNATURE_BYTES (detached signature)
        if seal.signature.len() < MLDSA65_SIGNATURE_BYTES {
            return Err(VeritasError::InvalidSeal(format!(
                "signature too short: minimum {} bytes, got {}",
                MLDSA65_SIGNATURE_BYTES,
                seal.signature.len()
            )));
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

    #[tokio::test]
    async fn test_verify_detailed_returns_valid() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Test content".to_vec();
        let seal = SealBuilder::new(content, MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        let result = seal.verify_detailed().expect("Verification failed");
        assert_eq!(result, VerificationResult::Valid);
        assert!(result.is_valid());
    }

    #[tokio::test]
    async fn test_verify_detailed_payload_mismatch() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Test content".to_vec();
        let mut seal = SealBuilder::new(content, MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        // Tamper with payload data (not signature itself)
        seal.content_hash.crypto_hash[0] ^= 0xFF;

        let result = seal.verify_detailed().expect("Verification failed");
        assert_eq!(result, VerificationResult::PayloadMismatch);
        assert!(!result.is_valid());
    }

    #[tokio::test]
    async fn test_verify_detailed_invalid_public_key() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Test content".to_vec();
        let mut seal = SealBuilder::new(content, MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        // Corrupt public key
        seal.public_key = vec![0xFF; 10];

        let result = seal.verify_detailed().expect("Verification failed");
        assert_eq!(result, VerificationResult::InvalidPublicKey);
    }

    #[tokio::test]
    async fn test_verify_detailed_corrupted_signature() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Test content".to_vec();
        let mut seal = SealBuilder::new(content, MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        // Corrupt signature bytes (keeps same length)
        seal.signature[0] ^= 0xFF;
        seal.signature[100] ^= 0xFF;

        let result = seal.verify_detailed().expect("Verification failed");
        // Corrupted signatures fail as InvalidSignature (pqcrypto behavior)
        assert!(!result.is_valid());
        assert!(matches!(
            result,
            VerificationResult::InvalidSignature | VerificationResult::MalformedSignature
        ));
    }

    #[tokio::test]
    async fn test_verify_content_authentic() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Original content".to_vec();
        let seal = SealBuilder::new(content.clone(), MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        let result = seal.verify_content(&content).expect("Verification failed");
        assert_eq!(result, ContentVerificationResult::Authentic);
        assert!(result.is_authentic());
    }

    #[tokio::test]
    async fn test_verify_content_modified() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let original_content = b"Original content".to_vec();
        let seal = SealBuilder::new(original_content, MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        // Verify against modified content
        let modified_content = b"Modified content".to_vec();
        let result = seal
            .verify_content(&modified_content)
            .expect("Verification failed");

        assert!(matches!(
            result,
            ContentVerificationResult::ContentModified { .. }
        ));
        assert!(!result.is_authentic());
    }

    #[tokio::test]
    async fn test_verify_content_signature_failed() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Test content".to_vec();
        let mut seal = SealBuilder::new(content.clone(), MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        // Corrupt signature bytes
        seal.signature[0] ^= 0xFF;
        seal.signature[100] ^= 0xFF;

        let result = seal.verify_content(&content).expect("Verification failed");
        assert!(matches!(
            result,
            ContentVerificationResult::SignatureFailed(_)
        ));
        assert!(!result.is_authentic());
    }

    #[tokio::test]
    async fn test_invalid_public_key_size_rejected() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Test".to_vec();
        let mut seal = SealBuilder::new(content, MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        // Truncate public key
        seal.public_key.truncate(100);

        let cbor = seal.to_cbor().expect("Failed to serialize");
        let result = VeritasSeal::from_cbor(&cbor);

        assert!(matches!(result, Err(VeritasError::InvalidSeal(_))));
    }

    #[tokio::test]
    async fn test_signature_too_short_rejected() {
        let qrng = MockQrng::default();
        let (public_key, secret_key) = generate_keypair();

        let content = b"Test".to_vec();
        let mut seal = SealBuilder::new(content, MediaType::Image)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
            .expect("Failed to create seal");

        // Truncate signature below minimum
        seal.signature.truncate(100);

        let cbor = seal.to_cbor().expect("Failed to serialize");
        let result = VeritasSeal::from_cbor(&cbor);

        assert!(matches!(result, Err(VeritasError::InvalidSeal(_))));
    }
}
