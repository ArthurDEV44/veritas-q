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

### Phase 3 : Observabilité (Priorité basse)

#### 3.1 Tracing et métriques
- [ ] Ajouter `#[instrument]` sur `get_entropy()`
- [ ] Logger les latences de requête
- [ ] Émettre des métriques : succès/échecs, temps de réponse

#### 3.2 Optimisations mineures
- [ ] Simplifier `hex_to_bytes()` avec `try_into()`
- [ ] Ajouter tests d'intégration avec mock server (wiremock)

### Phase 4 : Évolution future

#### 4.1 QRNG Open API Framework
- [ ] Évaluer l'adoption du framework QRNG Open API (Palo Alto, 2025)
- [ ] Créer un trait abstrait pour multi-vendor QRNG
- [ ] Faciliter l'intégration ID Quantique

## Fichiers impactés

| Fichier | Modifications |
|---------|---------------|
| `veritas-core/Cargo.toml` | Ajouter `backoff`, `tracing` |
| `veritas-core/src/qrng/anu.rs` | Refactoring principal |
| `veritas-core/src/qrng/mod.rs` | Éventuels nouveaux exports |
| `veritas-core/src/error.rs` | Nouveaux variants d'erreur si nécessaire |

## Critères de validation

- [ ] Tous les tests existants passent
- [ ] Nouveaux tests pour retry logic
- [ ] `cargo clippy` sans warnings
- [ ] Latence moyenne < 100ms (hors réseau)
- [ ] Documentation mise à jour

## Références

- [reqwest-retry](https://docs.rs/reqwest-retry)
- [backoff crate](https://docs.rs/backoff)
- [QRNG Open API Framework](https://www.paloaltonetworks.com/company/press/2025/palo-alto-networks-prepares-organizations-for-quantum-security-with-qrng-open-api)
- [Quside Rust integration](https://quside.com/qusides-qrng-integration-with-rust/)
