# Plan d'amélioration - veritas-server

## Objectif

Rendre le serveur REST API production-ready avec observabilité, robustesse et sécurité renforcées.

---

## Phase 1 : Fondations critiques

### 1.1 Ajouter le tracing/logging structuré

**Fichiers:** `Cargo.toml`, `src/main.rs`

**Dépendances à ajouter:**
```toml
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
tower-http = { version = "0.6", features = ["trace", "request-id", "timeout"] }
```

**Changements:**
- Initialiser `tracing_subscriber` dans `main()`
- Ajouter `TraceLayer::new_for_http()` au router
- Logger les erreurs dans `ApiError::into_response()`

---

### 1.2 Implémenter le graceful shutdown

**Fichier:** `src/main.rs`

**Changements:**
- Créer fonction `shutdown_signal()` avec gestion Ctrl+C et SIGTERM
- Utiliser `axum::serve(...).with_graceful_shutdown()`
- Logger le début et la fin du shutdown

---

### 1.3 Ajouter un timeout global

**Fichier:** `src/main.rs`

**Changements:**
- Ajouter `TimeoutLayer::new(Duration::from_secs(30))` au router
- Protège contre les requêtes QRNG qui bloquent

---

## Phase 2 : Configuration et sécurité

### 2.1 Externaliser la configuration

**Fichier:** `src/main.rs`

**Variables d'environnement:**
- `PORT` (défaut: 3000)
- `HOST` (défaut: 127.0.0.1, ou 0.0.0.0 pour Docker)
- `ALLOWED_ORIGINS` (défaut: http://localhost:3001)
- `BODY_LIMIT_MB` (défaut: 50)
- `REQUEST_TIMEOUT_SECS` (défaut: 30)

---

### 2.2 Restreindre CORS en production

**Fichier:** `src/main.rs`

**Changements:**
- Parser `ALLOWED_ORIGINS` comme liste séparée par virgules
- Limiter `allow_methods` à `[GET, POST]`
- Limiter `allow_headers` à `[CONTENT_TYPE]`

---

### 2.3 Ajouter le rate limiting

**Fichiers:** `Cargo.toml`, `src/main.rs`

**Dépendance:**
```toml
tower-governor = "0.4"
```

**Changements:**
- Configurer rate limit sur `/seal` (2 req/sec, burst 5)
- Rate limit plus permissif sur `/verify` (10 req/sec)

---

## Phase 3 : Amélioration de la qualité

### 3.1 Enrichir la gestion d'erreurs avec thiserror

**Fichiers:** `Cargo.toml`, `src/main.rs`

**Dépendance:**
```toml
thiserror = "2.0"
```

**Changements:**
- Convertir `ApiError` en enum avec `#[derive(Error)]`
- Variants: `BadRequest`, `Timeout`, `Internal`, `Veritas`
- Logger automatiquement les erreurs avec tracing

---

### 3.2 Améliorer le health check

**Fichier:** `src/main.rs`

**Changements:**
- Retourner JSON avec: status, version, qrng_available
- Optionnel: ajouter `/ready` pour Kubernetes

---

### 3.3 Ajouter Request ID tracking

**Fichier:** `src/main.rs`

**Changements:**
- Ajouter `SetRequestIdLayer` et `PropagateRequestIdLayer`
- Inclure le request ID dans les logs d'erreur

---

## Phase 4 : Validation et sécurité avancée

### 4.1 Valider les uploads multipart

**Fichier:** `src/main.rs`

**Changements:**
- Vérifier le Content-Type des fichiers uploadés
- Rejeter les types MIME non supportés
- Ajouter limite de taille par fichier (pas seulement globale)

---

### 4.2 Ajouter des tests pour les nouveaux comportements

**Fichier:** `src/main.rs` (section tests)

**Nouveaux tests:**
- `test_request_timeout`
- `test_rate_limiting`
- `test_cors_headers`
- `test_health_returns_json`

---

## Ordre d'implémentation recommandé

1. [x] Phase 1.1 - Tracing (fondation pour debug)
2. [x] Phase 1.2 - Graceful shutdown
3. [x] Phase 1.3 - Timeout
4. [x] Phase 2.1 - Configuration env
5. [x] Phase 2.2 - CORS restrictif
6. [x] Phase 2.3 - Rate limiting
7. [x] Phase 3.1 - thiserror
8. [x] Phase 3.2 - Health check enrichi
9. [x] Phase 3.3 - Request ID
10. [ ] Phase 4.1 - Validation uploads
11. [ ] Phase 4.2 - Tests additionnels

---

## Dépendances finales à ajouter

```toml
# Cargo.toml additions
thiserror = "2.0"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
tower-governor = "0.4"

# Update tower-http features
tower-http = { version = "0.6", features = ["cors", "limit", "trace", "request-id", "timeout"] }
```

---

## Critères de succès

- [x] Logs structurés visibles au démarrage et sur chaque requête
- [x] Ctrl+C termine proprement les requêtes en cours
- [x] Requêtes > 30s retournent 408 Request Timeout
- [x] Configuration via variables d'environnement
- [x] Rate limiting actif sur `/seal`
- [x] Tous les tests passent
- [x] `cargo clippy` sans warnings
- [x] ApiError utilise thiserror avec variants typés
- [x] Health check retourne JSON (status, version, qrng_available, service)
- [x] Endpoint /ready pour Kubernetes
- [x] Request ID (x-request-id) propagé dans headers et logs
