# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Veritas Q is a quantum-cryptography-based media authentication platform. The goal is to create the global standard for "Reality Authentication" by using Quantum Random Number Generators (QRNG) to cryptographically sign media content at the moment of capture, producing an unforgeable "Veritas Seal."

## Architecture

```
veritas-q/
├── veritas-core/    # Rust core library - cryptographic primitives, seal generation/verification
├── veritas-cli/     # Command-line tool for seal operations
├── veritas-wasm/    # WebAssembly bindings for browser verification
├── veritas-server/  # REST API server (Truth API) for B2B SaaS
├── www/             # Web verification portal (Tailwind CSS)
├── sdk-mobile/      # Mobile bindings (Kotlin/Swift via uniffi) [planned]
└── contracts/       # Solana on-chain program for seal anchoring [planned]
```

### Key Technical Decisions

- **Language**: Rust for all cryptographic code (memory safety, cross-platform FFI)
- **Post-Quantum Crypto**: FIPS 204 ML-DSA signatures via `pqcrypto` crate
- **QRNG Source**: ID Quantique Quantis API (primary), device hardware (when available)
- **Blockchain Anchor**: Solana for public verification timestamps
- **Mobile TEE**: ARM TrustZone (Android), Secure Enclave (iOS) for key protection
- **Metadata Format**: C2PA-compatible JUMBF with Veritas extension

### The VeritasSeal

Core data structure containing:
- Capture context (timestamp, optional location, device attestation)
- QRNG entropy (256 bits bound to content)
- Content binding (perceptual + cryptographic hash)
- Post-quantum signature (ML-DSA-65)
- Optional blockchain anchor reference

## Build Commands

```bash
# Build all Rust crates
cargo build --workspace

# Run tests
cargo test --workspace

# Run a single test
cargo test -p veritas-core test_name

# Build release
cargo build --workspace --release

# Lint
cargo clippy --workspace -- -D warnings

# Format
cargo fmt --all
```

## CLI Usage

```bash
# Seal a file with quantum entropy (falls back to mock if network unavailable)
veritas seal <FILE>

# Seal with mock entropy (for testing, not quantum-safe)
veritas seal --mock <FILE>

# Verify a sealed file
veritas verify <FILE>
veritas verify <FILE> <SEAL_PATH>  # Custom seal path

# Anchor seal hash to Solana Devnet (immutable timestamp)
veritas anchor <SEAL_PATH>
veritas anchor <SEAL_PATH> --update-seal  # Updates seal with tx ID
```

## Server API (Truth API)

```bash
# Run the server (default: http://127.0.0.1:3000)
cargo run -p veritas-server --release

# Endpoints:
# POST /seal   - Create seal (multipart: file, media_type?, mock?)
# POST /verify - Verify seal (multipart: file, seal_data)
# GET  /health - Health check
```

### Example curl commands

```bash
# Create a seal
curl -X POST http://127.0.0.1:3000/seal \
  -F 'file=@image.jpg' \
  -F 'media_type=image'

# Verify a seal
curl -X POST http://127.0.0.1:3000/verify \
  -F 'file=@image.jpg' \
  -F 'seal_data=<base64-encoded-seal>'
```

## WebAssembly Build

Building the WASM module requires clang/LLVM for the pqcrypto C code:

```bash
# Prerequisites
apt install clang  # or brew install llvm on macOS

# Build WASM module
wasm-pack build veritas-wasm --target web --out-dir ../www/pkg

# Serve the web portal locally
cd www && python3 -m http.server 8080
# Open http://localhost:8080 in browser
```

### Feature Flags

`veritas-core` uses feature flags for Wasm compatibility:
- `network` (default) - Enables async QRNG sources, requires tokio/reqwest
- Without `network` - Verification-only mode for Wasm (no async, no network)

## Development Guidelines

### Cryptographic Code

- All entropy MUST come from QRNG sources (ID Quantique API or attested hardware)
- Never use `rand` crate's default RNG for security-critical operations
- Seal signatures use ML-DSA-65 (FIPS 204) - do not substitute with classical algorithms
- Key material must be generated and stored in TEE when available

### Latency Budget

Total seal generation must complete in <500ms:
- QRNG fetch: <100ms
- TEE attestation: <50ms
- Content hashing: <100ms
- ML-DSA signature: <50ms
- Blockchain anchor: <200ms (optional)

### Security Considerations

- Analog hole detection is probabilistic, not perfect - never claim 100% deepfake prevention
- Device attestation provides assurance, not guarantees against hardware-level attacks
- QRNG API calls must use TLS 1.3 with certificate pinning
- Entropy timestamps must be within 5 seconds of capture timestamp

### C2PA Compatibility

Veritas Seals should be embeddable as C2PA JUMBF manifest extensions. Maintain compatibility with C2PA 2.x specification for interoperability with Adobe/Microsoft tooling.

## Environment Variables

```
QRNG_API_KEY=          # ID Quantique API key
QRNG_API_URL=          # QRNG endpoint (default: production)
SOLANA_RPC_URL=        # Solana RPC endpoint
SOLANA_KEYPAIR_PATH=   # Path to anchor wallet
```

## Testing Strategy

- Unit tests for all cryptographic primitives
- Integration tests against QRNG API (use `MockQrng` implementing `QuantumEntropySource` trait in CI)
- Property-based testing for seal serialization/deserialization (CBOR format)
- Fuzz testing for parser code handling untrusted input

### Mock QRNG for Testing

Use the `QuantumEntropySource` trait with `MockQrng` implementation for tests that don't require real quantum entropy. Available QRNG sources:

- `MockQrng` - Deterministic mock for unit tests (not quantum-safe)
- `AnuQrng` - Australian National University public QRNG API (development)
- ID Quantique API - Production QRNG (requires `QRNG_API_KEY`)
