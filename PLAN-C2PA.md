# Plan d'Implémentation C2PA/JUMBF - Veritas Q

**Objectif** : Rendre les VeritasSeals compatibles avec le standard C2PA pour l'interopérabilité avec Adobe, Microsoft, BBC, et l'écosystème Content Authenticity Initiative (CAI).

**Impact Business** : Positionnement comme solution compatible avec le standard mondial de provenance média.

---

## Contexte C2PA

### Qu'est-ce que C2PA ?

La **Coalition for Content Provenance and Authenticity (C2PA)** est un standard industriel créé par Adobe, Microsoft, Intel, BBC, et d'autres pour:
- Signer cryptographiquement l'origine des médias
- Tracer l'historique des modifications
- Vérifier l'authenticité du contenu

### Format JUMBF

**JPEG Universal Metadata Box Format (JUMBF)** est le conteneur utilisé par C2PA:
- Défini dans ISO/IEC 19566-5
- Permet d'embarquer des métadonnées structurées dans les fichiers média
- Compatible JPEG, PNG, WebP, MP4, etc.

### Ressources Officielles

- [C2PA Specification](https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html)
- [c2pa-rs SDK Rust](https://github.com/contentauth/c2pa-rs)
- [Content Authenticity Initiative](https://contentauthenticity.org/)

---

## Architecture Proposée

### Positionnement Veritas Q dans C2PA

```
┌─────────────────────────────────────────────────────────────┐
│                     C2PA Manifest                            │
├─────────────────────────────────────────────────────────────┤
│  claim_generator: "Veritas Q v0.1.0"                        │
│  signature_info:                                             │
│    ├── alg: "ML-DSA-65" (ou ES256 pour compat)              │
│    └── cert_chain: [Veritas Q CA]                           │
│                                                              │
│  assertions:                                                 │
│    ├── c2pa.hash.data (SHA256 du contenu)                   │
│    ├── c2pa.actions (capture, seal)                         │
│    └── veritas.quantum_seal (EXTENSION CUSTOM)              │
│        ├── qrng_entropy: [32 bytes]                         │
│        ├── qrng_source: "ID_QUANTIQUE" | "ANU"              │
│        ├── ml_dsa_signature: [3309 bytes]                   │
│        ├── capture_timestamp: u64                           │
│        └── blockchain_anchor: Option<SolanaAnchor>          │
└─────────────────────────────────────────────────────────────┘
```

### Stratégie Dual-Signature

Pour maximiser la compatibilité tout en conservant la sécurité post-quantique:

1. **Signature C2PA standard** : ES256 (ECDSA P-256) pour compatibilité Adobe/Microsoft
2. **Signature Veritas Q** : ML-DSA-65 dans l'assertion custom `veritas.quantum_seal`

```rust
pub struct DualSignedSeal {
    // C2PA standard signature (compatible ecosystem)
    c2pa_signature: EcdsaSignature,  // ES256
    c2pa_certificate: X509Certificate,

    // Veritas Q post-quantum signature (future-proof)
    veritas_seal: VeritasSeal,  // ML-DSA-65
}
```

---

## Phase 1 : Intégration c2pa-rs

### 1.1 Dépendances

**Fichier** : `veritas-core/Cargo.toml`

```toml
[dependencies]
c2pa = "0.36"  # SDK C2PA officiel
```

### 1.2 Module C2PA

**Fichier** : `veritas-core/src/c2pa/mod.rs` (nouveau)

```rust
//! C2PA integration for Veritas Q seals
//!
//! This module provides bidirectional conversion between VeritasSeals
//! and C2PA manifests, enabling interoperability with the Content
//! Authenticity Initiative ecosystem.

mod manifest;
mod assertion;
mod certificate;

pub use manifest::VeritasManifestBuilder;
pub use assertion::QuantumSealAssertion;
```

### 1.3 Custom Assertion

**Fichier** : `veritas-core/src/c2pa/assertion.rs` (nouveau)

```rust
use c2pa::{Assertion, AssertionData};
use serde::{Deserialize, Serialize};

/// Custom C2PA assertion containing the Veritas quantum seal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuantumSealAssertion {
    /// QRNG entropy (256 bits)
    pub qrng_entropy: [u8; 32],

    /// Source of quantum randomness
    pub qrng_source: String,  // "ID_QUANTIQUE", "ANU", "MOCK"

    /// Timestamp of entropy fetch (Unix ms)
    pub entropy_timestamp: u64,

    /// ML-DSA-65 signature (post-quantum)
    #[serde(with = "base64_bytes")]
    pub ml_dsa_signature: Vec<u8>,

    /// ML-DSA-65 public key
    #[serde(with = "base64_bytes")]
    pub ml_dsa_public_key: Vec<u8>,

    /// Optional Solana blockchain anchor
    pub blockchain_anchor: Option<BlockchainAnchorInfo>,

    /// Perceptual hash for robustness (optional)
    pub perceptual_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockchainAnchorInfo {
    pub chain: String,  // "solana"
    pub network: String,  // "mainnet-beta", "devnet"
    pub transaction_id: String,
    pub timestamp: u64,
}

impl Assertion for QuantumSealAssertion {
    const LABEL: &'static str = "veritas.quantum_seal";
    const VERSION: Option<usize> = Some(1);
}
```

### 1.4 Manifest Builder

**Fichier** : `veritas-core/src/c2pa/manifest.rs` (nouveau)

```rust
use c2pa::{Builder, Manifest, SigningAlg};
use crate::seal::VeritasSeal;
use super::assertion::QuantumSealAssertion;

pub struct VeritasManifestBuilder {
    seal: VeritasSeal,
    claim_generator: String,
}

impl VeritasManifestBuilder {
    pub fn new(seal: VeritasSeal) -> Self {
        Self {
            seal,
            claim_generator: format!("Veritas Q {}", env!("CARGO_PKG_VERSION")),
        }
    }

    /// Build a C2PA manifest with embedded Veritas seal
    pub fn build(&self) -> Result<Manifest, C2paError> {
        let mut builder = Builder::new();

        // Set claim generator
        builder.set_claim_generator(&self.claim_generator);

        // Add standard C2PA assertions
        builder.add_assertion(c2pa::assertions::Action::new("c2pa.captured"))?;
        builder.add_assertion(c2pa::assertions::Action::new("veritas.sealed"))?;

        // Add custom Veritas quantum seal assertion
        let quantum_assertion = QuantumSealAssertion::from(&self.seal);
        builder.add_assertion(&quantum_assertion)?;

        builder.build()
    }

    /// Embed manifest into media file
    pub fn embed_in_file(
        &self,
        input_path: &Path,
        output_path: &Path,
        signer: &dyn c2pa::Signer,
    ) -> Result<(), C2paError> {
        let manifest = self.build()?;
        manifest.embed(input_path, output_path, signer)?;
        Ok(())
    }
}

impl From<&VeritasSeal> for QuantumSealAssertion {
    fn from(seal: &VeritasSeal) -> Self {
        Self {
            qrng_entropy: seal.qrng_entropy,
            qrng_source: seal.qrng_source.to_string(),
            entropy_timestamp: seal.entropy_timestamp,
            ml_dsa_signature: seal.signature.clone(),
            ml_dsa_public_key: seal.public_key.clone(),
            blockchain_anchor: seal.blockchain_anchor.as_ref().map(|a| {
                BlockchainAnchorInfo {
                    chain: "solana".to_string(),
                    network: a.network.clone(),
                    transaction_id: a.transaction_id.clone(),
                    timestamp: a.timestamp,
                }
            }),
            perceptual_hash: seal.content_hash.perceptual_hash.clone(),
        }
    }
}
```

---

## Phase 2 : Certificat X.509 Veritas Q

### 2.1 Génération CA Root

Pour signer les manifests C2PA, Veritas Q a besoin d'une chaîne de certificats.

```bash
# Génération de la CA root Veritas Q (une seule fois, à sécuriser)
openssl ecparam -name prime256v1 -genkey -noout -out veritas-ca.key
openssl req -new -x509 -key veritas-ca.key -out veritas-ca.crt \
    -days 3650 \
    -subj "/C=FR/O=Veritas Q/CN=Veritas Q Root CA"
```

### 2.2 Certificat de Signing

```bash
# Certificat pour signer les manifests C2PA
openssl ecparam -name prime256v1 -genkey -noout -out veritas-signing.key
openssl req -new -key veritas-signing.key -out veritas-signing.csr \
    -subj "/C=FR/O=Veritas Q/CN=Veritas Q Content Signing"
openssl x509 -req -in veritas-signing.csr \
    -CA veritas-ca.crt -CAkey veritas-ca.key \
    -CAcreateserial -out veritas-signing.crt -days 365
```

### 2.3 Configuration Signer

**Fichier** : `veritas-core/src/c2pa/certificate.rs` (nouveau)

```rust
use c2pa::{Signer, SigningAlg};
use openssl::pkey::PKey;
use openssl::x509::X509;

pub struct VeritasSigner {
    private_key: PKey<openssl::pkey::Private>,
    certificate_chain: Vec<X509>,
}

impl VeritasSigner {
    pub fn from_pem(key_pem: &[u8], cert_chain_pem: &[u8]) -> Result<Self, Error> {
        let private_key = PKey::private_key_from_pem(key_pem)?;
        let certificate_chain = X509::stack_from_pem(cert_chain_pem)?;

        Ok(Self {
            private_key,
            certificate_chain,
        })
    }

    pub fn from_env() -> Result<Self, Error> {
        let key_path = std::env::var("C2PA_SIGNING_KEY")
            .map_err(|_| Error::MissingEnvVar("C2PA_SIGNING_KEY"))?;
        let cert_path = std::env::var("C2PA_SIGNING_CERT")
            .map_err(|_| Error::MissingEnvVar("C2PA_SIGNING_CERT"))?;

        let key_pem = std::fs::read(&key_path)?;
        let cert_pem = std::fs::read(&cert_path)?;

        Self::from_pem(&key_pem, &cert_pem)
    }
}

impl Signer for VeritasSigner {
    fn sign(&self, data: &[u8]) -> c2pa::Result<Vec<u8>> {
        use openssl::sign::Signer;
        use openssl::hash::MessageDigest;

        let mut signer = Signer::new(MessageDigest::sha256(), &self.private_key)?;
        signer.update(data)?;
        Ok(signer.sign_to_vec()?)
    }

    fn alg(&self) -> SigningAlg {
        SigningAlg::Es256
    }

    fn certs(&self) -> c2pa::Result<Vec<Vec<u8>>> {
        Ok(self.certificate_chain
            .iter()
            .map(|cert| cert.to_der().unwrap())
            .collect())
    }
}
```

---

## Phase 3 : Intégration CLI & API

### 3.1 Nouvelle Commande CLI

**Fichier** : `veritas-cli/src/commands/c2pa.rs` (nouveau)

```rust
use clap::{Args, Subcommand};
use veritas_core::c2pa::{VeritasManifestBuilder, VeritasSigner};

#[derive(Args)]
pub struct C2paArgs {
    #[command(subcommand)]
    command: C2paCommand,
}

#[derive(Subcommand)]
enum C2paCommand {
    /// Embed Veritas seal as C2PA manifest in media file
    Embed {
        /// Input media file
        #[arg(short, long)]
        input: PathBuf,

        /// Output file (default: input with _c2pa suffix)
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Existing seal file (optional, will create new if not provided)
        #[arg(short, long)]
        seal: Option<PathBuf>,
    },

    /// Extract Veritas seal from C2PA manifest
    Extract {
        /// Media file with C2PA manifest
        file: PathBuf,

        /// Output seal file
        #[arg(short, long)]
        output: Option<PathBuf>,
    },

    /// Verify C2PA manifest and embedded Veritas seal
    Verify {
        /// Media file to verify
        file: PathBuf,
    },
}

pub async fn execute(args: C2paArgs) -> Result<()> {
    match args.command {
        C2paCommand::Embed { input, output, seal } => {
            let seal = match seal {
                Some(path) => VeritasSeal::load(&path)?,
                None => {
                    // Create new seal
                    let content = std::fs::read(&input)?;
                    create_seal(&content, MediaType::from_path(&input)?).await?
                }
            };

            let output = output.unwrap_or_else(|| {
                let stem = input.file_stem().unwrap().to_str().unwrap();
                let ext = input.extension().unwrap().to_str().unwrap();
                input.with_file_name(format!("{}_c2pa.{}", stem, ext))
            });

            let signer = VeritasSigner::from_env()?;
            let builder = VeritasManifestBuilder::new(seal);
            builder.embed_in_file(&input, &output, &signer)?;

            println!("✅ C2PA manifest embedded: {}", output.display());
            Ok(())
        }

        C2paCommand::Extract { file, output } => {
            let manifest = c2pa::Manifest::from_file(&file)?;
            let quantum_seal = manifest
                .find_assertion::<QuantumSealAssertion>("veritas.quantum_seal")?
                .ok_or(Error::NoVeritasSealFound)?;

            let seal = VeritasSeal::from(quantum_seal);

            let output = output.unwrap_or_else(|| file.with_extension("seal"));
            seal.save(&output)?;

            println!("✅ Veritas seal extracted: {}", output.display());
            Ok(())
        }

        C2paCommand::Verify { file } => {
            // Verify C2PA signature
            let manifest = c2pa::Manifest::from_file(&file)?;
            let validation = manifest.validation_status();

            println!("📜 C2PA Manifest Verification");
            println!("   Claim generator: {}", manifest.claim_generator());
            println!("   C2PA valid: {}", validation.is_ok());

            // Verify Veritas seal if present
            if let Ok(Some(quantum_seal)) = manifest
                .find_assertion::<QuantumSealAssertion>("veritas.quantum_seal")
            {
                println!("\n🔮 Veritas Quantum Seal");
                println!("   QRNG source: {}", quantum_seal.qrng_source);

                // Verify ML-DSA signature
                let seal = VeritasSeal::from(quantum_seal);
                let content = std::fs::read(&file)?;
                let pq_valid = seal.verify(&content)?;

                println!("   ML-DSA-65 valid: {}", pq_valid);

                if let Some(anchor) = &quantum_seal.blockchain_anchor {
                    println!("   Blockchain: {} ({})", anchor.chain, anchor.network);
                    println!("   Transaction: {}", anchor.transaction_id);
                }
            } else {
                println!("\n⚠️  No Veritas quantum seal found in manifest");
            }

            Ok(())
        }
    }
}
```

### 3.2 Endpoint API

**Fichier** : `veritas-server/src/handlers/c2pa.rs` (nouveau)

```rust
use axum::{extract::Multipart, Json};
use veritas_core::c2pa::VeritasManifestBuilder;

/// POST /c2pa/embed
/// Embed Veritas seal as C2PA manifest
pub async fn embed_c2pa(
    mut multipart: Multipart,
) -> Result<impl IntoResponse, ApiError> {
    let (file_data, media_type) = extract_file(&mut multipart).await?;

    // Create seal
    let seal = create_seal(&file_data, media_type).await?;

    // Build C2PA manifest
    let signer = VeritasSigner::from_env()?;
    let builder = VeritasManifestBuilder::new(seal);

    // Embed in temporary file and return
    let temp_input = tempfile::NamedTempFile::new()?;
    std::fs::write(temp_input.path(), &file_data)?;

    let temp_output = tempfile::NamedTempFile::new()?;
    builder.embed_in_file(temp_input.path(), temp_output.path(), &signer)?;

    let output_data = std::fs::read(temp_output.path())?;

    Ok((
        [(header::CONTENT_TYPE, media_type.mime_type())],
        output_data,
    ))
}
```

---

## Phase 4 : Tests & Validation

### 4.1 Tests Unitaires

**Fichier** : `veritas-core/src/c2pa/tests.rs` (nouveau)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::seal::SealBuilder;
    use crate::qrng::MockQrng;

    #[test]
    fn test_quantum_seal_assertion_roundtrip() {
        let seal = SealBuilder::new()
            .content(&[0u8; 100])
            .media_type(MediaType::Image)
            .qrng_source(MockQrng::new())
            .build()
            .unwrap();

        let assertion = QuantumSealAssertion::from(&seal);
        let json = serde_json::to_string(&assertion).unwrap();
        let parsed: QuantumSealAssertion = serde_json::from_str(&json).unwrap();

        assert_eq!(assertion.qrng_entropy, parsed.qrng_entropy);
        assert_eq!(assertion.ml_dsa_signature, parsed.ml_dsa_signature);
    }

    #[test]
    fn test_c2pa_manifest_creation() {
        let seal = create_test_seal();
        let builder = VeritasManifestBuilder::new(seal);
        let manifest = builder.build().unwrap();

        assert!(manifest.claim_generator().contains("Veritas Q"));
        assert!(manifest.find_assertion::<QuantumSealAssertion>("veritas.quantum_seal").is_ok());
    }

    #[test]
    fn test_c2pa_embed_extract_roundtrip() {
        let test_image = include_bytes!("../../tests/fixtures/test.jpg");
        let seal = create_test_seal_for(test_image);

        let signer = test_signer();
        let builder = VeritasManifestBuilder::new(seal.clone());

        let temp_input = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(temp_input.path(), test_image).unwrap();

        let temp_output = tempfile::NamedTempFile::new().unwrap();
        builder.embed_in_file(temp_input.path(), temp_output.path(), &signer).unwrap();

        // Extract and verify
        let manifest = c2pa::Manifest::from_file(temp_output.path()).unwrap();
        let extracted = manifest
            .find_assertion::<QuantumSealAssertion>("veritas.quantum_seal")
            .unwrap()
            .unwrap();

        assert_eq!(seal.qrng_entropy, extracted.qrng_entropy);
    }
}
```

### 4.2 Test d'Interopérabilité

```bash
# Test avec les outils C2PA officiels
cargo install c2patool

# Créer un fichier avec manifest Veritas Q
veritas c2pa embed -i photo.jpg -o photo_veritas.jpg

# Vérifier avec l'outil officiel C2PA
c2patool photo_veritas.jpg

# Le manifest doit montrer:
# - Claim generator: "Veritas Q x.x.x"
# - Assertion: veritas.quantum_seal
# - Signature: ES256 (compatible)
```

---

## Phase 5 : Soumission Standard C2PA

### 5.1 Extension Registry

Soumettre l'assertion `veritas.quantum_seal` au registre C2PA:
- URL: https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html#_assertion_registry
- Process: Pull request sur le repo de spécifications

### 5.2 Certification CAI

Rejoindre la Content Authenticity Initiative pour:
- Certification officielle de l'implémentation
- Listing dans les outils compatibles
- Accès au trust list C2PA

---

## Variables d'Environnement

```bash
# Certificat de signing C2PA
C2PA_SIGNING_KEY=/path/to/veritas-signing.key
C2PA_SIGNING_CERT=/path/to/veritas-signing-chain.pem

# Trust list C2PA (optionnel)
C2PA_TRUST_ANCHORS=/path/to/trust-anchors.pem
```

---

## Dépendances Ajoutées

```toml
# veritas-core/Cargo.toml
[dependencies]
c2pa = "0.36"
openssl = { version = "0.10", features = ["vendored"] }
base64 = "0.22"
```

---

## Fichiers à Créer/Modifier

### Nouveaux fichiers (7)
| Fichier | Description |
|---------|-------------|
| `veritas-core/src/c2pa/mod.rs` | Module C2PA |
| `veritas-core/src/c2pa/manifest.rs` | Manifest builder |
| `veritas-core/src/c2pa/assertion.rs` | Custom assertion |
| `veritas-core/src/c2pa/certificate.rs` | Signer X.509 |
| `veritas-core/src/c2pa/tests.rs` | Tests unitaires |
| `veritas-cli/src/commands/c2pa.rs` | CLI command |
| `veritas-server/src/handlers/c2pa.rs` | API endpoint |

### Fichiers à modifier (3)
| Fichier | Modifications |
|---------|---------------|
| `veritas-core/Cargo.toml` | Ajouter dep c2pa |
| `veritas-core/src/lib.rs` | Export module c2pa |
| `veritas-cli/src/main.rs` | Ajouter commande c2pa |

---

## Sources

- [C2PA Specification 2.1](https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html)
- [c2pa-rs GitHub](https://github.com/contentauth/c2pa-rs)
- [Content Authenticity Initiative](https://contentauthenticity.org/)
- [JUMBF ISO/IEC 19566-5](https://www.iso.org/standard/73604.html)

---

*Plan généré le 2026-01-06*
