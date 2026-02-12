//! OpenAPI documentation configuration
//!
//! Generates OpenAPI 3.0 specification for the Veritas Q Truth API.

use utoipa::OpenApi;

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
        (name = "Seals", description = "List, retrieve, and export user's seals with C2PA interoperability"),
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
        crate::handlers::seals::list_user_seals_handler,
        crate::handlers::seals::get_user_seal_handler,
        crate::handlers::seals::export_seal_handler,
        crate::webauthn::handlers::start_registration,
        crate::webauthn::handlers::finish_registration,
        crate::webauthn::handlers::start_authentication,
        crate::webauthn::handlers::finish_authentication,
    ),
    components(
        schemas(
            crate::handlers::HealthResponse,
            crate::handlers::ReadyResponse,
            crate::handlers::SealResponse,
            crate::handlers::ResolveRequest,
            crate::handlers::ResolveResponse,
            crate::handlers::ResolveMatch,
            crate::handlers::VerifyResponse,
            // Seal list and detail
            crate::db::SealRecord,
            crate::db::SealListResponse,
            crate::db::SealMetadata,
            crate::handlers::SealDetailResponse,
            crate::db::TrustTier,
            // Export
            crate::handlers::ExportResponse,
            crate::handlers::JsonExportResponse,
            crate::handlers::C2paExportResponse,
            // WebAuthn
            crate::webauthn::StartRegistrationRequest,
            crate::webauthn::StartAuthenticationRequest,
            crate::webauthn::DeviceAttestationResponse,
            crate::webauthn::DeviceAttestation,
            crate::webauthn::DeviceModel,
            crate::webauthn::AuthenticatorType,
            crate::webauthn::AttestationFormat,
        )
    ),
    modifiers(&C2paModifier)
)]
pub struct ApiDoc;

/// Modifier to add C2PA paths when the feature is enabled
struct C2paModifier;

impl utoipa::Modify for C2paModifier {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        #[cfg(feature = "c2pa")]
        {
            use utoipa::OpenApi;

            // Merge C2PA paths and components
            let c2pa_doc = <C2paDoc as OpenApi>::openapi();

            // Merge paths
            openapi.paths.paths.extend(c2pa_doc.paths.paths);

            // Merge schemas
            if let Some(components) = openapi.components.as_mut() {
                if let Some(c2pa_components) = c2pa_doc.components {
                    components.schemas.extend(c2pa_components.schemas);
                }
            }
        }
    }
}

/// C2PA-specific OpenAPI documentation (only compiled when c2pa feature is enabled)
#[cfg(feature = "c2pa")]
#[derive(OpenApi)]
#[openapi(
    paths(
        crate::handlers::c2pa::c2pa_embed_handler,
        crate::handlers::c2pa::c2pa_verify_handler,
    ),
    components(schemas(
        crate::handlers::C2paEmbedResponse,
        crate::handlers::C2paVerifyResponse,
        crate::handlers::c2pa::QuantumSealInfo,
        crate::handlers::c2pa::BlockchainAnchorInfo,
    ))
)]
struct C2paDoc;
