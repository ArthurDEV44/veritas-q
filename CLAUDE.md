# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Veritas Q is a quantum-cryptography-based media authentication platform. It uses Quantum Random Number Generators (QRNG) to cryptographically sign media content at the moment of capture, producing an unforgeable "Veritas Seal." The platform includes a Rust backend (core library, CLI, REST API, WASM) and a Next.js PWA frontend.

## Architecture

```
veritas-q/
├── veritas-core/    # Rust core library - crypto primitives, seal generation/verification, QRNG, C2PA
├── veritas-cli/     # CLI tool (binary: `veritas`) - seal, verify, anchor, c2pa commands
├── veritas-server/  # Axum REST API (Truth API) - seal/verify/WebAuthn/user management/C2PA
├── veritas-wasm/    # WASM bindings for browser verification (verification-only, no network)
└── www/             # Next.js 16 PWA with Clerk auth, camera capture, verification UI
```

All consumer crates depend on `veritas-core`. The server and CLI enable the `c2pa` feature by default.

### Key Technical Decisions

- **Post-Quantum Crypto**: ML-DSA-65 (FIPS 204) via `pqcrypto-mldsa` - do not substitute with classical algorithms
- **C2PA Dual Signatures**: ES256 (ECDSA P-256) for ecosystem compatibility + ML-DSA-65 as custom assertion
- **QRNG Sources**: LfD (default fallback, free), ID Quantique (production, requires API key), ANU (deprecated - SSL expired), Mock (testing only)
- **QRNG Auto-Selection**: `QrngProviderConfig::Auto` tries ID Quantique first (if `QRNG_API_KEY` set), then falls back to LfD
- **Blockchain Anchor**: Solana for public verification timestamps
- **Database**: PostgreSQL via `sqlx` (optional - server runs without `DATABASE_URL` but disables user/seal persistence)
- **Auth**: Clerk (frontend) + WebAuthn/FIDO2 device attestation (server)
- **Serialization**: CBOR (`ciborium`) for seals, JSON for API responses
- **Frontend**: Next.js 16 App Router, Tailwind v4, React 19, Clerk, Serwist (PWA/offline), Dexie (IndexedDB)

### Feature Flags

```
veritas-core:
  default = ["network", "perceptual-hash"]
  network          # Enables async QRNG sources (tokio/reqwest) - disabled for WASM
  perceptual-hash  # Image fingerprinting (blockhash)
  c2pa             # C2PA manifest support (openssl)

veritas-cli:
  default = ["c2pa"]

veritas-server:
  default = ["c2pa"]
  c2pa             # Enables /c2pa/embed and /c2pa/verify endpoints
```

WASM uses `veritas-core` with `default-features = false` (verification-only, no network, no async).

## Build Commands

```bash
# Build all Rust crates
cargo build --workspace

# Run all tests
cargo test --workspace

# Run a single test by name
cargo test -p veritas-core test_name

# Run tests for a specific crate
cargo test -p veritas-server

# Lint (CI enforces -D warnings)
cargo clippy --workspace -- -D warnings

# Format
cargo fmt --all

# Build WASM (requires: cargo install wasm-pack)
wasm-pack build veritas-wasm --target web --out-dir ../www/pkg

# Generate C2PA test certificates (for testing C2PA embed)
./scripts/generate-test-cert.sh

# Full CI locally
./scripts/ci-local.sh
```

### Frontend (www/)

```bash
cd www
bun install
bun dev            # http://localhost:3001
bun run build      # Production build (uses --webpack flag)
bun lint           # ESLint
bun test           # Vitest
bun test:watch     # Vitest watch mode
bun test:coverage  # Vitest with coverage
```

## Server API (Truth API)

```bash
# Run the server (default: http://127.0.0.1:3000)
cargo run -p veritas-server --release
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/seal` | POST | Create seal (multipart: file, media_type?, mock?) |
| `/verify` | POST | Verify seal (multipart: file, seal_data) |
| `/health` | GET | Health check (status, version, qrng_available) |
| `/ready` | GET | Kubernetes readiness probe |
| `/resolve` | POST | Content deduplication lookup |
| `/c2pa/embed` | POST | Embed C2PA manifest in image (feature-gated) |
| `/c2pa/verify` | POST | Verify C2PA manifest (feature-gated) |
| `/webauthn/register/start` | POST | Start FIDO2 device registration |
| `/webauthn/register/finish` | POST | Complete FIDO2 device registration |
| `/webauthn/authenticate/start` | POST | Start FIDO2 authentication |
| `/webauthn/authenticate/finish` | POST | Complete FIDO2 authentication |
| `/api/v1/users/sync` | POST | Sync user from Clerk |
| `/api/v1/users/me` | GET/DELETE | Current user profile |
| `/api/v1/seals` | GET | List user's seal history |
| `/api/v1/seals/{seal_id}` | GET | Get specific seal |
| `/api/v1/seals/{seal_id}/export` | GET | Export seal data |
| `/docs` | GET | Swagger UI |
| `/api-docs/openapi.json` | GET | OpenAPI spec |

### Server Architecture

- **Routes**: `veritas-server/src/routes.rs` - all route registration and middleware stack
- **Handlers**: `veritas-server/src/handlers/` - one file per endpoint group
- **WebAuthn**: `veritas-server/src/webauthn/` - FIDO2 device attestation with hybrid storage (PostgreSQL for credentials, in-memory for short-lived challenges)
- **Database**: `veritas-server/src/db/` - `UserRepository` and `SealRepository` (PostgreSQL)
- **Manifest Store**: `veritas-server/src/manifest_store/` - C2PA manifest storage with similarity-based deduplication
- **Config**: All server config from env vars with sensible defaults (see `veritas-server/src/config.rs`)
- **Migrations**: `veritas-server/migrations/` - 4 SQL migrations (webauthn, manifests, users, seals tables)

The server gracefully degrades: without `DATABASE_URL`, user management/seal persistence/manifest store are disabled but core seal/verify still works.

## CLI Usage

```bash
veritas seal <FILE>                    # Seal with quantum entropy (auto-selects QRNG)
veritas seal --mock <FILE>             # Seal with mock entropy (testing only)
veritas verify <FILE>                  # Verify seal (looks for .seal sidecar)
veritas verify <FILE> <SEAL_PATH>      # Verify with explicit seal path
veritas anchor <SEAL_PATH>             # Anchor seal hash to Solana Devnet
veritas anchor <SEAL_PATH> --update-seal  # Anchor and update seal with tx ID
veritas c2pa embed <FILE>              # Embed C2PA manifest in image
veritas c2pa verify <FILE>             # Verify C2PA manifest
```

## Frontend Architecture (www/)

- **Auth**: Clerk (`@clerk/nextjs`) with French localization. Protected routes under `/dashboard/*`.
- **Public routes**: `/`, `/verify`, `/sign-in`, `/sign-up`, `/forgot-password`, `/offline`
- **Dashboard**: `/dashboard`, `/dashboard/seals`, `/dashboard/seals/[id]`, `/dashboard/settings/*`
- **PWA**: Serwist service worker for offline support, Dexie (IndexedDB) for local seal storage
- **State**: Zustand for client state, TanStack Query for server state
- **API**: Calls Rust server at `localhost:3000` by default (configure via `NEXT_PUBLIC_API_URL`)

## Development Guidelines

### Cryptographic Code

- All entropy MUST come from QRNG sources - never use `rand` for security-critical operations
- Seal signatures use ML-DSA-65 (FIPS 204) exclusively
- QRNG API calls must use TLS 1.3 with certificate pinning
- Entropy timestamps must be within 5 seconds of capture timestamp
- Key material must be generated and stored in TEE when available

### QRNG Provider Pattern

Use `QrngProviderFactory::create(QrngProviderConfig::Auto)` for production. For tests, use `QrngProviderFactory::create_mock()` or `MockQrng::new(seed)`. The `QuantumEntropySource` trait (in `veritas-core/src/qrng/mod.rs`) is the core abstraction - all QRNG providers implement it.

### Testing

- Use `MockQrng` for unit tests (implements `QuantumEntropySource` trait)
- CLI integration tests use `assert_cmd` and `tempfile`
- Server tests use `tower::ServiceExt` for handler testing
- Frontend tests use Vitest + Testing Library
- Property-based testing for seal CBOR serialization/deserialization

### Latency Budget

Total seal generation must complete in <500ms:
- QRNG fetch: <100ms
- Content hashing: <100ms
- ML-DSA signature: <50ms
- Blockchain anchor: <200ms (optional)

## Environment Variables

```bash
# QRNG
QRNG_API_KEY=              # ID Quantique API key (enables production QRNG)
QRNG_API_URL=              # QRNG endpoint (default: ID Quantique production)

# Database (optional - enables user/seal persistence, WebAuthn credential storage)
DATABASE_URL=              # PostgreSQL connection string

# Solana
SOLANA_RPC_URL=            # Solana RPC endpoint
SOLANA_KEYPAIR_PATH=       # Path to anchor wallet keypair

# WebAuthn/FIDO2
WEBAUTHN_RP_ID=            # Relying party ID (e.g., veritas-q.com)
WEBAUTHN_RP_ORIGIN=        # Primary origin (e.g., https://veritas-q.com)
WEBAUTHN_RP_ORIGINS=       # Comma-separated additional origins
WEBAUTHN_RP_NAME=          # Display name (e.g., "Veritas Q")
WEBAUTHN_ALLOW_ANY_PORT=   # Allow any port in origin matching (dev only)

# C2PA signing
C2PA_SIGNING_KEY=          # Path to C2PA signing private key
C2PA_SIGNING_CERT=         # Path to C2PA signing certificate

# Clerk JWT auth (server auto-derives JWKS URL from publishable key)
CLERK_PUBLISHABLE_KEY=     # Clerk publishable key (server uses this for JWT validation)
CLERK_JWKS_URL=            # Or set JWKS URL directly (overrides publishable key)

# Server config
PORT=3000                  # Server listen port
HOST=127.0.0.1             # Server listen address (0.0.0.0 for Docker)
ALLOWED_ORIGINS=           # CORS origins, comma-separated
RATE_LIMIT_ENABLED=true    # Enable rate limiting
RATE_LIMIT_PER_SEC=10      # Requests per second
RATE_LIMIT_BURST=20        # Burst size

# Frontend
NEXT_PUBLIC_API_URL=       # Rust server URL (default: http://localhost:3000)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=  # Clerk publishable key
CLERK_SECRET_KEY=          # Clerk secret key
```
