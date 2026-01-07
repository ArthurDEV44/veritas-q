//! C2PA certificate signer for Veritas Q
//!
//! This module provides X.509 certificate-based signing for C2PA manifests
//! using ECDSA P-256 (ES256) for ecosystem compatibility.

use openssl::hash::MessageDigest;
use openssl::pkey::{PKey, Private};
use openssl::sign::Signer;
use openssl::x509::X509;

use super::error::{C2paError, C2paResult};

/// X.509 certificate signer for C2PA manifests.
///
/// Uses ECDSA P-256 (ES256) for signing, which is the standard algorithm
/// supported by the C2PA ecosystem (Adobe, Microsoft, etc.).
///
/// # Security Note
///
/// The private key should be protected. In production, consider using
/// HSM or TEE-based key storage.
pub struct VeritasSigner {
    private_key: PKey<Private>,
    certificate_chain: Vec<X509>,
}

impl VeritasSigner {
    /// Create a signer from PEM-encoded key and certificate chain.
    ///
    /// # Arguments
    ///
    /// * `key_pem` - PEM-encoded ECDSA P-256 private key
    /// * `cert_chain_pem` - PEM-encoded certificate chain (leaf cert first)
    pub fn from_pem(key_pem: &[u8], cert_chain_pem: &[u8]) -> C2paResult<Self> {
        let private_key = PKey::private_key_from_pem(key_pem)?;
        let certificate_chain = X509::stack_from_pem(cert_chain_pem)?;

        if certificate_chain.is_empty() {
            return Err(C2paError::InvalidCertificate(
                "Certificate chain is empty".into(),
            ));
        }

        Ok(Self {
            private_key,
            certificate_chain,
        })
    }

    /// Create a signer from environment variables.
    ///
    /// Supports two modes:
    ///
    /// 1. **File paths** (for local development):
    ///    - `C2PA_SIGNING_KEY` - Path to PEM-encoded private key file
    ///    - `C2PA_SIGNING_CERT` - Path to PEM-encoded certificate file
    ///
    /// 2. **Base64-encoded PEM content** (for cloud deployments like Render):
    ///    - `C2PA_SIGNING_KEY_PEM` - Base64-encoded PEM private key content
    ///    - `C2PA_SIGNING_CERT_PEM` - Base64-encoded PEM certificate content
    ///
    /// The base64 variants take precedence if both are set.
    pub fn from_env() -> C2paResult<Self> {
        use base64::{engine::general_purpose::STANDARD, Engine};

        // Try base64-encoded PEM content first (for cloud deployments)
        if let (Ok(key_b64), Ok(cert_b64)) = (
            std::env::var("C2PA_SIGNING_KEY_PEM"),
            std::env::var("C2PA_SIGNING_CERT_PEM"),
        ) {
            let key_pem = STANDARD
                .decode(&key_b64)
                .map_err(|e| C2paError::InvalidCertificate(format!("Invalid base64 key: {}", e)))?;
            let cert_pem = STANDARD
                .decode(&cert_b64)
                .map_err(|e| C2paError::InvalidCertificate(format!("Invalid base64 cert: {}", e)))?;

            return Self::from_pem(&key_pem, &cert_pem);
        }

        // Fall back to file paths (for local development)
        let key_path = std::env::var("C2PA_SIGNING_KEY")
            .map_err(|_| C2paError::MissingEnvVar("C2PA_SIGNING_KEY or C2PA_SIGNING_KEY_PEM"))?;
        let cert_path = std::env::var("C2PA_SIGNING_CERT")
            .map_err(|_| C2paError::MissingEnvVar("C2PA_SIGNING_CERT or C2PA_SIGNING_CERT_PEM"))?;

        let key_pem = std::fs::read(&key_path)?;
        let cert_pem = std::fs::read(&cert_path)?;

        Self::from_pem(&key_pem, &cert_pem)
    }

    /// Create a signer from file paths.
    ///
    /// # Arguments
    ///
    /// * `key_path` - Path to PEM-encoded ECDSA P-256 private key
    /// * `cert_path` - Path to PEM-encoded certificate chain
    pub fn from_files(
        key_path: impl AsRef<std::path::Path>,
        cert_path: impl AsRef<std::path::Path>,
    ) -> C2paResult<Self> {
        let key_pem = std::fs::read(key_path)?;
        let cert_pem = std::fs::read(cert_path)?;

        Self::from_pem(&key_pem, &cert_pem)
    }

    /// Sign data using ECDSA P-256 with SHA-256.
    pub fn sign(&self, data: &[u8]) -> c2pa::Result<Vec<u8>> {
        let mut signer = Signer::new(MessageDigest::sha256(), &self.private_key)
            .map_err(|e| c2pa::Error::OtherError(Box::new(e)))?;

        signer
            .update(data)
            .map_err(|e| c2pa::Error::OtherError(Box::new(e)))?;

        signer
            .sign_to_vec()
            .map_err(|e| c2pa::Error::OtherError(Box::new(e)))
    }

    /// Get the certificate chain in DER format.
    pub fn certs(&self) -> C2paResult<Vec<Vec<u8>>> {
        self.certificate_chain
            .iter()
            .map(|cert| cert.to_der().map_err(C2paError::OpenSsl))
            .collect()
    }

    /// Get the signing algorithm (always ES256 for C2PA compatibility).
    pub fn algorithm(&self) -> c2pa::SigningAlg {
        c2pa::SigningAlg::Es256
    }
}

/// Generate a self-signed certificate for testing purposes.
///
/// **WARNING**: Do not use in production! Self-signed certificates
/// will not be trusted by C2PA validators.
#[cfg(test)]
pub fn generate_test_certificate() -> C2paResult<(Vec<u8>, Vec<u8>)> {
    use openssl::asn1::Asn1Time;
    use openssl::bn::BigNum;
    use openssl::ec::{EcGroup, EcKey};
    use openssl::nid::Nid;
    use openssl::x509::extension::{BasicConstraints, KeyUsage};
    use openssl::x509::{X509Builder, X509NameBuilder};

    // Generate EC P-256 key pair
    let group = EcGroup::from_curve_name(Nid::X9_62_PRIME256V1)?;
    let ec_key = EcKey::generate(&group)?;
    let private_key = PKey::from_ec_key(ec_key)?;

    // Build certificate
    let mut x509_builder = X509Builder::new()?;
    x509_builder.set_version(2)?;

    // Serial number
    let serial = BigNum::from_u32(1)?;
    let serial = serial.to_asn1_integer()?;
    x509_builder.set_serial_number(&serial)?;

    // Subject/Issuer name
    let mut name_builder = X509NameBuilder::new()?;
    name_builder.append_entry_by_text("C", "US")?;
    name_builder.append_entry_by_text("O", "Veritas Q Test")?;
    name_builder.append_entry_by_text("CN", "Veritas Q Test CA")?;
    let name = name_builder.build();
    x509_builder.set_subject_name(&name)?;
    x509_builder.set_issuer_name(&name)?;

    // Validity
    let not_before = Asn1Time::days_from_now(0)?;
    let not_after = Asn1Time::days_from_now(365)?;
    x509_builder.set_not_before(&not_before)?;
    x509_builder.set_not_after(&not_after)?;

    // Public key
    x509_builder.set_pubkey(&private_key)?;

    // Extensions
    x509_builder.append_extension(BasicConstraints::new().critical().ca().build()?)?;
    x509_builder.append_extension(
        KeyUsage::new()
            .critical()
            .key_cert_sign()
            .digital_signature()
            .build()?,
    )?;

    // Sign with own key (self-signed)
    x509_builder.sign(&private_key, MessageDigest::sha256())?;
    let cert = x509_builder.build();

    // Convert to PEM
    let key_pem = private_key.private_key_to_pem_pkcs8()?;
    let cert_pem = cert.to_pem()?;

    Ok((key_pem, cert_pem))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_test_certificate() {
        let (key_pem, cert_pem) = generate_test_certificate().expect("generate cert");

        // Verify we can create a signer from the generated certs
        let signer = VeritasSigner::from_pem(&key_pem, &cert_pem).expect("create signer");

        // Verify we can sign data
        let data = b"test data";
        let signature = signer.sign(data).expect("sign");
        assert!(!signature.is_empty());
    }

    #[test]
    fn test_signer_certs() {
        let (key_pem, cert_pem) = generate_test_certificate().expect("generate cert");
        let signer = VeritasSigner::from_pem(&key_pem, &cert_pem).expect("create signer");

        let certs = signer.certs().expect("get certs");
        assert_eq!(certs.len(), 1);
        assert!(!certs[0].is_empty());
    }

    #[test]
    fn test_empty_cert_chain_rejected() {
        let (key_pem, _) = generate_test_certificate().expect("generate cert");
        let result = VeritasSigner::from_pem(&key_pem, b"");
        assert!(result.is_err());
    }
}
