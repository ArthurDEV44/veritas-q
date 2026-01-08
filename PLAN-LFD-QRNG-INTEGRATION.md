# Plan d'Intégration LfD QRNG

> **Version**: 1.0
> **Date**: 2026-01-08
> **Statut**: En attente d'implémentation
> **Priorité**: Haute (ANU QRNG hors service)

---

## Contexte

L'API ANU QRNG (Australian National University) a son certificat SSL expiré et le service est en cours de migration vers AWS (payant). Le système Veritas Q tombe actuellement en fallback sur `MockQrng` (entropie pseudo-aléatoire, **non quantique**).

### Source de remplacement sélectionnée

**LfD QRNG** (Leibniz-Forschungszentrum Dresden / Humboldt University Berlin)

| Critère | Valeur |
|---------|--------|
| URL | `https://lfdr.de/qrng_api/qrng` |
| Localisation | Allemagne (Europe) |
| Hardware | ID Quantique QRNG PCIe |
| Coût | **Gratuit** |
| Latence testée | ~130ms |
| Format réponse | `{"qrn": "hex...", "length": N}` |

---

## Architecture actuelle

```
veritas-core/src/qrng/
├── mod.rs          # Trait QuantumEntropySource, enum QrngSource
├── anu.rs          # AnuQrng (OBSOLÈTE - SSL expiré)
├── mock.rs         # MockQrng (fallback, non quantique)
└── provider.rs     # QrngProviderFactory, IdQuantiqueQrng
```

### Flux actuel (défaillant)

```
seal.rs → AnuQrng::new() → ÉCHEC (SSL) → MockQrng (fallback)
```

### Flux cible

```
seal.rs → LfdQrng::new() → SUCCÈS → Vraie entropie quantique
                        └→ ÉCHEC → MockQrng (fallback)
```

---

## Tâches d'implémentation

### Phase 1: Module LfD QRNG

#### 1.1 Créer `veritas-core/src/qrng/lfd.rs`

```rust
// Structure attendue
pub struct LfdQrngConfig {
    pub api_url: String,      // Default: "https://lfdr.de/qrng_api/qrng"
    pub timeout: Duration,    // Default: 5s
    pub max_retries: u32,     // Default: 2
}

pub struct LfdQrng {
    client: Client,
    config: LfdQrngConfig,
}

// Réponse API LfD
struct LfdResponse {
    qrn: String,    // Hex-encoded random bytes
    length: u32,    // Number of bytes
}
```

**Particularités de l'API LfD:**
- Méthode: `GET`
- Paramètres: `?length=32&format=HEX`
- Réponse: JSON `{"qrn": "...", "length": 32}`
- Pas d'authentification requise

#### 1.2 Modifier `veritas-core/src/qrng/mod.rs`

Ajouter à l'enum `QrngSource`:

```rust
pub enum QrngSource {
    IdQuantiqueCloud,
    AnuCloud,           // Garder pour compatibilité
    LfdCloud,           // NOUVEAU
    DeviceHardware { device_id: String },
    Mock,
}

impl std::fmt::Display for QrngSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            // ...
            Self::LfdCloud => write!(f, "LfD QRNG (Germany)"),
            // ...
        }
    }
}
```

Ajouter les exports:

```rust
mod lfd;
pub use lfd::{LfdQrng, LfdQrngConfig};
```

#### 1.3 Modifier `veritas-core/src/qrng/provider.rs`

Ajouter la configuration LfD:

```rust
pub enum QrngProviderConfig {
    Anu(AnuQrngConfig),
    Lfd(LfdQrngConfig),     // NOUVEAU
    IdQuantique(IdQuantiqueConfig),
    Mock { seed: u64 },
    Auto,
}
```

Modifier `create_auto()`:

```rust
fn create_auto() -> Result<Arc<dyn QuantumEntropySource>> {
    // 1. ID Quantique (production, si API key configurée)
    if let Ok(idq_config) = IdQuantiqueConfig::from_env() {
        tracing::info!("Auto-selected ID Quantique QRNG provider");
        return Self::create(QrngProviderConfig::IdQuantique(idq_config));
    }

    // 2. LfD QRNG (Europe, gratuit) - NOUVEAU DÉFAUT
    tracing::info!("Auto-selected LfD QRNG provider (Germany)");
    Self::create(QrngProviderConfig::Lfd(LfdQrngConfig::default()))
}
```

---

### Phase 2: Mise à jour des handlers

#### 2.1 Modifier `veritas-server/src/handlers/seal.rs`

Remplacer (lignes 192-217):

```rust
// AVANT
match AnuQrng::new() { ... }

// APRÈS
match LfdQrng::new() {
    Ok(qrng) => {
        match SealBuilder::new(content.clone(), media_type)
            .build_secure(&qrng, &secret_key, &public_key)
            .await
        {
            Ok(seal) => seal,
            Err(e) => {
                tracing::warn!("LfD QRNG failed: {}, falling back to mock entropy", e);
                let mock_qrng = MockQrng::default();
                SealBuilder::new(content, media_type)
                    .build_secure(&mock_qrng, &secret_key, &public_key)
                    .await?
            }
        }
    }
    Err(e) => {
        tracing::warn!("LfD QRNG client creation failed: {}, using mock entropy", e);
        let mock_qrng = MockQrng::default();
        SealBuilder::new(content, media_type)
            .build_secure(&mock_qrng, &secret_key, &public_key)
            .await?
    }
}
```

#### 2.2 Modifier `veritas-server/src/handlers/c2pa.rs`

Appliquer les mêmes changements (lignes 182-210).

#### 2.3 Mettre à jour les imports

```rust
// AVANT
use veritas_core::{AnuQrng, MockQrng, ...};

// APRÈS
use veritas_core::{LfdQrng, MockQrng, ...};
```

---

### Phase 3: Tests

#### 3.1 Tests unitaires (`veritas-core/src/qrng/lfd.rs`)

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_hex_to_bytes_valid() { ... }

    #[test]
    fn test_default_config() {
        let config = LfdQrngConfig::default();
        assert_eq!(config.api_url, "https://lfdr.de/qrng_api/qrng");
    }

    #[test]
    fn test_source_id() {
        let qrng = LfdQrng::new().unwrap();
        assert_eq!(qrng.source_id(), QrngSource::LfdCloud);
    }

    #[tokio::test]
    #[ignore = "requires network access"]
    async fn test_lfd_real_api() {
        let qrng = LfdQrng::new().unwrap();
        let entropy = qrng.get_entropy().await.unwrap();
        assert_eq!(entropy.len(), 32);
    }
}
```

#### 3.2 Test d'intégration

```bash
# Vérifier que le seal utilise LfD
cargo test -p veritas-server test_seal_with_real_qrng -- --ignored

# Vérifier le manifest C2PA
c2patool image.jpg | grep -i "qrng_source"
# Attendu: "qrng_source": "LFD"
```

---

### Phase 4: Configuration et documentation

#### 4.1 Variables d'environnement (`.env.example`)

```bash
# LfD QRNG Configuration (default, no auth required)
# LFD_QRNG_URL=https://lfdr.de/qrng_api/qrng

# Override timeout (default: 5s)
# LFD_QRNG_TIMEOUT_MS=5000
```

#### 4.2 Mise à jour `CLAUDE.md`

```markdown
### Mock QRNG for Testing

- `MockQrng` - Deterministic mock for unit tests (not quantum-safe)
- `LfdQrng` - LfD Germany QRNG API (development/production, free)
- `AnuQrng` - DEPRECATED (SSL certificate expired)
- ID Quantique API - Production QRNG (requires `QRNG_API_KEY`)
```

#### 4.3 Mise à jour `PLAN-SEAL-INTEGRATION.md`

Ajouter section "QRNG Migration":

```markdown
### Migration QRNG (2026-01-08)

- ANU QRNG désactivé (certificat SSL expiré)
- LfD QRNG activé comme source par défaut
- ID Quantique reste l'option production (si API key configurée)
```

---

## Ordre d'exécution recommandé

| Étape | Fichier | Action |
|-------|---------|--------|
| 1 | `qrng/lfd.rs` | Créer nouveau module |
| 2 | `qrng/mod.rs` | Ajouter `LfdCloud` à enum + exports |
| 3 | `qrng/provider.rs` | Ajouter config LfD + modifier auto-select |
| 4 | `handlers/seal.rs` | Remplacer AnuQrng par LfdQrng |
| 5 | `handlers/c2pa.rs` | Remplacer AnuQrng par LfdQrng |
| 6 | Tests | Exécuter `cargo test --workspace` |
| 7 | `.env.example` | Documenter variables LfD |
| 8 | `CLAUDE.md` | Mettre à jour documentation |

---

## Validation finale

### Checklist

- [ ] `cargo build --workspace` passe
- [ ] `cargo test --workspace` passe (154+ tests)
- [ ] `cargo clippy --workspace -- -D warnings` passe
- [ ] Test manuel: capture photo → seal → télécharger → c2patool verify
- [ ] Vérifier `qrng_source: "LFD"` dans le manifest C2PA
- [ ] Vérifier latence < 200ms pour l'appel QRNG

### Commande de test rapide

```bash
# Test connexion LfD
curl -s "https://lfdr.de/qrng_api/qrng?length=32&format=HEX" | jq .

# Build et test
cargo build --workspace && cargo test --workspace
```

---

## Risques et mitigations

| Risque | Probabilité | Mitigation |
|--------|-------------|------------|
| LfD API indisponible | Faible | Fallback MockQrng automatique |
| Latence > 200ms | Moyenne | Timeout configurable, retry |
| Service académique non garanti | Moyenne | Documenter alternatives (ANU AWS) |

---

## Références

- [LfD QRNG Documentation](https://lfdr.de/QRNG/)
- [ANU Quantum Numbers (AWS)](https://quantumnumbers.anu.edu.au/documentation)
- [QRNG Open API Framework](https://github.com/PaloAltoNetworks/QRNG-OPENAPI)
