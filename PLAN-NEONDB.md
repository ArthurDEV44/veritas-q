# Plan d'intégration NeonDB

## Objectif

Remplacer le stockage en mémoire (`DashMap`) des credentials WebAuthn par une base de données PostgreSQL persistante hébergée sur NeonDB.

## Pourquoi NeonDB ?

- **Persistence** : Les credentials survivent aux redémarrages/redéploiements
- **Interface visuelle** : Console web pour visualiser les données
- **Free tier** : 0.5 GB storage, 190h compute/mois
- **Serverless** : Scale to zero, pas de maintenance
- **Rust-friendly** : Compatible avec sqlx (async, compile-time checked)

---

## Phase 1 : Configuration NeonDB

### 1.1 Créer le projet NeonDB

1. Aller sur [neon.tech](https://neon.tech)
2. Créer un compte (GitHub OAuth recommandé)
3. Créer un nouveau projet : `veritas-q`
4. Région : Choisir la plus proche de Render (ex: `aws-eu-central-1`)
5. PostgreSQL version : 16 (dernière stable)

### 1.2 Récupérer la connection string

```
postgresql://[user]:[password]@[host]/[database]?sslmode=require
```

Format Neon :
```
postgresql://username:password@ep-xxx-xxx-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

### 1.3 Configurer les variables d'environnement

**Render (veritas-q-api)** :
```
DATABASE_URL=postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require
```

**Local (.env)** :
```
DATABASE_URL=postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require
```

---

## Phase 2 : Dépendances Rust

### 2.1 Ajouter sqlx au Cargo.toml

**veritas-server/Cargo.toml** :
```toml
[dependencies]
sqlx = { version = "0.8", features = [
    "runtime-tokio",
    "tls-rustls",
    "postgres",
    "uuid",
    "chrono",
    "json"
]}
```

### 2.2 Installer sqlx-cli (développement local)

```bash
cargo install sqlx-cli --no-default-features --features rustls,postgres
```

---

## Phase 3 : Schéma de base de données

### 3.1 Créer la migration initiale

```bash
cd veritas-server
sqlx migrate add create_webauthn_tables
```

### 3.2 Fichier de migration

**veritas-server/migrations/YYYYMMDDHHMMSS_create_webauthn_tables.sql** :

```sql
-- Table des credentials WebAuthn
CREATE TABLE webauthn_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_id TEXT UNIQUE NOT NULL,
    passkey_data JSONB NOT NULL,
    device_name TEXT,

    -- Device attestation fields
    authenticator_type TEXT NOT NULL DEFAULT 'platform',
    attestation_format TEXT NOT NULL DEFAULT 'none',
    aaguid TEXT NOT NULL,
    sign_count INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour recherche rapide par credential_id
CREATE INDEX idx_credentials_credential_id ON webauthn_credentials(credential_id);

-- Table des challenges temporaires (registration/authentication)
-- Note: On garde les challenges en mémoire car ils expirent en 5 minutes
-- et ne nécessitent pas de persistence entre redémarrages
```

### 3.3 Exécuter la migration

```bash
# Local
sqlx migrate run

# Ou via Neon Console (SQL Editor)
```

---

## Phase 4 : Implémentation Rust

### 4.1 Nouveau module : `storage/postgres.rs`

```rust
// veritas-server/src/webauthn/storage/postgres.rs

use sqlx::PgPool;
use uuid::Uuid;

use crate::webauthn::types::DeviceAttestation;
use webauthn_rs::prelude::Passkey;

pub struct PostgresStorage {
    pool: PgPool,
}

impl PostgresStorage {
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPool::connect(database_url).await?;
        Ok(Self { pool })
    }

    pub async fn store_credential(
        &self,
        credential_id: &str,
        passkey: &Passkey,
        device_name: Option<&str>,
        attestation: &DeviceAttestation,
    ) -> Result<(), sqlx::Error> {
        let passkey_json = serde_json::to_value(passkey)?;

        sqlx::query!(
            r#"
            INSERT INTO webauthn_credentials
            (credential_id, passkey_data, device_name, authenticator_type,
             attestation_format, aaguid, sign_count)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (credential_id) DO UPDATE SET
                passkey_data = EXCLUDED.passkey_data,
                sign_count = EXCLUDED.sign_count,
                last_used_at = NOW()
            "#,
            credential_id,
            passkey_json,
            device_name,
            attestation.authenticator_type.to_string(),
            attestation.attestation_format.to_string(),
            attestation.aaguid,
            attestation.sign_count as i32
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_credential(&self, credential_id: &str) -> Result<Option<StoredCredential>, sqlx::Error> {
        // ... implementation
    }

    pub async fn update_credential_attestation(
        &self,
        credential_id: &str,
        sign_count: u32,
    ) -> Result<bool, sqlx::Error> {
        // ... implementation
    }
}
```

### 4.2 Modifier `WebAuthnStorage` pour utiliser PostgreSQL

```rust
// veritas-server/src/webauthn/storage/mod.rs

pub enum StorageBackend {
    InMemory(InMemoryStorage),
    Postgres(PostgresStorage),
}

impl WebAuthnStorage {
    pub async fn from_env() -> Result<Self, Error> {
        if let Ok(database_url) = std::env::var("DATABASE_URL") {
            let pg = PostgresStorage::new(&database_url).await?;
            Ok(Self { backend: StorageBackend::Postgres(pg) })
        } else {
            tracing::warn!("DATABASE_URL not set, using in-memory storage");
            Ok(Self { backend: StorageBackend::InMemory(InMemoryStorage::new()) })
        }
    }
}
```

### 4.3 Garder les challenges en mémoire

Les challenges (registration/authentication states) restent en mémoire car :
- Ils expirent en 5 minutes
- Ils ne nécessitent pas de persistence
- Performance optimale

---

## Phase 5 : Configuration Render

### 5.1 Variables d'environnement

Ajouter dans Render Dashboard → Environment Variables :

| Key | Value |
|-----|-------|
| `DATABASE_URL` | `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require` |

### 5.2 Healthcheck avec DB

Modifier `/health` pour vérifier la connexion DB :

```rust
pub async fn health_check(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    let db_status = state.storage.check_connection().await.is_ok();

    Json(HealthResponse {
        status: if db_status { "healthy" } else { "degraded" },
        version: env!("CARGO_PKG_VERSION"),
        database: db_status,
        // ...
    })
}
```

---

## Phase 6 : Migration des données (optionnel)

Si des credentials existent déjà en production (peu probable vu les redémarrages), créer un script de migration.

---

## Phase 7 : Tests

### 7.1 Tests unitaires avec DB de test

```rust
#[sqlx::test]
async fn test_store_and_retrieve_credential(pool: PgPool) {
    let storage = PostgresStorage::from_pool(pool);
    // ... test implementation
}
```

### 7.2 Tests d'intégration

```bash
# Créer une branche Neon pour les tests
neon branches create --name test-branch

# Exécuter les tests
DATABASE_URL="..." cargo test -p veritas-server
```

---

## Checklist d'implémentation

- [ ] **Phase 1** : Créer projet NeonDB et récupérer connection string
- [ ] **Phase 2** : Ajouter dépendance sqlx à `veritas-server/Cargo.toml`
- [ ] **Phase 3** : Créer et exécuter la migration SQL
- [ ] **Phase 4.1** : Implémenter `PostgresStorage`
- [ ] **Phase 4.2** : Modifier `WebAuthnStorage` pour supporter les deux backends
- [ ] **Phase 4.3** : Garder `DashMap` pour les challenges temporaires
- [ ] **Phase 5** : Configurer `DATABASE_URL` sur Render
- [ ] **Phase 6** : Mettre à jour le healthcheck
- [ ] **Phase 7** : Tester localement puis en production

---

## Structure finale des fichiers

```
veritas-server/
├── Cargo.toml                    # + sqlx dependency
├── migrations/
│   └── 20260107_create_webauthn_tables.sql
├── src/
│   ├── webauthn/
│   │   ├── mod.rs
│   │   ├── config.rs
│   │   ├── handlers.rs
│   │   ├── types.rs
│   │   └── storage/
│   │       ├── mod.rs            # Storage trait + enum backend
│   │       ├── memory.rs         # InMemoryStorage (challenges only)
│   │       └── postgres.rs       # PostgresStorage (credentials)
│   └── ...
└── .env.example                  # DATABASE_URL example
```

---

## Estimation

| Phase | Temps estimé |
|-------|--------------|
| Phase 1 (NeonDB setup) | 10 min |
| Phase 2 (Dépendances) | 5 min |
| Phase 3 (Migration SQL) | 15 min |
| Phase 4 (Code Rust) | 1-2h |
| Phase 5 (Render config) | 5 min |
| Phase 6 (Tests) | 30 min |
| **Total** | **~2-3h** |

---

## Ressources

- [NeonDB Documentation](https://neon.tech/docs)
- [sqlx GitHub](https://github.com/launchbadge/sqlx)
- [sqlx avec PostgreSQL](https://docs.rs/sqlx/latest/sqlx/postgres/index.html)
- [Neon + Rust example](https://neon.tech/docs/guides/rust)
