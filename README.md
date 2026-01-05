# Veritas Q

**Quantum-Authenticated Media Sealing Platform**

Veritas Q establishes the global standard for "Reality Authentication" by using Quantum Random Number Generators (QRNG) to cryptographically sign media content at the moment of capture, producing an unforgeable **Veritas Seal**.

## Why Veritas Q?

In an era of deepfakes and AI-generated content, proving that media is authentic and unaltered is critical. Veritas Q solves this by:

- **Quantum Entropy Binding** - Each seal contains 256 bits of true quantum randomness from certified QRNG sources, making forgery computationally impossible
- **Post-Quantum Cryptography** - ML-DSA-65 signatures (FIPS 204) protect against future quantum computer attacks
- **Blockchain Anchoring** - Optional Solana timestamps provide immutable public proof of when content was sealed
- **C2PA Compatible** - Interoperable with Adobe/Microsoft content authenticity standards

## Quick Start

### Prerequisites

- Rust 1.70+ (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Clang/LLVM (for post-quantum crypto compilation)

### Installation

```bash
git clone https://github.com/ArthurDEV44/veritas-q.git
cd veritas-q
cargo build --workspace --release
```

### Seal Your First File

```bash
# Seal an image with quantum entropy
./target/release/veritas-cli seal photo.jpg

# Verify the seal
./target/release/veritas-cli verify photo.jpg
```

## Architecture

```
veritas-q/
├── veritas-core/    # Core library - cryptographic primitives, seal generation/verification
├── veritas-cli/     # Command-line tool for seal operations
├── veritas-server/  # REST API server (Truth API) for B2B integration
├── veritas-wasm/    # WebAssembly module for browser-based verification
└── www/             # Web verification portal
```

## CLI Usage

```bash
# Seal with quantum entropy (falls back to mock if QRNG unavailable)
veritas-cli seal <FILE>

# Seal with mock entropy (testing only, not quantum-safe)
veritas-cli seal --mock <FILE>

# Verify a sealed file
veritas-cli verify <FILE>
veritas-cli verify <FILE> <SEAL_PATH>

# Anchor seal to Solana blockchain
veritas-cli anchor <SEAL_PATH>
veritas-cli anchor <SEAL_PATH> --update-seal
```

## Truth API (REST Server)

For B2B integration, run the Truth API server:

```bash
cargo run -p veritas-server --release
# Server runs on http://127.0.0.1:3000
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/seal` | POST | Create quantum seal (multipart: file, media_type?, mock?) |
| `/verify` | POST | Verify seal (multipart: file, seal_data) |
| `/health` | GET | Health check |

### Example

```bash
# Create a seal
curl -X POST http://127.0.0.1:3000/seal \
  -F 'file=@photo.jpg' \
  -F 'media_type=image'

# Response
{
  "seal_id": "f4d8ef89-cf0f-4d6f-acbf-9e0740482f76",
  "seal_data": "BASE64_ENCODED_CBOR...",
  "timestamp": 1767647488764
}

# Verify the seal
curl -X POST http://127.0.0.1:3000/verify \
  -F 'file=@photo.jpg' \
  -F 'seal_data=<seal_data from above>'

# Response
{
  "authentic": true,
  "details": "Seal valid. Media type: Image, QRNG source: AnuCloud, Captured: 2026-01-05T21:12:05+00:00"
}
```

## Web Verification Portal

Build and serve the browser-based verification tool:

```bash
# Build WASM module
wasm-pack build veritas-wasm --target web --out-dir ../www/pkg

# Serve locally
cd www && python3 -m http.server 8080
# Open http://localhost:8080
```

## The Veritas Seal

Each seal contains:

| Field | Description |
|-------|-------------|
| `capture_timestamp_utc` | NTP-synced timestamp (milliseconds) |
| `capture_location` | Optional privacy-preserving geohash |
| `device_attestation` | TEE-signed device identity (when available) |
| `qrng_entropy` | 256 bits from quantum source |
| `qrng_source` | Source attestation (ANU, ID Quantique, etc.) |
| `content_hash` | SHA3-256 + optional perceptual hash |
| `media_type` | Image, Video, or Audio |
| `signature` | ML-DSA-65 post-quantum signature |
| `blockchain_anchor` | Optional Solana transaction reference |

## QRNG Sources

| Source | Usage | Notes |
|--------|-------|-------|
| `MockQrng` | Testing | Deterministic, not quantum-safe |
| `AnuQrng` | Development | Free public API (Australian National University) |
| ID Quantique | Production | Requires `QRNG_API_KEY` |

## Environment Variables

```bash
QRNG_API_KEY=           # ID Quantique API key (production)
QRNG_API_URL=           # Custom QRNG endpoint
SOLANA_RPC_URL=         # Solana RPC (default: devnet)
SOLANA_KEYPAIR_PATH=    # Path to anchor wallet keypair
```

## Development

```bash
# Build all crates
cargo build --workspace

# Run tests
cargo test --workspace

# Run single test
cargo test -p veritas-core test_name

# Lint
cargo clippy --workspace -- -D warnings

# Format
cargo fmt --all
```

## Security Considerations

- **Entropy timestamps** must be within 5 seconds of capture timestamp
- **QRNG API calls** should use TLS 1.3 with certificate pinning in production
- **Key material** should be generated and stored in TEE (TrustZone/Secure Enclave) when available
- **Analog hole detection** is probabilistic - never claim 100% deepfake prevention

## License

MIT OR Apache-2.0

## Contributing

Contributions welcome! Please read the security considerations above before submitting PRs involving cryptographic code.
