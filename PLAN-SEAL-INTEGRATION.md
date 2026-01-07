# Plan d'Intégration Complète du Sceau Veritas dans les Images

> **Version**: 1.2
> **Date**: 2026-01-07
> **Auteur**: Claude Code (Anthropic)
> **Statut**: Phase 2 COMPLÈTE - Prêt pour Phase 3

---

## 🚀 ÉTAT D'AVANCEMENT (Dernière mise à jour: 2026-01-07)

### ✅ Phase 1: Fondations C2PA - COMPLÈTE

**Module C2PA implémenté dans `veritas-core/src/c2pa/`:**
- `mod.rs` - Exports du module
- `manifest.rs` - `VeritasManifestBuilder` pour construire les manifests C2PA
- `assertion.rs` - `QuantumSealAssertion` pour les assertions Veritas personnalisées
- `signer.rs` - `VeritasSigner` pour la signature ECDSA P-256 (ES256)
- `error.rs` - Types d'erreurs C2PA

**Handlers API dans `veritas-server/src/handlers/c2pa.rs`:**
- `POST /c2pa/embed` - Intègre un manifest C2PA dans une image
- `POST /c2pa/verify` - Vérifie le manifest C2PA d'une image

**Certificats de test:**
- `keys/c2pa-test.key` - Clé privée ECDSA P-256
- `keys/c2pa-test.crt` - Certificat auto-signé (valide 1 an)
- `scripts/generate-test-cert.sh` - Script de génération

**Configuration Render (Secret Files):**
- `C2PA_SIGNING_KEY=/etc/secrets/c2pa-signing.key`
- `C2PA_SIGNING_CERT=/etc/secrets/c2pa-signing.crt`

### ✅ Phase 2: Soft Binding - COMPLÈTE

**Module Watermark implémenté dans `veritas-core/src/watermark/`:**
- `mod.rs` - Exports du module (remplace l'ancien `phash.rs`)
- `perceptual.rs` - `PerceptualHasher` pour le hachage perceptuel d'images
  - Algorithmes supportés: pHash (DCT), dHash (Gradient), aHash (Moyenne), Blockhash
  - Distance de Hamming pour comparaison de similarité
  - Seuil recommandé: ≤10 pour images similaires

**API étendue:**
- `POST /seal` retourne maintenant `perceptual_hash` (hex) pour les images
- Le hash perceptuel est inclus dans `QuantumSealAssertion.perceptual_hash`

**Tests de robustesse (`veritas-core/tests/watermark_robustness.rs`):**
- ✅ Compression JPEG (50%, 70%, 90%) - Distance 0
- ✅ Redimensionnement (50%, 75%, 150%) - Distance 0
- ✅ Rognage (10%, 25%) - Distance 0
- ⚠️ Rotation (90°, 180°) - Distance 20-40 (non invariant par conception)
- ✅ Transformations combinées - Distance 0

### 🔲 Phase 3: Manifest Repository - À FAIRE
### 🔲 Phase 4: Intégration Frontend - À FAIRE
### 🔲 Phase 5: Vérification & Polish - À FAIRE

### 📋 Prochaines étapes immédiates:
1. Tester les endpoints `/c2pa/embed` et `/c2pa/verify` sur Render
2. Commencer Phase 3: Créer le module `veritas-server/src/manifest_store/`
3. Implémenter le stockage PostgreSQL des manifests pour la résolution soft binding

---

## Table des Matières

1. [Objectifs](#1-objectifs)
2. [Architecture Cible](#2-architecture-cible)
3. [Standards et Conformité](#3-standards-et-conformité)
4. [Implémentation Technique](#4-implémentation-technique)
5. [Phases de Développement](#5-phases-de-développement)
6. [Robustesse et Sécurité](#6-robustesse-et-sécurité)
7. [Tests et Validation](#7-tests-et-validation)
8. [Sources et Références](#8-sources-et-références)

---

## 1. Objectifs

### 1.1 Objectif Principal

Intégrer le VeritasSeal directement dans les fichiers images de manière à ce que :
- Le sceau voyage avec l'image
- L'image soit vérifiable par des outils tiers compatibles C2PA
- Le sceau soit récupérable même si les métadonnées sont supprimées (soft binding)
- La signature post-quantique ML-DSA soit préservée

### 1.2 Critères de Succès

| Critère | Mesure | Cible |
|---------|--------|-------|
| Compatibilité C2PA | Validation par c2patool | 100% |
| Durabilité du sceau | Récupération après strip métadonnées | > 95% |
| Performance | Temps d'intégration sceau | < 500ms |
| Intégrité | Taux de détection de falsification | 100% |
| Interopérabilité | Vérification Adobe/Microsoft | Compatible |

### 1.3 Résultat Attendu

Une image scellée par Veritas-Q doit :
1. **Contenir** le manifest C2PA avec les assertions Veritas
2. **Afficher** le badge Content Credentials dans les outils compatibles
3. **Permettre** la vérification de l'authenticité
4. **Résister** à la suppression de métadonnées via soft binding
5. **Prouver** l'origine quantique de l'entropie

---

## 2. Architecture Cible

### 2.1 Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CAPTURE & SEAL FLOW                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────┐  │
│  │  Camera  │───▶│  Image   │───▶│  Veritas │───▶│  C2PA Manifest   │  │
│  │ Capture  │    │   Blob   │    │   Seal   │    │  Integration     │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────────────┘  │
│                                        │                    │           │
│                                        ▼                    ▼           │
│                               ┌──────────────┐    ┌─────────────────┐  │
│                               │  QRNG        │    │  Soft Binding   │  │
│                               │  Entropy     │    │  (Watermark)    │  │
│                               └──────────────┘    └─────────────────┘  │
│                                        │                    │           │
│                                        ▼                    ▼           │
│                               ┌──────────────┐    ┌─────────────────┐  │
│                               │  ML-DSA-65   │    │  Manifest       │  │
│                               │  Signature   │    │  Repository     │  │
│                               └──────────────┘    └─────────────────┘  │
│                                        │                               │
│                                        ▼                               │
│                               ┌──────────────────────────────────┐     │
│                               │      SEALED IMAGE (JUMBF)        │     │
│                               │  ┌────────────────────────────┐  │     │
│                               │  │ Image Data                 │  │     │
│                               │  ├────────────────────────────┤  │     │
│                               │  │ C2PA Manifest Store        │  │     │
│                               │  │  ├─ Veritas Assertions     │  │     │
│                               │  │  ├─ QRNG Proof             │  │     │
│                               │  │  ├─ ML-DSA Signature       │  │     │
│                               │  │  └─ Soft Binding Hash      │  │     │
│                               │  └────────────────────────────┘  │     │
│                               └──────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Composants Principaux

#### 2.2.1 Seal Embedder (Nouveau Module)

```
veritas-core/
├── src/
│   ├── seal.rs           # Existant - VeritasSeal struct
│   ├── c2pa/             # NOUVEAU - Module C2PA
│   │   ├── mod.rs
│   │   ├── manifest.rs   # Construction du manifest C2PA
│   │   ├── assertions.rs # Assertions Veritas personnalisées
│   │   ├── embedder.rs   # Intégration JUMBF dans l'image
│   │   └── verifier.rs   # Vérification des manifests
│   ├── watermark/        # NOUVEAU - Soft Binding
│   │   ├── mod.rs
│   │   ├── encoder.rs    # Encodage watermark invisible
│   │   ├── decoder.rs    # Décodage watermark
│   │   └── perceptual.rs # Hash perceptuel (pHash)
│   └── ...
```

#### 2.2.2 API Server Extensions

```
veritas-server/
├── src/
│   ├── handlers/
│   │   ├── seal.rs       # Modifié - Retourne image avec manifest
│   │   └── verify.rs     # Modifié - Vérifie manifest C2PA
│   ├── manifest_store/   # NOUVEAU - Stockage des manifests
│   │   ├── mod.rs
│   │   ├── postgres.rs   # Stockage PostgreSQL
│   │   └── resolver.rs   # Résolution soft binding
│   └── ...
```

### 2.3 Format du Manifest C2PA Veritas

```json
{
  "claim_generator": "Veritas-Q/0.1.0 c2pa-rs/0.45",
  "title": "Quantum-Sealed Media",
  "format": "image/jpeg",
  "instance_id": "xmp:iid:456432bd-c1b5-4c52-8fae-db7db305c6a3",
  "assertions": [
    {
      "label": "c2pa.actions",
      "data": {
        "actions": [
          {
            "action": "c2pa.created",
            "when": "2026-01-07T12:51:11Z",
            "softwareAgent": "Veritas-Q PWA/1.0"
          }
        ]
      }
    },
    {
      "label": "veritas.quantum_entropy",
      "data": {
        "source": "anu_cloud",
        "entropy_id": "qe-abc123",
        "entropy_hash": "sha256:...",
        "fetch_timestamp": "2026-01-07T12:51:10.500Z",
        "bits": 256
      }
    },
    {
      "label": "veritas.device_attestation",
      "data": {
        "method": "webauthn",
        "credential_id": "eo7qvq2_OZlAawuk2RHEiw",
        "authenticator_type": "platform",
        "attestation_timestamp": "2026-01-07T12:50:11Z"
      }
    },
    {
      "label": "veritas.post_quantum_signature",
      "data": {
        "algorithm": "ML-DSA-65",
        "standard": "FIPS-204",
        "public_key_hash": "sha256:...",
        "signature_timestamp": "2026-01-07T12:51:11Z"
      }
    },
    {
      "label": "c2pa.hash.data",
      "data": {
        "exclusions": [],
        "name": "jumbf manifest",
        "alg": "sha256",
        "hash": "..."
      }
    }
  ],
  "signature_info": {
    "alg": "ps256",
    "issuer": "Veritas-Q Signing Authority",
    "time": "2026-01-07T12:51:11Z"
  }
}
```

---

## 3. Standards et Conformité

### 3.1 C2PA Specification 2.2

**Source**: [C2PA Technical Specification 2.2](https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html)

Le système Veritas-Q sera conforme à C2PA 2.2, incluant :

| Fonctionnalité | Spec C2PA | Implémentation Veritas |
|----------------|-----------|------------------------|
| Manifest Store | JUMBF Box | `c2pa` crate |
| Hard Binding | SHA-256 hash | Hash du contenu image |
| Soft Binding | Perceptual hash / Watermark | pHash + watermark invisible |
| Signature | ECDSA/RSA | ML-DSA-65 (extension) + ECDSA (compatibilité) |
| Actions | c2pa.created | Action de création |
| Custom Assertions | Namespace personnalisé | `veritas.*` |

### 3.2 FIPS 204 - ML-DSA (Post-Quantum)

**Source**: [NIST FIPS 204](https://csrc.nist.gov/pubs/fips/204/final)

Veritas-Q utilise déjà ML-DSA-65 pour les signatures post-quantiques. Pour la compatibilité C2PA :

```
┌─────────────────────────────────────────────────────────────┐
│                    DUAL SIGNATURE APPROACH                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐         ┌─────────────────────────┐   │
│  │   ML-DSA-65     │         │   ECDSA P-256           │   │
│  │   (Primary)     │         │   (C2PA Compatibility)  │   │
│  │                 │         │                         │   │
│  │  Post-Quantum   │         │  Trust List Compatible  │   │
│  │  FIPS 204       │         │  Browser Verifiable     │   │
│  └────────┬────────┘         └───────────┬─────────────┘   │
│           │                              │                  │
│           └──────────┬───────────────────┘                  │
│                      ▼                                      │
│           ┌─────────────────────┐                           │
│           │   Veritas Seal      │                           │
│           │   (Both Signatures) │                           │
│           └─────────────────────┘                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Trust List et Certificats

Pour que les Content Credentials soient reconnus par les outils tiers :

1. **Court terme (2026)**: Utiliser un certificat de test auto-signé
2. **Moyen terme (2026-2027)**: Rejoindre le programme de conformité C2PA
3. **Long terme (2027+)**: Certificat de la Trust List officielle C2PA

**Action requise**: Contacter C2PA pour inclusion dans le programme de conformité.

---

## 4. Implémentation Technique

### 4.1 Dépendances Cargo

```toml
# veritas-core/Cargo.toml
[dependencies]
c2pa = { version = "0.45", features = ["file_io", "add_thumbnails"] }
image = "0.25"
image_hasher = "2.0"  # Pour pHash (soft binding)
sha2 = "0.10"

# Pour watermark invisible (optionnel, phase 2)
# trustmark = "0.1"  # Si disponible, sinon implémentation custom
```

### 4.2 Module C2PA - Manifest Builder

```rust
// veritas-core/src/c2pa/manifest.rs

use c2pa::{Builder, SigningAlg, settings::Settings};
use crate::seal::VeritasSeal;

/// Configuration pour la construction du manifest C2PA
pub struct ManifestConfig {
    /// Identifiant de l'application
    pub claim_generator: String,
    /// Certificat de signature (PEM)
    pub signing_cert: Vec<u8>,
    /// Clé privée de signature (PEM)
    pub signing_key: Vec<u8>,
    /// Algorithme de signature C2PA
    pub signing_alg: SigningAlg,
}

impl Default for ManifestConfig {
    fn default() -> Self {
        Self {
            claim_generator: format!("Veritas-Q/{} c2pa-rs/0.45", env!("CARGO_PKG_VERSION")),
            signing_cert: Vec::new(),  // À configurer
            signing_key: Vec::new(),   // À configurer
            signing_alg: SigningAlg::Ps256,
        }
    }
}

/// Constructeur de manifest C2PA pour Veritas
pub struct VeritasManifestBuilder {
    config: ManifestConfig,
}

impl VeritasManifestBuilder {
    pub fn new(config: ManifestConfig) -> Self {
        Self { config }
    }

    /// Crée un manifest C2PA à partir d'un VeritasSeal
    pub fn build_manifest(&self, seal: &VeritasSeal) -> Result<Builder, C2paError> {
        let manifest_json = self.create_manifest_json(seal)?;

        let mut builder = Builder::from_json(&manifest_json)?;

        // Ajouter les assertions Veritas personnalisées
        builder.add_assertion(
            "veritas.quantum_entropy",
            &self.create_qrng_assertion(seal)?
        )?;

        builder.add_assertion(
            "veritas.post_quantum_signature",
            &self.create_pq_signature_assertion(seal)?
        )?;

        if let Some(attestation) = &seal.device_attestation {
            builder.add_assertion(
                "veritas.device_attestation",
                &self.create_attestation_assertion(attestation)?
            )?;
        }

        Ok(builder)
    }

    /// Intègre le manifest dans une image
    pub async fn embed_in_image(
        &self,
        seal: &VeritasSeal,
        image_data: &[u8],
        media_type: &str,
    ) -> Result<Vec<u8>, C2paError> {
        let builder = self.build_manifest(seal)?;
        let signer = self.create_signer()?;

        let mut source = std::io::Cursor::new(image_data);
        let mut dest = std::io::Cursor::new(Vec::new());

        builder.sign(&signer, media_type, &mut source, &mut dest)?;

        Ok(dest.into_inner())
    }

    fn create_manifest_json(&self, seal: &VeritasSeal) -> Result<String, C2paError> {
        let manifest = serde_json::json!({
            "claim_generator": self.config.claim_generator,
            "title": "Quantum-Sealed Media",
            "assertions": [
                {
                    "label": "c2pa.actions",
                    "data": {
                        "actions": [{
                            "action": "c2pa.created",
                            "when": seal.capture_timestamp_utc.to_rfc3339(),
                            "softwareAgent": "Veritas-Q PWA"
                        }]
                    }
                },
                {
                    "label": "c2pa.hash.data",
                    "data": {
                        "name": "jumbf manifest",
                        "alg": "sha256"
                    }
                }
            ]
        });

        Ok(manifest.to_string())
    }

    fn create_qrng_assertion(&self, seal: &VeritasSeal) -> Result<QrngAssertion, C2paError> {
        Ok(QrngAssertion {
            source: seal.qrng_source.to_string(),
            entropy_hash: hex::encode(&seal.qrng_entropy_hash),
            fetch_timestamp: seal.qrng_fetch_timestamp.to_rfc3339(),
            bits: 256,
        })
    }

    fn create_pq_signature_assertion(&self, seal: &VeritasSeal) -> Result<PqSignatureAssertion, C2paError> {
        Ok(PqSignatureAssertion {
            algorithm: "ML-DSA-65".to_string(),
            standard: "FIPS-204".to_string(),
            public_key_hash: hex::encode(sha256(&seal.public_key)),
            signature_timestamp: seal.signature_timestamp.to_rfc3339(),
        })
    }
}

#[derive(Serialize)]
struct QrngAssertion {
    source: String,
    entropy_hash: String,
    fetch_timestamp: String,
    bits: u32,
}

#[derive(Serialize)]
struct PqSignatureAssertion {
    algorithm: String,
    standard: String,
    public_key_hash: String,
    signature_timestamp: String,
}
```

### 4.3 Module Soft Binding - Perceptual Hash

```rust
// veritas-core/src/watermark/perceptual.rs

use image_hasher::{HasherConfig, HashAlg};
use image::DynamicImage;

/// Configuration du hash perceptuel
pub struct PerceptualHashConfig {
    /// Taille du hash (défaut: 16x16 = 256 bits)
    pub hash_size: u32,
    /// Algorithme (défaut: DCT)
    pub algorithm: HashAlg,
}

impl Default for PerceptualHashConfig {
    fn default() -> Self {
        Self {
            hash_size: 16,
            algorithm: HashAlg::Gradient,  // Meilleur pour les photos
        }
    }
}

/// Calcule le hash perceptuel d'une image
pub struct PerceptualHasher {
    hasher: image_hasher::Hasher,
}

impl PerceptualHasher {
    pub fn new(config: PerceptualHashConfig) -> Self {
        let hasher = HasherConfig::new()
            .hash_size(config.hash_size, config.hash_size)
            .hash_alg(config.algorithm)
            .to_hasher();

        Self { hasher }
    }

    /// Calcule le pHash d'une image
    pub fn hash(&self, image: &DynamicImage) -> PerceptualHash {
        let hash = self.hasher.hash_image(image);
        PerceptualHash {
            bits: hash.to_base64(),
            algorithm: "gradient".to_string(),
            size: 256,
        }
    }

    /// Compare deux images et retourne la distance de Hamming
    pub fn compare(&self, img1: &DynamicImage, img2: &DynamicImage) -> u32 {
        let hash1 = self.hasher.hash_image(img1);
        let hash2 = self.hasher.hash_image(img2);
        hash1.dist(&hash2)
    }

    /// Vérifie si deux images sont "similaires" (seuil configurable)
    pub fn is_similar(&self, img1: &DynamicImage, img2: &DynamicImage, threshold: u32) -> bool {
        self.compare(img1, img2) <= threshold
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerceptualHash {
    pub bits: String,
    pub algorithm: String,
    pub size: u32,
}
```

### 4.4 Module Embedder - Intégration JUMBF

```rust
// veritas-core/src/c2pa/embedder.rs

use c2pa::{Builder, Reader, SigningAlg};
use std::io::{Read, Seek, Write};

/// Résultat de l'intégration du manifest
#[derive(Debug)]
pub struct EmbedResult {
    /// Image avec manifest intégré
    pub sealed_image: Vec<u8>,
    /// Hash perceptuel pour soft binding
    pub perceptual_hash: PerceptualHash,
    /// ID du manifest pour le repository
    pub manifest_id: String,
    /// Taille du manifest en bytes
    pub manifest_size: usize,
}

/// Service d'intégration des manifests C2PA
pub struct ManifestEmbedder {
    manifest_builder: VeritasManifestBuilder,
    perceptual_hasher: PerceptualHasher,
}

impl ManifestEmbedder {
    pub fn new(config: ManifestConfig) -> Self {
        Self {
            manifest_builder: VeritasManifestBuilder::new(config),
            perceptual_hasher: PerceptualHasher::new(PerceptualHashConfig::default()),
        }
    }

    /// Intègre le VeritasSeal dans une image et retourne l'image scellée
    pub async fn embed(
        &self,
        seal: &VeritasSeal,
        image_data: &[u8],
        media_type: &str,
    ) -> Result<EmbedResult, EmbedError> {
        // 1. Calculer le hash perceptuel avant modification
        let image = image::load_from_memory(image_data)?;
        let perceptual_hash = self.perceptual_hasher.hash(&image);

        // 2. Construire et intégrer le manifest C2PA
        let sealed_image = self.manifest_builder
            .embed_in_image(seal, image_data, media_type)
            .await?;

        // 3. Générer l'ID du manifest
        let manifest_id = uuid::Uuid::new_v4().to_string();

        // 4. Calculer la taille du manifest
        let manifest_size = sealed_image.len() - image_data.len();

        Ok(EmbedResult {
            sealed_image,
            perceptual_hash,
            manifest_id,
            manifest_size,
        })
    }

    /// Extrait et vérifie le manifest d'une image
    pub fn verify(&self, image_data: &[u8]) -> Result<VerificationResult, VerifyError> {
        let reader = Reader::from_stream(media_type, std::io::Cursor::new(image_data))?;

        let manifest = reader.active_manifest()
            .ok_or(VerifyError::NoManifest)?;

        // Vérifier les assertions Veritas
        let veritas_assertions = self.extract_veritas_assertions(manifest)?;

        // Vérifier l'intégrité du hash
        let hash_valid = self.verify_hash_binding(manifest)?;

        Ok(VerificationResult {
            is_valid: hash_valid,
            manifest_id: manifest.instance_id().to_string(),
            assertions: veritas_assertions,
            signature_info: self.extract_signature_info(manifest)?,
        })
    }
}

#[derive(Debug)]
pub struct VerificationResult {
    pub is_valid: bool,
    pub manifest_id: String,
    pub assertions: VeritasAssertions,
    pub signature_info: SignatureInfo,
}
```

### 4.5 Manifest Repository - Stockage PostgreSQL

```rust
// veritas-server/src/manifest_store/postgres.rs

use sqlx::{PgPool, FromRow};
use chrono::{DateTime, Utc};

/// Entrée dans le repository des manifests
#[derive(Debug, FromRow)]
pub struct ManifestRecord {
    pub id: String,
    pub seal_id: String,
    pub perceptual_hash: String,
    pub manifest_cbor: Vec<u8>,
    pub created_at: DateTime<Utc>,
    pub image_hash: String,
}

/// Repository pour le stockage durable des manifests
pub struct ManifestRepository {
    pool: PgPool,
}

impl ManifestRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Initialise les tables nécessaires
    pub async fn init(&self) -> Result<(), sqlx::Error> {
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS manifests (
                id VARCHAR(36) PRIMARY KEY,
                seal_id VARCHAR(36) NOT NULL,
                perceptual_hash VARCHAR(64) NOT NULL,
                manifest_cbor BYTEA NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                image_hash VARCHAR(64) NOT NULL,

                -- Index pour la recherche par hash perceptuel
                CONSTRAINT idx_perceptual_hash UNIQUE (perceptual_hash)
            );

            -- Index pour la résolution soft binding
            CREATE INDEX IF NOT EXISTS idx_manifests_phash
            ON manifests USING btree (perceptual_hash);

            CREATE INDEX IF NOT EXISTS idx_manifests_seal_id
            ON manifests (seal_id);
        "#)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Stocke un manifest pour résolution ultérieure
    pub async fn store(&self, record: &ManifestRecord) -> Result<(), StoreError> {
        sqlx::query(r#"
            INSERT INTO manifests (id, seal_id, perceptual_hash, manifest_cbor, image_hash)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE SET
                manifest_cbor = EXCLUDED.manifest_cbor,
                image_hash = EXCLUDED.image_hash
        "#)
        .bind(&record.id)
        .bind(&record.seal_id)
        .bind(&record.perceptual_hash)
        .bind(&record.manifest_cbor)
        .bind(&record.image_hash)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Résout un manifest par hash perceptuel (soft binding)
    pub async fn resolve_by_phash(&self, phash: &str, threshold: u32) -> Result<Option<ManifestRecord>, ResolveError> {
        // Pour une vraie implémentation, utiliser une recherche par similarité
        // Ici, recherche exacte pour simplicité
        let record = sqlx::query_as::<_, ManifestRecord>(r#"
            SELECT * FROM manifests WHERE perceptual_hash = $1
        "#)
        .bind(phash)
        .fetch_optional(&self.pool)
        .await?;

        Ok(record)
    }

    /// Résout un manifest par seal_id
    pub async fn resolve_by_seal_id(&self, seal_id: &str) -> Result<Option<ManifestRecord>, ResolveError> {
        let record = sqlx::query_as::<_, ManifestRecord>(r#"
            SELECT * FROM manifests WHERE seal_id = $1
        "#)
        .bind(seal_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(record)
    }
}
```

### 4.6 API Server - Handler Modifié

```rust
// veritas-server/src/handlers/seal.rs (modifié)

use crate::c2pa::{ManifestEmbedder, ManifestConfig};
use crate::manifest_store::ManifestRepository;

/// Réponse du endpoint /seal avec image intégrée
#[derive(Serialize)]
pub struct SealResponseV2 {
    pub seal_id: String,
    pub seal_data: String,
    pub timestamp: i64,
    pub has_device_attestation: bool,
    /// Image avec manifest C2PA intégré (base64)
    pub sealed_image: String,
    /// Hash perceptuel pour soft binding
    pub perceptual_hash: String,
    /// Taille du manifest en bytes
    pub manifest_size: usize,
}

pub async fn seal_v2(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<SealResponseV2>, ApiError> {
    // ... parsing multipart existant ...

    // Créer le seal (code existant)
    let seal = create_seal(&content, media_type, device_attestation, use_mock).await?;

    // NOUVEAU: Intégrer le manifest C2PA dans l'image
    let embedder = ManifestEmbedder::new(state.manifest_config.clone());
    let embed_result = embedder.embed(&seal, &content, &mime_type).await?;

    // NOUVEAU: Stocker dans le repository pour soft binding
    let manifest_record = ManifestRecord {
        id: uuid::Uuid::new_v4().to_string(),
        seal_id: seal_id.clone(),
        perceptual_hash: embed_result.perceptual_hash.bits.clone(),
        manifest_cbor: seal.to_cbor()?,
        created_at: Utc::now(),
        image_hash: hex::encode(sha256(&content)),
    };
    state.manifest_repo.store(&manifest_record).await?;

    Ok(Json(SealResponseV2 {
        seal_id,
        seal_data: BASE64.encode(&seal.to_cbor()?),
        timestamp: seal.capture_timestamp_utc,
        has_device_attestation: device_attestation.is_some(),
        sealed_image: BASE64.encode(&embed_result.sealed_image),
        perceptual_hash: embed_result.perceptual_hash.bits,
        manifest_size: embed_result.manifest_size,
    }))
}

/// Endpoint de résolution soft binding
pub async fn resolve_manifest(
    State(state): State<AppState>,
    Json(request): Json<ResolveRequest>,
) -> Result<Json<ResolveResponse>, ApiError> {
    let record = match request.method {
        ResolveMethod::PerceptualHash => {
            state.manifest_repo
                .resolve_by_phash(&request.identifier, request.threshold.unwrap_or(10))
                .await?
        }
        ResolveMethod::SealId => {
            state.manifest_repo
                .resolve_by_seal_id(&request.identifier)
                .await?
        }
    };

    match record {
        Some(r) => Ok(Json(ResolveResponse {
            found: true,
            manifest: Some(BASE64.encode(&r.manifest_cbor)),
            seal_id: Some(r.seal_id),
        })),
        None => Ok(Json(ResolveResponse {
            found: false,
            manifest: None,
            seal_id: None,
        })),
    }
}
```

### 4.7 Frontend - Téléchargement Image Scellée

```typescript
// www/components/CameraCapture.tsx (modifié)

interface SealResponseV2 {
  seal_id: string;
  seal_data: string;
  timestamp: number;
  has_device_attestation: boolean;
  sealed_image: string;  // Base64 de l'image avec manifest
  perceptual_hash: string;
  manifest_size: number;
}

const captureAndSeal = useCallback(async () => {
  // ... code existant ...

  const response = await fetch(`${API_URL}/seal/v2`, {
    method: "POST",
    body: formData,
    signal: controller.signal,
  });

  const data: SealResponseV2 = await response.json();

  // Créer l'URL de l'image scellée (avec manifest intégré)
  const sealedImageBlob = base64ToBlob(data.sealed_image, 'image/jpeg');
  const sealedImageUrl = URL.createObjectURL(sealedImageBlob);
  setCapturedImageUrl(sealedImageUrl);

  // Afficher les infos du manifest
  console.log(`Manifest size: ${data.manifest_size} bytes`);
  console.log(`Perceptual hash: ${data.perceptual_hash}`);

  setSealData(data);
  setState("success");
  stopCamera();
}, [/* deps */]);

// Helper pour convertir base64 en Blob
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays, { type: mimeType });
}
```

---

## 5. Phases de Développement

### Phase 1: Fondations C2PA ✅ COMPLÈTE

```
┌─────────────────────────────────────────────────────────────┐
│                        PHASE 1                              │
│                    Fondations C2PA                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Semaine 1:                                                 │
│  ✅ Ajouter dépendance c2pa = "0.45" à veritas-core        │
│  ✅ Créer module veritas-core/src/c2pa/mod.rs              │
│  ✅ Implémenter ManifestConfig et assertions de base       │
│  ✅ Tests unitaires pour la construction de manifest        │
│                                                             │
│  Semaine 2:                                                 │
│  ✅ Implémenter VeritasManifestBuilder                     │
│  ✅ Ajouter les assertions Veritas personnalisées          │
│  ✅ Intégrer avec VeritasSeal existant                     │
│  ✅ Tests d'intégration manifest + seal                    │
│                                                             │
│  Semaine 3:                                                 │
│  ✅ Implémenter ManifestEmbedder (via handlers/c2pa.rs)    │
│  □ Tests d'intégration complets avec c2patool              │
│  □ Documentation du module C2PA                            │
│                                                             │
│  Configuration Render:                                      │
│  ✅ Certificats ECDSA P-256 générés (keys/)                │
│  ✅ Script generate-test-cert.sh créé                      │
│  ✅ Support Secret Files (/etc/secrets/)                   │
│                                                             │
│  Livrables:                                                 │
│  ✅ Module C2PA fonctionnel                                │
│  ✅ Manifest Veritas intégrable dans JPEG                  │
│  □ Validation par c2patool (à tester sur Render)           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2: Soft Binding ✅ COMPLÈTE

```
┌─────────────────────────────────────────────────────────────┐
│                        PHASE 2                              │
│                      Soft Binding                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Semaine 4:                                                 │
│  ✅ Ajouter dépendance image_hasher (déjà présente)        │
│  ✅ Créer module veritas-core/src/watermark/               │
│  ✅ Implémenter PerceptualHasher                           │
│  ✅ Tests de similarité d'images                           │
│                                                             │
│  Semaine 5:                                                 │
│  ✅ Intégrer pHash dans le workflow de scellement          │
│  ✅ Ajouter l'assertion soft binding au manifest           │
│  ✅ Tests de résistance (crop, resize, compression)        │
│                                                             │
│  API étendue:                                               │
│  ✅ POST /seal retourne perceptual_hash (hex)              │
│  ✅ 15 tests de robustesse passent                         │
│                                                             │
│  Livrables:                                                 │
│  ✅ Hash perceptuel calculé pour chaque image              │
│  ✅ Assertion soft binding dans le manifest                │
│  ✅ Tests de robustesse du pHash                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3: Manifest Repository (1-2 semaines)

```
┌─────────────────────────────────────────────────────────────┐
│                        PHASE 3                              │
│                   Manifest Repository                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Semaine 6:                                                 │
│  □ Créer module veritas-server/src/manifest_store/         │
│  □ Implémenter ManifestRepository (PostgreSQL)             │
│  □ Migrations de base de données                           │
│  □ Tests unitaires du repository                           │
│                                                             │
│  Semaine 7:                                                 │
│  □ Implémenter résolution par pHash                        │
│  □ Ajouter endpoint /api/resolve                           │
│  □ Tests d'intégration API                                 │
│  □ Documentation API OpenAPI                               │
│                                                             │
│  Livrables:                                                 │
│  ✓ Stockage durable des manifests                          │
│  ✓ Résolution par hash perceptuel                          │
│  ✓ API de résolution documentée                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 4: Intégration Frontend (1 semaine)

```
┌─────────────────────────────────────────────────────────────┐
│                        PHASE 4                              │
│                  Intégration Frontend                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Semaine 8:                                                 │
│  □ Modifier /seal pour retourner l'image avec manifest     │
│  □ Mettre à jour CameraCapture.tsx                         │
│  □ Téléchargement de l'image scellée (avec manifest)       │
│  □ Affichage des infos du manifest                         │
│  □ Tests E2E sur iOS Safari                                │
│                                                             │
│  Livrables:                                                 │
│  ✓ Image téléchargée contient le manifest C2PA             │
│  ✓ Vérifiable par Adobe/Microsoft                          │
│  ✓ UX fluide sur mobile                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 5: Vérification & Polish (1-2 semaines)

```
┌─────────────────────────────────────────────────────────────┐
│                        PHASE 5                              │
│                  Vérification & Polish                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Semaine 9-10:                                              │
│  □ Améliorer le composant Verifier                         │
│  □ Extraction et affichage du manifest C2PA                │
│  □ Résolution soft binding (image sans métadonnées)        │
│  □ Badge visuel optionnel (watermark visible)              │
│  □ Tests de charge et performance                          │
│  □ Documentation utilisateur                               │
│                                                             │
│  Livrables:                                                 │
│  ✓ Vérification complète dans l'app                        │
│  ✓ Résolution soft binding fonctionnelle                   │
│  ✓ Documentation complète                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Robustesse et Sécurité

### 6.1 Gestion des Erreurs

```rust
// veritas-core/src/c2pa/error.rs

use thiserror::Error;

#[derive(Error, Debug)]
pub enum C2paError {
    #[error("Failed to build manifest: {0}")]
    ManifestBuildError(String),

    #[error("Failed to embed manifest: {0}")]
    EmbedError(String),

    #[error("Invalid image format: {0}")]
    InvalidImageFormat(String),

    #[error("Signing failed: {0}")]
    SigningError(String),

    #[error("Certificate error: {0}")]
    CertificateError(String),

    #[error("C2PA library error: {0}")]
    LibraryError(#[from] c2pa::Error),
}

#[derive(Error, Debug)]
pub enum VerifyError {
    #[error("No C2PA manifest found in image")]
    NoManifest,

    #[error("Manifest signature invalid")]
    InvalidSignature,

    #[error("Hash binding verification failed")]
    HashMismatch,

    #[error("Expired certificate")]
    ExpiredCertificate,

    #[error("Untrusted signer")]
    UntrustedSigner,
}
```

### 6.2 Fallback Strategy

```rust
// Stratégie de fallback pour la robustesse

pub async fn embed_with_fallback(
    seal: &VeritasSeal,
    image_data: &[u8],
    config: &EmbedConfig,
) -> Result<EmbedResult, EmbedError> {
    // Tentative 1: Embed complet avec C2PA
    match embed_c2pa(seal, image_data, config).await {
        Ok(result) => return Ok(result),
        Err(e) => {
            tracing::warn!("C2PA embed failed: {}, trying fallback", e);
        }
    }

    // Tentative 2: Embed dans EXIF/XMP seulement
    match embed_exif_xmp(seal, image_data, config).await {
        Ok(result) => return Ok(result),
        Err(e) => {
            tracing::warn!("EXIF/XMP embed failed: {}, using sidecar", e);
        }
    }

    // Tentative 3: Sidecar file (JSON à côté de l'image)
    let sidecar = create_sidecar(seal)?;
    Ok(EmbedResult {
        sealed_image: image_data.to_vec(),
        sidecar: Some(sidecar),
        method: EmbedMethod::Sidecar,
        ..Default::default()
    })
}
```

### 6.3 Validation des Entrées

```rust
// Validation stricte des entrées

pub fn validate_image(data: &[u8]) -> Result<ImageInfo, ValidationError> {
    // Vérifier la taille
    if data.len() < 100 {
        return Err(ValidationError::TooSmall);
    }
    if data.len() > MAX_IMAGE_SIZE {
        return Err(ValidationError::TooLarge);
    }

    // Vérifier le magic number
    let format = detect_format(data)?;
    if !SUPPORTED_FORMATS.contains(&format) {
        return Err(ValidationError::UnsupportedFormat(format));
    }

    // Vérifier l'intégrité de l'image
    let image = image::load_from_memory(data)
        .map_err(|e| ValidationError::CorruptImage(e.to_string()))?;

    // Vérifier les dimensions
    if image.width() < MIN_DIMENSION || image.height() < MIN_DIMENSION {
        return Err(ValidationError::TooSmallDimensions);
    }

    Ok(ImageInfo {
        format,
        width: image.width(),
        height: image.height(),
        size: data.len(),
    })
}
```

### 6.4 Sécurité des Clés

```rust
// Gestion sécurisée des clés de signature

use zeroize::Zeroizing;

/// Configuration sécurisée des clés
pub struct SecureSigningConfig {
    /// Clé privée (zéroïsée automatiquement)
    signing_key: Zeroizing<Vec<u8>>,
    /// Certificat public
    signing_cert: Vec<u8>,
    /// Chaîne de certificats
    cert_chain: Vec<Vec<u8>>,
}

impl SecureSigningConfig {
    /// Charge les clés depuis des variables d'environnement ou HSM
    pub fn from_env() -> Result<Self, ConfigError> {
        let signing_key = Zeroizing::new(
            std::env::var("C2PA_SIGNING_KEY")
                .map(|s| base64::decode(s).unwrap())
                .or_else(|_| Self::load_from_file("keys/signing.key"))?
        );

        let signing_cert = std::env::var("C2PA_SIGNING_CERT")
            .map(|s| base64::decode(s).unwrap())
            .or_else(|_| Self::load_from_file("keys/signing.crt"))?;

        Ok(Self {
            signing_key,
            signing_cert,
            cert_chain: vec![],
        })
    }

    /// Charge depuis un HSM (production)
    #[cfg(feature = "hsm")]
    pub async fn from_hsm(config: &HsmConfig) -> Result<Self, HsmError> {
        // Implémentation HSM
        todo!()
    }
}
```

### 6.5 Rate Limiting et Protection DDoS

```rust
// Protection contre les abus

use tower::limit::{RateLimitLayer, ConcurrencyLimitLayer};

pub fn create_protected_router(state: AppState) -> Router {
    let seal_limiter = RateLimitLayer::new(
        10,  // 10 requêtes
        std::time::Duration::from_secs(60),  // par minute
    );

    let verify_limiter = RateLimitLayer::new(
        100,  // 100 requêtes
        std::time::Duration::from_secs(60),  // par minute
    );

    Router::new()
        .route("/seal/v2", post(seal_v2).layer(seal_limiter))
        .route("/verify", post(verify).layer(verify_limiter))
        .route("/resolve", post(resolve_manifest))
        .layer(ConcurrencyLimitLayer::new(100))  // Max 100 requêtes simultanées
        .with_state(state)
}
```

---

## 7. Tests et Validation

### 7.1 Tests Unitaires

```rust
// veritas-core/src/c2pa/tests.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manifest_builder_creates_valid_json() {
        let config = ManifestConfig::default();
        let builder = VeritasManifestBuilder::new(config);
        let seal = create_test_seal();

        let manifest = builder.build_manifest(&seal).unwrap();

        // Vérifier que le JSON est valide
        assert!(manifest.assertions().len() >= 3);
        assert!(manifest.claim_generator().contains("Veritas-Q"));
    }

    #[test]
    fn test_perceptual_hash_consistency() {
        let hasher = PerceptualHasher::new(PerceptualHashConfig::default());
        let image = load_test_image();

        let hash1 = hasher.hash(&image);
        let hash2 = hasher.hash(&image);

        assert_eq!(hash1.bits, hash2.bits);
    }

    #[test]
    fn test_perceptual_hash_similarity() {
        let hasher = PerceptualHasher::new(PerceptualHashConfig::default());
        let original = load_test_image();
        let compressed = compress_image(&original, 50);  // 50% quality

        let distance = hasher.compare(&original, &compressed);

        // Les images compressées doivent rester similaires
        assert!(distance < 15, "Distance too high: {}", distance);
    }

    #[tokio::test]
    async fn test_embed_creates_valid_c2pa() {
        let embedder = ManifestEmbedder::new(test_config());
        let seal = create_test_seal();
        let image_data = include_bytes!("../tests/fixtures/test.jpg");

        let result = embedder.embed(&seal, image_data, "image/jpeg").await.unwrap();

        // Vérifier avec c2patool
        let validation = validate_with_c2patool(&result.sealed_image);
        assert!(validation.is_valid);
    }
}
```

### 7.2 Tests d'Intégration

```rust
// veritas-server/tests/integration.rs

#[tokio::test]
async fn test_seal_v2_returns_embedded_image() {
    let app = create_test_app().await;
    let client = reqwest::Client::new();

    let form = multipart::Form::new()
        .file("file", "tests/fixtures/test.jpg").await.unwrap()
        .text("media_type", "image");

    let response = client
        .post(&format!("{}/seal/v2", app.address()))
        .multipart(form)
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 200);

    let data: SealResponseV2 = response.json().await.unwrap();

    // Vérifier que l'image contient un manifest
    let sealed_image = base64::decode(&data.sealed_image).unwrap();
    let reader = c2pa::Reader::from_stream("image/jpeg", &sealed_image[..]).unwrap();
    assert!(reader.active_manifest().is_some());
}

#[tokio::test]
async fn test_resolve_by_phash() {
    let app = create_test_app().await;

    // 1. Sceller une image
    let seal_response = seal_test_image(&app).await;

    // 2. Résoudre par pHash
    let resolve_response = app.resolve(ResolveRequest {
        method: ResolveMethod::PerceptualHash,
        identifier: seal_response.perceptual_hash,
        threshold: Some(10),
    }).await;

    assert!(resolve_response.found);
    assert_eq!(resolve_response.seal_id.unwrap(), seal_response.seal_id);
}
```

### 7.3 Tests E2E

```typescript
// www/__tests__/seal.e2e.test.ts

import { test, expect } from '@playwright/test';

test('capture and seal image on iOS Safari', async ({ page }) => {
  // Simuler iOS Safari
  await page.goto('/');

  // Mock camera
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      return new MediaStream([createMockVideoTrack()]);
    };
  });

  // Démarrer la caméra
  await page.click('text=Démarrer la caméra');
  await page.waitForSelector('text=Prêt à capturer');

  // Capturer et sceller
  await page.click('text=SCELLER');
  await page.waitForSelector('text=Scellé !');

  // Vérifier les données
  const sealId = await page.textContent('[data-testid="seal-id"]');
  expect(sealId).toMatch(/^[a-f0-9-]{36}$/);

  // Télécharger l'image
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('text=Télécharger'),
  ]);

  const path = await download.path();
  expect(path).toBeTruthy();

  // Vérifier le manifest C2PA dans l'image téléchargée
  const imageData = fs.readFileSync(path);
  const manifest = await extractC2paManifest(imageData);
  expect(manifest).not.toBeNull();
  expect(manifest.assertions).toContainEqual(
    expect.objectContaining({ label: 'veritas.quantum_entropy' })
  );
});
```

### 7.4 Validation c2patool

```bash
#!/bin/bash
# scripts/validate-c2pa.sh

set -e

IMAGE=$1

if [ -z "$IMAGE" ]; then
    echo "Usage: ./validate-c2pa.sh <image_path>"
    exit 1
fi

echo "=== Validating C2PA manifest in $IMAGE ==="

# Vérifier que c2patool est installé
if ! command -v c2patool &> /dev/null; then
    echo "Installing c2patool..."
    cargo install c2patool
fi

# Extraire et afficher le manifest
echo ""
echo "=== Manifest Content ==="
c2patool "$IMAGE" --detailed

# Vérifier la validité
echo ""
echo "=== Validation ==="
if c2patool "$IMAGE" --verify; then
    echo "✅ C2PA manifest is VALID"
else
    echo "❌ C2PA manifest is INVALID"
    exit 1
fi

# Vérifier les assertions Veritas
echo ""
echo "=== Veritas Assertions ==="
c2patool "$IMAGE" --detailed | grep -E "veritas\." || echo "No Veritas assertions found"
```

---

## 8. Sources et Références

### 8.1 Spécifications Officielles

| Document | URL |
|----------|-----|
| C2PA Technical Specification 2.2 | [spec.c2pa.org](https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html) |
| C2PA Explainer 2.2 | [PDF](https://spec.c2pa.org/specifications/specifications/2.2/explainer/_attachments/Explainer.pdf) |
| FIPS 204 (ML-DSA) | [NIST](https://csrc.nist.gov/pubs/fips/204/final) |
| JUMBF (ISO 19566-5) | ISO Standard |

### 8.2 SDK et Outils

| Outil | URL | Usage |
|-------|-----|-------|
| c2pa-rs | [GitHub](https://github.com/contentauth/c2pa-rs) | SDK Rust officiel |
| c2patool | [GitHub](https://github.com/contentauth/c2pa-rs/tree/main/cli) | CLI validation |
| image_hasher | [crates.io](https://crates.io/crates/image_hasher) | Perceptual hashing |
| CAI Open Source | [Site](https://opensource.contentauthenticity.org/) | Documentation |

### 8.3 Articles et Guides

| Article | Source |
|---------|--------|
| C2PA 2.1 Digital Watermarks | [Digimarc](https://www.digimarc.com/blog/c2pa-21-strengthening-content-credentials-digital-watermarks) |
| How to Inject JUMBF Metadata | [Medium](https://medium.com/numbers-protocol/cai-series-1-how-to-inject-jumbf-metadata-into-jpg-c76826f10e6d) |
| Using TrustMark with C2PA | [CAI](https://opensource.contentauthenticity.org/docs/trustmark/c2pa/) |
| Content Credentials Foundations | [CAI Blog](https://contentauthenticity.org/blog/introducing-content-credentials-foundations-a-course-for-implementers) |

### 8.4 Conformité et Trust List

| Programme | URL | Notes |
|-----------|-----|-------|
| C2PA Conformance | [c2pa.org](https://c2pa.org/conformance/) | Programme de conformité |
| Trust List | C2PA GitHub | Liste des certificats de confiance |
| CAWG (Identity) | [DIF](https://cawg.io/) | Assertions d'identité |

---

## Annexe A: Checklist de Lancement

### Pré-Production

- [ ] Tests unitaires passent (>90% couverture)
- [ ] Tests d'intégration passent
- [ ] Tests E2E sur iOS Safari passent
- [ ] Validation c2patool réussie
- [ ] Audit de sécurité des clés
- [ ] Performance <500ms pour embed
- [ ] Documentation API complète

### Production

- [ ] Certificat de signature configuré
- [ ] Manifest repository initialisé
- [ ] Monitoring des erreurs C2PA
- [ ] Alerting sur échecs de signature
- [ ] Backup des clés
- [ ] Plan de rotation des clés

### Post-Production

- [ ] Soumission au programme C2PA
- [ ] Tests d'interopérabilité Adobe/Microsoft
- [ ] Documentation utilisateur
- [ ] Support technique formé

---

## Annexe B: Migration depuis V1

Pour les utilisateurs existants avec des images scellées en V1 (sans manifest C2PA):

```rust
/// Migre un seal V1 vers V2 avec manifest C2PA
pub async fn migrate_v1_to_v2(
    seal_v1: &VeritasSeal,
    original_image: &[u8],
) -> Result<MigrationResult, MigrationError> {
    // Le seal V1 reste valide (signature ML-DSA)
    // On ajoute simplement le manifest C2PA par-dessus

    let embedder = ManifestEmbedder::new(config);
    let result = embedder.embed(seal_v1, original_image, "image/jpeg").await?;

    Ok(MigrationResult {
        migrated_image: result.sealed_image,
        original_seal_preserved: true,
        c2pa_manifest_added: true,
    })
}
```

---

*Ce plan a été généré par Claude Code (Anthropic) basé sur les meilleures pratiques et standards actuels (janvier 2026).*
