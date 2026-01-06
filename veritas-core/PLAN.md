# Plan d'amélioration veritas-core/src/seal.rs

## Objectif

Renforcer la sécurité, la robustesse et les performances du module de scellement cryptographique selon les meilleures pratiques Rust 2025-2026 et les recommandations FIPS 204.

---

## Phase 1 : Sécurité critique

### 1.1 Zeroization des clés secrètes

**Fichier**: `src/seal.rs`

**Problème**: Les clés secrètes ML-DSA restent en mémoire après utilisation.

**Solution**:
- Ajouter la dépendance `zeroize = "1.8"` dans `Cargo.toml`
- Implémenter `Zeroize` pour les structures contenant des secrets
- Wrapper `SecretKey` dans un type qui implémente `Drop` avec zeroization

```rust
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(ZeroizeOnDrop)]
pub struct SecretKeyWrapper(mldsa65::SecretKey);
```

### 1.2 Protection contre les attaques DoS sur la désérialisation

**Fichier**: `src/seal.rs`, lignes 271-273

**Problème**: `from_cbor()` accepte des entrées de taille arbitraire.

**Solution**:
```rust
const MAX_SEAL_SIZE: usize = 16_384; // ~16KB, largement suffisant pour ML-DSA-65

pub fn from_cbor(bytes: &[u8]) -> Result<Self> {
    if bytes.len() > MAX_SEAL_SIZE {
        return Err(VeritasError::SealTooLarge {
            size: bytes.len(),
            max: MAX_SEAL_SIZE,
        });
    }
    ciborium::from_reader(bytes)
        .map_err(|e| VeritasError::SerializationError(e.to_string()))
}
```

### 1.3 Versioning du format de sceau

**Fichier**: `src/seal.rs`, struct `VeritasSeal`

**Problème**: Aucun mécanisme de versioning pour les évolutions futures.

**Solution**:
```rust
pub struct VeritasSeal {
    /// Version du format (v1 = 1)
    pub version: u8,
    // ... autres champs
}
```

Ajouter une validation à la désérialisation:
```rust
pub fn from_cbor(bytes: &[u8]) -> Result<Self> {
    let seal: Self = /* deserialize */;
    if seal.version > CURRENT_VERSION {
        return Err(VeritasError::UnsupportedSealVersion(seal.version));
    }
    Ok(seal)
}
```

---

## Phase 2 : Robustesse

### 2.1 Gestion sécurisée des timestamps

**Fichier**: `src/seal.rs`, ligne 153

**Problème**: Cast `as u64` peut échouer silencieusement pour des dates avant 1970.

**Solution**:
```rust
let capture_timestamp_utc = u64::try_from(now.timestamp_millis())
    .map_err(|_| VeritasError::InvalidTimestamp {
        reason: "timestamp before Unix epoch".into(),
    })?;
```

### 2.2 Vérification bidirectionnelle du drift temporel

**Fichier**: `src/seal.rs`, lignes 159-166

**Problème**: Ne détecte pas si l'horloge système recule.

**Solution**:
```rust
let drift = if entropy_timestamp >= capture_timestamp_utc {
    entropy_timestamp - capture_timestamp_utc
} else {
    capture_timestamp_utc - entropy_timestamp
};

if drift > MAX_ENTROPY_TIMESTAMP_DRIFT_SECS * 1000 {
    return Err(VeritasError::EntropyTimestampMismatch {
        entropy_ts: entropy_timestamp,
        capture_ts: capture_timestamp_utc,
        drift_ms: drift,
    });
}
```

### 2.3 Distinction erreurs de vérification vs signature invalide

**Fichier**: `src/seal.rs`, lignes 249-259

**Problème**: `Ok(false)` masque la cause réelle de l'échec.

**Solution**:
```rust
pub fn verify(&self) -> Result<VerificationResult> {
    // ...
    match mldsa65::open(&signed_message, &public_key) {
        Ok(verified_message) if verified_message == signable_bytes => {
            Ok(VerificationResult::Valid)
        }
        Ok(_) => Ok(VerificationResult::PayloadMismatch),
        Err(_) => Ok(VerificationResult::InvalidSignature),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VerificationResult {
    Valid,
    InvalidSignature,
    PayloadMismatch,
}
```

---

## Phase 3 : Optimisations

### 3.1 Utiliser des tableaux de taille fixe pour les signatures

**Fichier**: `src/seal.rs`, struct `VeritasSeal`

**Avantage**: Évite les allocations heap, meilleure localité mémoire.

```rust
// Tailles ML-DSA-65 (FIPS 204)
pub const MLDSA65_SIGNATURE_SIZE: usize = 3293;
pub const MLDSA65_PUBLIC_KEY_SIZE: usize = 1952;

pub struct VeritasSeal {
    // ...
    pub signature: [u8; MLDSA65_SIGNATURE_SIZE],
    pub public_key: [u8; MLDSA65_PUBLIC_KEY_SIZE],
    // ...
}
```

### 3.2 Pré-allocation des buffers CBOR

**Fichier**: `src/seal.rs`, lignes 184, 237

**Solution**:
```rust
// Estimation basée sur la taille typique d'un SignablePayload
let mut signable_bytes = Vec::with_capacity(512);
```

### 3.3 Éviter le clone inutile de QrngSource

**Fichier**: `src/seal.rs`, ligne 230

Si `QrngSource` implémente `Copy`:
```rust
qrng_source: self.qrng_source, // au lieu de self.qrng_source.clone()
```

---

## Phase 4 : Tests et fuzzing

### 4.1 Nouveaux tests unitaires

```rust
#[test]
fn test_empty_content() { /* ... */ }

#[test]
fn test_max_size_content() { /* ... */ }

#[test]
fn test_from_cbor_size_limit() { /* ... */ }

#[test]
fn test_malformed_cbor_handling() { /* ... */ }

#[test]
fn test_clock_backward_drift() { /* ... */ }

#[test]
fn test_verification_result_distinction() { /* ... */ }
```

### 4.2 Fuzzing du parser CBOR

Structure de fuzzing avec `cargo-fuzz` :

```
veritas-core/
└── fuzz/
    ├── Cargo.toml
    └── fuzz_targets/
        ├── fuzz_from_cbor.rs   # Fuzzing de VeritasSeal::from_cbor()
        └── fuzz_verify.rs       # Fuzzing de verify() avec seals malformés
```

**Installation et exécution** :

```bash
# Installer cargo-fuzz (une seule fois)
cargo install cargo-fuzz

# Installer le toolchain nightly (requis)
rustup install nightly

# Lancer le fuzzing sur from_cbor (depuis veritas-core/)
cargo +nightly fuzz run fuzz_from_cbor

# Lancer le fuzzing sur verify
cargo +nightly fuzz run fuzz_verify

# Limiter le temps de fuzzing (ex: 60 secondes)
cargo +nightly fuzz run fuzz_from_cbor -- -max_total_time=60

# Voir les cibles disponibles
cargo +nightly fuzz list
```

**Résultats attendus** :
- Le fuzzer explore automatiquement les chemins de code
- Les crashs sont sauvegardés dans `fuzz/artifacts/`
- Le corpus est sauvegardé dans `fuzz/corpus/` pour reprise

**Cibles de fuzzing** :

`fuzz_from_cbor.rs` - Teste la désérialisation CBOR :
```rust
fuzz_target!(|data: &[u8]| {
    let _ = VeritasSeal::from_cbor(data);
});
```

`fuzz_verify.rs` - Teste la vérification avec données arbitraires :
```rust
fuzz_target!(|data: &[u8]| {
    if let Ok(seal) = VeritasSeal::from_cbor(data) {
        let _ = seal.verify();
        let _ = seal.verify_detailed();
    }
});
```

---

## Phase 5 : Améliorations futures (optionnel)

### 5.1 Support hybride ML-DSA + Ed25519

Pour la période de transition post-quantique, permettre des signatures hybrides:

```rust
pub enum SignatureScheme {
    MlDsa65,
    Hybrid { ml_dsa: Vec<u8>, ed25519: Vec<u8> },
}
```

### 5.2 Implémentation du hash perceptuel

Compléter `ContentHash::perceptual_hash` avec une vraie implémentation (pHash, dHash).

### 5.3 Support C2PA natif

Ajouter un module `c2pa.rs` pour l'export/import JUMBF.

---

## Checklist d'implémentation

- [x] Phase 1.1 : Ajouter zeroize (`ZeroizingSecretKey` wrapper)
- [x] Phase 1.2 : Limite taille from_cbor (`MAX_SEAL_SIZE = 16KB`)
- [x] Phase 1.3 : Champ version (`CURRENT_SEAL_VERSION = 1`)
- [x] Phase 2.1 : try_from pour timestamps
- [x] Phase 2.2 : Drift bidirectionnel (`abs_diff`)
- [x] Phase 2.3 : VerificationResult enum + ContentVerificationResult + verify_content()
- [x] Phase 3.1 : Constantes ML-DSA-65 + validation tailles dans from_cbor
- [x] Phase 3.2 : Pré-allocation buffers
- [x] Phase 3.3 : Éviter clone QrngSource (référence dans SignablePayload)
- [x] Phase 4.1 : Nouveaux tests (`test_seal_too_large_rejected`, `test_unsupported_version_rejected`)
- [x] Phase 4.2 : Fuzzing CBOR (`cargo +nightly fuzz run fuzz_from_cbor`)
- [x] Exécuter `cargo clippy --workspace -- -D warnings`
- [x] Exécuter `cargo test --workspace`

---

## Références

- [FIPS 204 - ML-DSA Standard](https://csrc.nist.gov/pubs/fips/204/final)
- [Rust Security Best Practices 2025](https://corgea.com/Learn/rust-security-best-practices-2025)
- [Post-Quantum Cryptography in Rust](https://blog.projecteleven.com/posts/the-state-of-post-quantum-cryptography-in-rust-the-belt-is-vacant)
- [Zeroize crate documentation](https://docs.rs/zeroize/latest/zeroize/)
