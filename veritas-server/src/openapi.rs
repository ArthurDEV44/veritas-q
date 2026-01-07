//! OpenAPI documentation configuration
//!
//! Generates OpenAPI 3.0 specification for the Veritas Q Truth API.

use utoipa::OpenApi;

use crate::handlers::{
    HealthResponse, ReadyResponse, ResolveMatch, ResolveRequest, ResolveResponse, SealResponse,
    VerifyResponse,
};
use crate::webauthn::{
    AttestationFormat, AuthenticatorType, DeviceAttestation, DeviceAttestationResponse,
    DeviceModel, StartAuthenticationRequest, StartRegistrationRequest,
};

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
- **C2PA Integration** - Content Authenticity Initiative compatibility

### How It Works

1. **Seal** your media at capture time via `POST /seal`
2. The seal contains QRNG entropy, content hash, and a post-quantum signature
3. **Verify** authenticity later via `POST /verify`
4. Any modification (even 1 pixel) breaks the cryptographic seal
5. Optionally embed as **C2PA manifest** for interoperability with Adobe/Microsoft tools

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
        (name = "Resolution", description = "Resolve seals by perceptual hash similarity (soft binding)"),
        (name = "Verification", description = "Verify seals against content to detect tampering"),
        (name = "WebAuthn", description = "Device attestation via WebAuthn/FIDO2 for hardware-backed authentication"),
        (name = "C2PA", description = "C2PA manifest operations for Content Authenticity Initiative compatibility"),
        (name = "Health", description = "Service health and readiness endpoints")
    ),
    paths(
        crate::handlers::health::health,
        crate::handlers::health::ready,
        crate::handlers::seal::seal_handler,
        crate::handlers::resolve::resolve_handler,
        crate::handlers::verify::verify_handler,
        crate::webauthn::handlers::start_registration,
        crate::webauthn::handlers::finish_registration,
        crate::webauthn::handlers::start_authentication,
        crate::webauthn::handlers::finish_authentication,
    ),
    components(
        schemas(
            HealthResponse,
            ReadyResponse,
            SealResponse,
            ResolveRequest,
            ResolveResponse,
            ResolveMatch,
            VerifyResponse,
            StartRegistrationRequest,
            StartAuthenticationRequest,
            DeviceAttestationResponse,
            DeviceAttestation,
            DeviceModel,
            AuthenticatorType,
            AttestationFormat,
        )
    )
)]
pub struct ApiDoc;

// Note: C2PA paths would be added here when utoipa supports conditional compilation better
// For now, they're documented via their own #[utoipa::path] attributes
