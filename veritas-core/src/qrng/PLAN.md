# Plan d'amélioration du module QRNG

## Contexte

Le fichier `anu.rs` implémente un client pour l'API QRNG de l'Australian National University. Le code est fonctionnel mais nécessite des améliorations pour la production.

## Améliorations planifiées

### Phase 1 : Sécurité et robustesse (Priorité haute) ✅ TERMINÉE

#### 1.1 Retry avec backoff exponentiel
- [x] Ajouter la dépendance `backoff` dans `Cargo.toml`
- [x] Implémenter retry automatique sur erreurs transitoires :
  - Timeouts
  - HTTP 429 (Too Many Requests)
  - HTTP 503 (Service Unavailable)
  - Erreurs de connexion
- [x] Configurer : max 3 retries, backoff initial 100ms, max 2s

#### 1.2 TLS 1.3 et certificate pinning
- [x] Forcer TLS 1.3 minimum via `min_tls_version()`
- [x] Activer `https_only(true)`
- [ ] Implémenter certificate pinning pour l'API ANU (optionnel pour dev)

### Phase 2 : Configuration et flexibilité (Priorité moyenne) ✅ TERMINÉE

#### 2.1 URL configurable
- [x] Ajouter paramètre `api_url` au constructeur (`AnuQrngConfig`)
- [x] Support variable d'environnement `ANU_QRNG_URL`
- [x] Garder l'URL par défaut comme fallback

#### 2.2 Corriger l'implémentation Default
- [x] Supprimer `impl Default` qui peut paniquer (remplacé par `AnuQrngConfig::default()`)

#### 2.3 Nettoyage du struct
- [x] Restructurer avec `AnuQrngConfig` pour une meilleure organisation

### Phase 3 : Observabilité (Priorité basse) ✅ TERMINÉE

#### 3.1 Tracing et métriques
- [x] Ajouter `#[instrument]` sur `get_entropy()`, `new()`, `with_config()`
- [x] Logger les latences de requête (`latency_ms`, `total_latency_ms`)
- [x] Émettre des événements : succès/échecs, temps de réponse, retries
- [x] Utiliser `retry_notify` pour logger chaque tentative de retry

#### 3.2 Optimisations mineures
- [x] Simplifier `hex_to_bytes()` avec `try_into()` (fait en Phase 1)
- [ ] Ajouter tests d'intégration avec mock server (wiremock) - optionnel

### Phase 4 : Évolution future ✅ TERMINÉE

#### 4.1 QRNG Open API Framework
- [x] Évaluer l'adoption du framework QRNG Open API (Palo Alto, 2025)
- [x] Créer un trait abstrait pour multi-vendor QRNG (`QuantumEntropySource`)
- [x] Faciliter l'intégration ID Quantique (`IdQuantiqueQrng`)
- [x] Ajouter `QrngProviderFactory` pour instanciation simplifiée
- [x] Implémenter `QrngCapabilities` et `QrngHealthStatus` (QRNG Open API)

## Fichiers impactés

| Fichier | Modifications |
|---------|---------------|
| `veritas-core/Cargo.toml` | Ajout `backoff`, `tracing`, `base64` |
| `veritas-core/src/qrng/anu.rs` | Retry, TLS 1.3, tracing, config flexible |
| `veritas-core/src/qrng/mod.rs` | Documentation, exports multi-vendor |
| `veritas-core/src/qrng/provider.rs` | **NOUVEAU** - Factory, ID Quantique, QRNG Open API |
| `veritas-core/examples/anu_tracing.rs` | **NOUVEAU** - Exemple tracing |

## Critères de validation

- [x] Tous les tests existants passent (33 tests + 4 doc tests)
- [x] Nouveaux tests pour retry logic et provider factory
- [x] `cargo clippy` sans warnings
- [x] Documentation mise à jour (module docs, exemples)

## Références

- [reqwest-retry](https://docs.rs/reqwest-retry)
- [backoff crate](https://docs.rs/backoff)
- [QRNG Open API Framework](https://www.paloaltonetworks.com/company/press/2025/palo-alto-networks-prepares-organizations-for-quantum-security-with-qrng-open-api)
- [Quside Rust integration](https://quside.com/qusides-qrng-integration-with-rust/)
