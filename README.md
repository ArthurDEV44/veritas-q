# Veritas Q

**Plateforme de Scellement Média Authentifié par Cryptographie Quantique**

Veritas Q établit le standard mondial pour l'"Authentification de la Réalité" en utilisant des Générateurs de Nombres Aléatoires Quantiques (QRNG) pour signer cryptographiquement le contenu média au moment de la capture, produisant un **Sceau Veritas** infalsifiable.

## Pourquoi Veritas Q ?

À l'ère des deepfakes et du contenu généré par IA, prouver qu'un média est authentique et non altéré est crucial. Veritas Q résout ce problème grâce à :

- **Liaison d'Entropie Quantique** - Chaque sceau contient 256 bits de véritable aléatoire quantique provenant de sources QRNG certifiées, rendant la falsification informatiquement impossible
- **Cryptographie Post-Quantique** - Les signatures ML-DSA-65 (FIPS 204) protègent contre les futures attaques d'ordinateurs quantiques
- **Ancrage Blockchain** - Les horodatages Solana optionnels fournissent une preuve publique immuable de la date de scellement
- **Compatible C2PA** - Interopérable avec les standards d'authenticité de contenu Adobe/Microsoft

## Démarrage Rapide

### Prérequis

- Rust 1.70+ (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Clang/LLVM (pour la compilation de la crypto post-quantique)

### Installation

```bash
git clone https://github.com/ArthurDEV44/veritas-q.git
cd veritas-q
cargo build --workspace --release
```

### Scellez Votre Premier Fichier

```bash
# Sceller une image avec de l'entropie quantique
./target/release/veritas-cli seal photo.jpg

# Vérifier le sceau
./target/release/veritas-cli verify photo.jpg
```

## Architecture

```
veritas-q/
├── veritas-core/    # Bibliothèque core - primitives cryptographiques, génération/vérification de sceaux
├── veritas-cli/     # Outil en ligne de commande pour les opérations de scellement
├── veritas-server/  # Serveur REST API (Truth API) pour l'intégration B2B
├── veritas-wasm/    # Module WebAssembly pour la vérification dans le navigateur
└── www/             # Portail web de vérification
```

## Utilisation CLI

```bash
# Sceller avec de l'entropie quantique (fallback sur mock si QRNG indisponible)
veritas-cli seal <FICHIER>

# Sceller avec de l'entropie mock (tests uniquement, non sécurisé quantiquement)
veritas-cli seal --mock <FICHIER>

# Vérifier un fichier scellé
veritas-cli verify <FICHIER>
veritas-cli verify <FICHIER> <CHEMIN_SCEAU>

# Ancrer le sceau sur la blockchain Solana
veritas-cli anchor <CHEMIN_SCEAU>
veritas-cli anchor <CHEMIN_SCEAU> --update-seal
```

## Truth API (Serveur REST)

Pour l'intégration B2B, lancez le serveur Truth API :

```bash
cargo run -p veritas-server --release
# Le serveur tourne sur http://127.0.0.1:3000
```

### Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/seal` | POST | Créer un sceau quantique (multipart: file, media_type?, mock?) |
| `/verify` | POST | Vérifier un sceau (multipart: file, seal_data) |
| `/health` | GET | Vérification de santé |

### Exemple

```bash
# Créer un sceau
curl -X POST http://127.0.0.1:3000/seal \
  -F 'file=@photo.jpg' \
  -F 'media_type=image'

# Réponse
{
  "seal_id": "f4d8ef89-cf0f-4d6f-acbf-9e0740482f76",
  "seal_data": "BASE64_ENCODED_CBOR...",
  "timestamp": 1767647488764
}

# Vérifier le sceau
curl -X POST http://127.0.0.1:3000/verify \
  -F 'file=@photo.jpg' \
  -F 'seal_data=<seal_data ci-dessus>'

# Réponse
{
  "authentic": true,
  "details": "Seal valid. Media type: Image, QRNG source: AnuCloud, Captured: 2026-01-05T21:12:05+00:00"
}
```

## Portail Web de Vérification

Compilez et servez l'outil de vérification dans le navigateur :

```bash
# Compiler le module WASM
wasm-pack build veritas-wasm --target web --out-dir ../www/pkg

# Servir localement
cd www && python3 -m http.server 8080
# Ouvrir http://localhost:8080
```

## Le Sceau Veritas

Chaque sceau contient :

| Champ | Description |
|-------|-------------|
| `capture_timestamp_utc` | Horodatage synchronisé NTP (millisecondes) |
| `capture_location` | Geohash optionnel préservant la vie privée |
| `device_attestation` | Identité de l'appareil signée par TEE (si disponible) |
| `qrng_entropy` | 256 bits provenant d'une source quantique |
| `qrng_source` | Attestation de la source (ANU, ID Quantique, etc.) |
| `content_hash` | SHA3-256 + hash perceptuel optionnel |
| `media_type` | Image, Vidéo ou Audio |
| `signature` | Signature post-quantique ML-DSA-65 |
| `blockchain_anchor` | Référence de transaction Solana optionnelle |

## Sources QRNG

| Source | Usage | Notes |
|--------|-------|-------|
| `MockQrng` | Tests | Déterministe, non sécurisé quantiquement |
| `AnuQrng` | Développement | API publique gratuite (Australian National University) |
| ID Quantique | Production | Nécessite `QRNG_API_KEY` |

## Variables d'Environnement

```bash
QRNG_API_KEY=           # Clé API ID Quantique (production)
QRNG_API_URL=           # Endpoint QRNG personnalisé
SOLANA_RPC_URL=         # RPC Solana (défaut: devnet)
SOLANA_KEYPAIR_PATH=    # Chemin vers le keypair du wallet d'ancrage
```

## Développement

```bash
# Compiler tous les crates
cargo build --workspace

# Lancer les tests
cargo test --workspace

# Lancer un test unique
cargo test -p veritas-core nom_du_test

# Lint
cargo clippy --workspace -- -D warnings

# Formatage
cargo fmt --all
```

## Considérations de Sécurité

- **Les horodatages d'entropie** doivent être à moins de 5 secondes de l'horodatage de capture
- **Les appels API QRNG** doivent utiliser TLS 1.3 avec certificate pinning en production
- **Le matériel cryptographique** doit être généré et stocké dans un TEE (TrustZone/Secure Enclave) si disponible
- **La détection du trou analogique** est probabiliste - ne jamais prétendre à une prévention des deepfakes à 100%

## Licence

MIT OR Apache-2.0

## Contribution

Les contributions sont les bienvenues ! Veuillez lire les considérations de sécurité ci-dessus avant de soumettre des PRs impliquant du code cryptographique.
