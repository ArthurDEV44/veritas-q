# Veritas Q - Product & Technical Plan

> **The Global Standard for Reality Authentication via Quantum Cryptography**

---

## Vision 2026: The Societal Imperative

### The Trust Crisis

We are at an inflection point. By January 2026, deepfake technology has reached a level of sophistication where synthetic media is indistinguishable from authentic content to the human eye. IBM's quantum AI roadmap predicted this moment - and we're here.

The societal consequences are severe:
- **Erosion of institutional trust**: News organizations, governments, and courts can no longer rely on video/audio evidence
- **Personal identity theft**: Anyone's likeness can be weaponized in minutes
- **Democratic instability**: Electoral interference via synthetic media at industrial scale
- **Economic fraud**: Voice-cloned authorization of financial transactions

### The Regulatory Tailwind

The legal landscape is aligning with our mission:

| Jurisdiction | Regulation | Key Dates | Relevance |
|--------------|-----------|-----------|-----------|
| **EU** | AI Act Article 50 | Aug 2026 enforcement | Mandatory deepfake disclosure, machine-readable labeling required |
| **EU** | Code of Practice on AI Content | May-June 2026 final | Live video requires continuous visual indicators |
| **US** | TAKE IT DOWN Act | May 2026 compliance | 48-hour takedown mandate for platforms |
| **US** | Biden AI Executive Order | Active | Federal agencies must watermark synthetic content |
| **Global** | NIST IR 8547 | 2035 deadline | Full deprecation of quantum-vulnerable algorithms |

**Window of Opportunity**: Regulations mandate the *what* (authentication, labeling, provenance) but not the *how*. Veritas Q provides the technological backbone.

### Why Quantum? Why Now?

Classical cryptographic signatures face an existential threat:
- **Harvest Now, Decrypt Later (HNDL)**: Adversaries are already collecting signed content to break signatures once quantum computers mature (5-15 year horizon)
- **C2PA's Achilles Heel**: The current C2PA standard relies on X.509 certificates and classical algorithms (RSA/ECDSA) - all quantum-vulnerable
- **Deterministic Randomness**: Classical PRNGs can be reverse-engineered; quantum randomness is provably unpredictable by the laws of physics

Veritas Q provides **quantum-native authentication from day one**, future-proofing every seal we issue.

---

## Market Intel: Competitive Landscape & Opportunity Gaps

### C2PA (Content Authenticity Initiative) - Current Leader

**What They Do Right:**
- Industry consortium (Adobe, Microsoft, BBC, etc.)
- ISO standardization track (expected 2025)
- Broad camera/software integration

**Critical Gaps We Exploit:**
| C2PA Limitation | Veritas Q Advantage |
|-----------------|---------------------|
| Classical cryptography (quantum-vulnerable) | Post-quantum signatures (FIPS 204 ML-DSA) + QRNG entropy |
| No truth verification - only provenance chain | Quantum-timestamped "moment of capture" seal |
| Metadata can be stripped/spoofed offline | Immutable on-chain anchor (tamper-evident) |
| Privacy concerns with identity disclosure | Zero-knowledge provenance proofs (optional identity) |
| Complex implementation for device makers | Lightweight SDK (<2MB) with cloud QRNG fallback |

### QRNG Mobile Hardware - Market Reality

**Current State (January 2026):**
- **Samsung Galaxy Quantum 6**: Latest generation with ID Quantique chip (2.5mm x 2.5mm)
- **Availability**: SK Telecom exclusive (South Korea only)
- **Coverage**: Financial apps, authentication, payment OTPs

**Implication for Veritas Q:**
- Cannot rely on device-embedded QRNG for global launch
- **Strategy**: Hybrid architecture with cloud QRNG API as primary, device QRNG as enhancement when available
- **Partners to pursue**: ID Quantique (cloud QRNG API), Quantinuum (enterprise)

### Blockchain Watermarking Competitors

| Competitor Type | Approach | Weakness |
|----------------|----------|----------|
| **Neural Watermarking** (IMATAG, Truepic) | Invisible pixel patterns | Can be stripped by adversarial ML |
| **Blockchain Provenance** (Numbers Protocol) | Hash-on-chain | Doesn't prove capture authenticity |
| **Detection AI** (Sensity, Reality Defender) | Post-hoc deepfake detection | Arms race with generators; false positives |

**Veritas Q Differentiation**: We prove authenticity at capture time, not detect fakes after the fact. Defense, not forensics.

---

## Tech Stack & Architecture

### Core Principles

1. **Quantum-First**: All entropy from QRNG; all signatures post-quantum
2. **Zero Trust Capture**: Seal created in secure enclave before media touches user space
3. **Decentralized Verification**: Anyone can verify without Veritas Q servers
4. **Privacy by Design**: Identity optional; location granularity controllable

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VERITAS Q ECOSYSTEM                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │   CAPTURE   │    │   SEALING   │    │      VERIFICATION       │ │
│  │   DEVICE    │───►│   ENGINE    │───►│         LAYER           │ │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘ │
│        │                  │                       │                 │
│        ▼                  ▼                       ▼                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │ Camera API  │    │ QRNG Cloud  │    │   Public Blockchain     │ │
│  │ Secure TEE  │    │ ID Quantique│    │   (Solana/Arweave)      │ │
│  │ GPS/NTP     │    │ or Local HW │    │   or Private Ledger     │ │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Mobile SDK** | Rust (core) + Kotlin/Swift bindings | Memory safety, cross-platform, TEE access |
| **Sealing Engine** | Rust with `pqcrypto` crate | FIPS 204 ML-DSA signatures |
| **QRNG Source** | ID Quantique Quantis API (primary) | Industry leader, <100ms latency |
| **Timestamp Anchor** | Solana (public) / Hyperledger (enterprise) | 400ms finality, low cost ($0.00025/tx) |
| **Metadata Format** | C2PA-compatible JUMBF extension | Interoperability with existing ecosystem |
| **Verification API** | Node.js/TypeScript serverless | Low latency, global edge deployment |

### The "Veritas Seal" Data Structure

```rust
struct VeritasSeal {
    // === Capture Context ===
    capture_timestamp_utc: u64,           // NTP-synced Unix timestamp
    capture_location: Option<GeoHash>,     // Privacy-preserving location (configurable precision)
    device_attestation: DeviceAttestation, // TEE-signed device identity

    // === Quantum Entropy ===
    qrng_entropy: [u8; 32],               // 256 bits from QRNG at capture moment
    qrng_source: QrngSource,              // Cloud API or local chip attestation
    entropy_timestamp: u64,               // When entropy was generated

    // === Content Binding ===
    content_hash: ContentHash,            // Perceptual hash + cryptographic hash
    media_type: MediaType,                // Image, Video, Audio

    // === Post-Quantum Signature ===
    signature: MlDsaSignature,            // FIPS 204 ML-DSA-65 (128-bit security)
    public_key: MlDsaPublicKey,

    // === Anchoring ===
    blockchain_anchor: Option<BlockchainAnchor>,
    anchor_tx_id: Option<String>,
}
```

### Latency Budget (Target: <500ms total)

| Operation | Target | Notes |
|-----------|--------|-------|
| QRNG entropy fetch (cloud) | <100ms | ID Quantique API |
| TEE attestation | <50ms | ARM TrustZone / Apple Secure Enclave |
| Content hashing | <100ms | Perceptual + SHA-3 |
| ML-DSA signature | <50ms | Optimized Rust implementation |
| Blockchain anchor (optional) | <200ms | Solana confirmation |
| **Total** | **<500ms** | Acceptable for capture flow |

### Attack Vector Analysis & Mitigations

#### 1. The Analog Hole Attack
**Threat**: Attacker films a screen displaying a deepfake, then captures that with Veritas Q.

**Mitigations**:
- **Screen Detection ML**: On-device model detects moiré patterns, refresh flicker, bezel presence
- **Parallax Challenge**: Random micro-movements during capture to detect flat surfaces
- **Ambient Light Analysis**: Compare expected vs actual lighting consistency
- **Limitation**: This is an arms race; perfect defense impossible. We reduce, not eliminate.

#### 2. Compromised Device Attack
**Threat**: Rooted device with modified camera driver feeds synthetic content.

**Mitigations**:
- **TEE Attestation**: Seal only generated in secure enclave; requires hardware trust
- **Device Reputation**: Track attestation history; flag anomalies
- **Limitation**: Nation-state level hardware supply chain attacks remain theoretical risk

#### 3. Replay Attack
**Threat**: Re-using old QRNG entropy for new content.

**Mitigations**:
- **Entropy Binding**: QRNG bits mixed with content hash before signing
- **Timestamp Window**: Reject seals where entropy timestamp differs >5s from capture timestamp
- **Nonce Registry**: Optional cloud-side entropy nonce deduplication

#### 4. Man-in-the-Middle QRNG
**Threat**: Intercepting/replacing QRNG API responses.

**Mitigations**:
- **TLS 1.3 with Certificate Pinning**: To QRNG provider
- **Post-Quantum TLS**: ML-KEM key exchange (FIPS 203) when available
- **Hardware QRNG Fallback**: When device chip present, prefer local source

---

## Business Model

### Freemium (Consumer)

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 50 seals/month, basic verification, visible watermark |
| **Pro** | $9.99/mo | Unlimited seals, no watermark, priority QRNG, API access |
| **Creator** | $29.99/mo | Team features, bulk verification, analytics dashboard |

### Enterprise Licensing

| Segment | Model | Target Customers |
|---------|-------|------------------|
| **Press** | Per-seat + volume | Reuters, AP, BBC, NYT |
| **Government** | Site license | Election commissions, courts, law enforcement |
| **Social Platforms** | API usage | Meta, TikTok, X - compliance tool |
| **Legal/Insurance** | Per-verification | Evidence authentication |

**Pricing Strategy**: Undercut detection-based solutions (which require ongoing AI training). Our cost is marginal per-seal; theirs scales with model complexity.

---

## Roadmap MVP (90 Days)

### Sprint 1: Foundation (Days 1-14)

**Goal**: Core cryptographic primitives and project scaffolding

| Task | Owner | Deliverable |
|------|-------|-------------|
| Rust workspace setup | Core | Monorepo with `sdk-core`, `cli`, `server` crates |
| Post-quantum crypto integration | Core | `pqcrypto` wrapper with ML-DSA-65 |
| QRNG client library | Core | ID Quantique API integration with retry/fallback |
| VeritasSeal struct implementation | Core | Serialization (CBOR), validation |
| CI/CD pipeline | DevOps | GitHub Actions: lint, test, build |

**Exit Criteria**: Can generate and verify a seal from CLI with cloud QRNG

### Sprint 2: Mobile SDK Alpha (Days 15-35)

**Goal**: Working iOS/Android capture flow

| Task | Owner | Deliverable |
|------|-------|-------------|
| Rust FFI bindings | Mobile | `uniffi` generated Kotlin/Swift bindings |
| iOS SDK | Mobile | Swift package with camera integration |
| Android SDK | Mobile | Kotlin library with CameraX integration |
| TEE integration (iOS) | Mobile | Secure Enclave key storage |
| TEE integration (Android) | Mobile | KeyStore + StrongBox attestation |
| Analog hole detection v1 | ML | Basic screen detection model (MobileNet-based) |

**Exit Criteria**: Capture photo on device, generate seal with cloud QRNG, verify via CLI

### Sprint 3: Verification Infrastructure (Days 36-56)

**Goal**: Public verification and blockchain anchoring

| Task | Owner | Deliverable |
|------|-------|-------------|
| Verification API | Backend | Serverless functions (Cloudflare Workers) |
| Solana anchor integration | Backend | On-chain program for seal hash registration |
| Verification web app | Frontend | Simple drag-drop verification UI |
| C2PA metadata embedding | Core | JUMBF manifest with Veritas extension |
| SDK documentation | DevRel | Integration guide, API reference |

**Exit Criteria**: End-to-end flow: capture → seal → anchor → public verification

### Sprint 4: Alpha Release (Days 57-77)

**Goal**: Closed alpha with select partners

| Task | Owner | Deliverable |
|------|-------|-------------|
| iOS TestFlight build | Mobile | Alpha app for testers |
| Android internal track | Mobile | Play Store internal testing |
| Partner onboarding (3-5 news orgs) | BizDev | Integration support, feedback loop |
| Security audit (preliminary) | Security | Third-party review of crypto implementation |
| Performance optimization | Core | Achieve <500ms latency target |

**Exit Criteria**: 5 partner organizations actively testing in production-like environment

### Sprint 5: Hardening & Beta Prep (Days 78-90)

**Goal**: Production readiness

| Task | Owner | Deliverable |
|------|-------|-------------|
| Load testing | QA | 10K concurrent seal generations |
| Privacy review | Legal | GDPR compliance documentation |
| Analog hole detection v2 | ML | Improved model with user feedback |
| Enterprise API draft | Backend | Multi-tenant architecture design |
| Beta launch plan | Product | Marketing materials, landing page |

**Exit Criteria**: Ready for public beta announcement

---

## Challenges & Risks

### Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **QRNG API availability/latency** | High | Multi-provider failover; aggressive caching of entropy batches |
| **Post-quantum library maturity** | Medium | Use NIST reference implementations; contribute fixes upstream |
| **TEE fragmentation (Android)** | Medium | Graceful degradation; device allowlist for high-assurance mode |
| **Analog hole arms race** | High | Position as "deterrent, not perfect defense"; invest in ML research |
| **Blockchain cost volatility** | Low | Solana historically stable; Arweave as backup anchor |

### Market Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **C2PA adoption accelerates without us** | High | Ensure C2PA compatibility; position as "quantum-enhanced C2PA" |
| **Regulation slower than expected** | Medium | Focus on voluntary adoption by trust-critical industries |
| **Big Tech builds in-house** | Medium | Move fast; establish standard before they react |
| **Consumer apathy to verification** | High | B2B2C strategy; embed in platforms, not direct consumer behavior change |

### Operational Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Key personnel dependency** | Medium | Document everything; cross-train aggressively |
| **QRNG provider lock-in** | Low | Abstract provider interface; test with multiple sources |
| **Cryptographic vulnerability discovered** | Medium | Algorithm agility in seal format; versioned signatures |

---

## Success Metrics (90-Day Alpha)

| Metric | Target |
|--------|--------|
| Seals generated (total) | 10,000 |
| Partner organizations onboarded | 5 |
| Average seal latency | <500ms |
| Verification success rate | >99.9% |
| Security vulnerabilities (critical) | 0 |
| Mobile app crash rate | <1% |

---

## Research Sources

This plan synthesizes intelligence from the following sources (January 2026 research):

- [C2PA Technical Specification 2.2](https://spec.c2pa.org/)
- [World Privacy Forum - C2PA Privacy Analysis](https://worldprivacyforum.org/posts/privacy-identity-and-trust-in-c2pa/)
- [NSA Content Credentials Security Guidance](https://media.defense.gov/2025/Jan/29/2003634788/-1/-1/0/CSI-CONTENT-CREDENTIALS.PDF)
- [ID Quantique - Samsung QRNG Partnership](https://www.idquantique.com/samsung-galaxy-quantum-5/)
- [NIST Post-Quantum Cryptography Standards](https://csrc.nist.gov/projects/post-quantum-cryptography)
- [NIST FIPS 203/204/205 Standards](https://csrc.nist.gov/news/2024/postquantum-cryptography-fips-approved)
- [GSMA Post-Quantum IoT Guidance](https://www.gsma.com/solutions-and-impact/technologies/internet-of-things/gsma_resources/pq-04-post-quantum-cryptography-in-iot-ecosystem/)
- [Cloudflare PQC State of the Internet 2025](https://blog.cloudflare.com/pq-2025/)
- [EU AI Act - Article 50 Transparency Obligations](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [EU Code of Practice on AI Content Marking](https://digital-strategy.ec.europa.eu/en/news/commission-publishes-first-draft-code-practice-marking-and-labelling-ai-generated-content)
- [Regula Forensics - Deepfake Regulations 2025](https://regulaforensics.com/blog/deepfake-regulations/)
- [MDPI - Multifaceted Deepfake Prevention Framework](https://www.mdpi.com/2073-431X/14/11/488)

---

*Document Version: 1.0 | Created: January 2026 | Next Review: After Sprint 2*
