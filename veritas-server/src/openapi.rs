//! OpenAPI documentation configuration
//!
//! Generates OpenAPI 3.0 specification for the Veritas Q Truth API.

use utoipa::OpenApi;

use crate::handlers::{HealthResponse, ReadyResponse, SealResponse, VerifyResponse};

/// Veritas Q Truth API - OpenAPI Documentation
#[derive(OpenApi)]
#[openapi(
    info(
        title = "Veritas Q - Truth API",
        version = "0.1.0",
        description = r#"
## Quantum-Authenticated Media Verification API

Veritas Q provides **unforgeable digital seals** for media content using:

- **Quantum Random Number Generators (QRNG)** - 256-bit entropy from ID Quantique or ANU
- **Post-Quantum Cryptography** - ML-DSA-65 signatures (FIPS 204)
- **Perceptual Hashing** - Robust image fingerprinting (pHash/dHash)
- **Blockchain Anchoring** - Optional Solana timestamping

### How It Works

1. **Seal** your media at capture time via `POST /seal`
2. The seal contains QRNG entropy, content hash, and a post-quantum signature
3. **Verify** authenticity later via `POST /verify`
4. Any modification (even 1 pixel) breaks the cryptographic seal

### Use Cases

- Journalists proving photo/video authenticity
- Legal evidence chain of custody
- NFT provenance verification
- Combating deepfakes and misinformation
"#,
        license(
            name = "MIT OR Apache-2.0",
            url = "https://github.com/ArthurDEV44/veritas-q/blob/main/LICENSE"
        ),
        contact(
            name = "Veritas Q Team",
            url = "https://github.com/ArthurDEV44/veritas-q"
        )
    ),
    servers(
        (url = "http://localhost:3000", description = "Local development server"),
        (url = "https://api.veritas-q.io", description = "Production server (planned)")
    ),
    tags(
        (name = "Sealing", description = "Create quantum-authenticated seals for media content"),
        (name = "Verification", description = "Verify seals against content to detect tampering"),
        (name = "Health", description = "Service health and readiness endpoints")
    ),
    paths(
        crate::handlers::health::health,
        crate::handlers::health::ready,
        crate::handlers::seal::seal_handler,
        crate::handlers::verify::verify_handler,
    ),
    components(
        schemas(
            HealthResponse,
            ReadyResponse,
            SealResponse,
            VerifyResponse,
        )
    )
)]
pub struct ApiDoc;
