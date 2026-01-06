# Plan d'Implémentation WebAuthn/FIDO2 - Veritas Q

**Objectif** : Implémenter l'attestation device via WebAuthn/FIDO2 pour certifier cryptographiquement que les captures proviennent d'un appareil physique authentifié, sans nécessiter d'application native.

**Impact Business** : Renforcement de la confiance dans l'origine des médias scellés, alternative viable au TEE natif pour la PWA.

---

## Contexte WebAuthn/FIDO2

### Qu'est-ce que WebAuthn ?

**Web Authentication (WebAuthn)** est un standard W3C qui permet l'authentification forte basée sur la cryptographie à clé publique:
- Utilise des authenticators hardware (YubiKey, TouchID, Windows Hello)
- Fournit une **attestation device** prouvant le modèle d'appareil
- Résistant au phishing (lié au domaine)
- Supporté par tous les navigateurs modernes

### Device Attestation

L'attestation est un mécanisme FIDO qui identifie le modèle d'appareil:
- Certificat batch signé par le fabricant (1 pour 100,000 appareils)
- Chaîne de confiance cryptographique jusqu'au fabricant
- Permet de vérifier que la clé provient d'un hardware authentique

### Changements 2025

**Important (Android):** Google passe à l'attestation hardware-backed par défaut en avril 2025. Les certificats SafetyNet ne seront plus délivrés. Chrome 130+ requis pour le nouveau format.

### Ressources

- [WebAuthn Guide](https://webauthn.guide/)
- [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/)
- [FIDO Alliance](https://fidoalliance.org/fido2-2/fido2-web-authentication-webauthn/)
- [webauthn-rs (Rust)](https://github.com/kanidm/webauthn-rs)
- [Yubico Attestation Guide](https://developers.yubico.com/WebAuthn/Concepts/Securing_WebAuthn_with_Attestation.html)

---

## Architecture Proposée

### Flux d'Attestation Device

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUX ATTESTATION VERITAS Q                    │
└─────────────────────────────────────────────────────────────────┘

  ┌──────────┐         ┌──────────────┐         ┌──────────────┐
  │  PWA     │         │  API Server  │         │  FIDO MDS    │
  │ (Browser)│         │  (Rust)      │         │  (Metadata)  │
  └────┬─────┘         └──────┬───────┘         └──────┬───────┘
       │                      │                        │
       │  1. Demande capture  │                        │
       │─────────────────────>│                        │
       │                      │                        │
       │  2. Challenge        │                        │
       │<─────────────────────│                        │
       │                      │                        │
       │  3. navigator.credentials.create()           │
       │  (Déclenche TouchID/FaceID/Windows Hello)    │
       │                      │                        │
       │  4. Attestation + PublicKey                  │
       │─────────────────────>│                        │
       │                      │                        │
       │                      │  5. Verify attestation │
       │                      │─────────────────────────>
       │                      │                        │
       │                      │  6. Device metadata    │
       │                      │<─────────────────────────
       │                      │                        │
       │  7. DeviceAttestation incluse dans seal      │
       │<─────────────────────│                        │
       │                      │                        │
```

### Structure DeviceAttestation

```rust
/// Attestation device WebAuthn pour VeritasSeal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceAttestation {
    /// ID unique du credential (base64url)
    pub credential_id: String,

    /// Type d'authenticator
    pub authenticator_type: AuthenticatorType,

    /// Modèle d'appareil (depuis FIDO MDS)
    pub device_model: Option<DeviceModel>,

    /// Attestation statement (format WebAuthn)
    pub attestation_format: AttestationFormat,

    /// Signature de l'attestation (validée côté serveur)
    #[serde(with = "base64_bytes")]
    pub attestation_signature: Vec<u8>,

    /// Public key de l'authenticator
    #[serde(with = "base64_bytes")]
    pub public_key: Vec<u8>,

    /// Timestamp de l'attestation
    pub attested_at: u64,

    /// Counter anti-replay
    pub sign_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthenticatorType {
    /// Platform authenticator (TouchID, FaceID, Windows Hello)
    Platform,
    /// Roaming authenticator (YubiKey, etc.)
    CrossPlatform,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AttestationFormat {
    /// Standard packed format
    Packed,
    /// TPM attestation (Windows)
    Tpm,
    /// Android Key attestation (hardware-backed)
    AndroidKey,
    /// Android SafetyNet (legacy, deprecated 2025)
    AndroidSafetyNet,
    /// Apple attestation
    Apple,
    /// FIDO U2F
    FidoU2f,
    /// None (self-attestation)
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceModel {
    /// AAGUID from FIDO MDS
    pub aaguid: String,
    /// Human-readable description
    pub description: String,
    /// Manufacturer
    pub vendor: Option<String>,
    /// Security certification level
    pub certification_level: Option<String>,
}
```

---

## Phase 1 : Backend WebAuthn (Rust)

### 1.1 Dépendances

**Fichier** : `veritas-server/Cargo.toml`

```toml
[dependencies]
webauthn-rs = { version = "0.5", features = ["danger-allow-state-serialisation"] }
webauthn-rs-proto = "0.5"
```

### 1.2 Module WebAuthn

**Fichier** : `veritas-server/src/webauthn/mod.rs` (nouveau)

```rust
//! WebAuthn device attestation for Veritas Q
//!
//! This module handles WebAuthn registration and authentication
//! to provide cryptographic device attestation for sealed media.

mod config;
mod handlers;
mod storage;

pub use config::WebAuthnConfig;
pub use handlers::{start_registration, finish_registration, start_authentication, finish_authentication};
```

### 1.3 Configuration WebAuthn

**Fichier** : `veritas-server/src/webauthn/config.rs` (nouveau)

```rust
use webauthn_rs::prelude::*;
use url::Url;

pub struct WebAuthnConfig {
    webauthn: Webauthn,
}

impl WebAuthnConfig {
    pub fn new(rp_id: &str, rp_origin: &Url, rp_name: &str) -> Result<Self, WebauthnError> {
        let builder = WebauthnBuilder::new(rp_id, rp_origin)?
            .rp_name(rp_name)
            .allow_subdomains(false)
            // Require attestation for device verification
            .attestation_preference(AttestationConveyancePreference::Direct);

        Ok(Self {
            webauthn: builder.build()?,
        })
    }

    pub fn from_env() -> Result<Self, WebauthnError> {
        let rp_id = std::env::var("WEBAUTHN_RP_ID")
            .unwrap_or_else(|_| "localhost".to_string());
        let rp_origin = std::env::var("WEBAUTHN_RP_ORIGIN")
            .unwrap_or_else(|_| "http://localhost:3001".to_string());
        let rp_name = std::env::var("WEBAUTHN_RP_NAME")
            .unwrap_or_else(|_| "Veritas Q".to_string());

        let origin = Url::parse(&rp_origin)?;
        Self::new(&rp_id, &origin, &rp_name)
    }

    pub fn webauthn(&self) -> &Webauthn {
        &self.webauthn
    }
}
```

### 1.4 Handlers Registration

**Fichier** : `veritas-server/src/webauthn/handlers.rs` (nouveau)

```rust
use axum::{extract::State, Json};
use webauthn_rs::prelude::*;
use crate::state::AppState;

/// POST /webauthn/register/start
/// Start WebAuthn registration for device attestation
pub async fn start_registration(
    State(state): State<AppState>,
    Json(req): Json<StartRegistrationRequest>,
) -> Result<Json<CreationChallengeResponse>, ApiError> {
    let user_id = Uuid::new_v4();
    let user_name = req.device_name.unwrap_or_else(|| "Veritas Device".to_string());

    let (ccr, reg_state) = state.webauthn.start_passkey_registration(
        user_id,
        &user_name,
        &user_name,
        None, // No existing credentials
    )?;

    // Store registration state (expires in 5 minutes)
    state.registration_states.insert(
        user_id.to_string(),
        RegistrationStateEntry {
            state: reg_state,
            expires_at: Instant::now() + Duration::from_secs(300),
        },
    );

    Ok(Json(CreationChallengeResponse {
        challenge_id: user_id.to_string(),
        public_key: ccr,
    }))
}

/// POST /webauthn/register/finish
/// Complete WebAuthn registration and return DeviceAttestation
pub async fn finish_registration(
    State(state): State<AppState>,
    Json(req): Json<FinishRegistrationRequest>,
) -> Result<Json<DeviceAttestationResponse>, ApiError> {
    let reg_state = state.registration_states
        .remove(&req.challenge_id)
        .ok_or(ApiError::InvalidChallenge)?
        .state;

    let passkey = state.webauthn.finish_passkey_registration(
        &req.response,
        &reg_state,
    )?;

    // Extract attestation information
    let attestation = extract_attestation(&req.response, &passkey)?;

    // Lookup device model in FIDO MDS if available
    let device_model = lookup_device_model(&passkey.cred.aaguid).await.ok();

    let device_attestation = DeviceAttestation {
        credential_id: passkey.cred_id().to_string(),
        authenticator_type: if passkey.cred.attachment == AuthenticatorAttachment::Platform {
            AuthenticatorType::Platform
        } else {
            AuthenticatorType::CrossPlatform
        },
        device_model,
        attestation_format: attestation.format,
        attestation_signature: attestation.signature,
        public_key: passkey.cred.cred_public_key.to_vec(),
        attested_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        sign_count: passkey.cred.counter,
    };

    // Store credential for future authentications
    state.credentials.insert(
        device_attestation.credential_id.clone(),
        StoredCredential {
            passkey,
            device_attestation: device_attestation.clone(),
        },
    );

    Ok(Json(DeviceAttestationResponse {
        device_attestation,
    }))
}

/// POST /webauthn/authenticate/start
/// Start WebAuthn authentication for existing device
pub async fn start_authentication(
    State(state): State<AppState>,
    Json(req): Json<StartAuthenticationRequest>,
) -> Result<Json<RequestChallengeResponse>, ApiError> {
    let stored = state.credentials
        .get(&req.credential_id)
        .ok_or(ApiError::CredentialNotFound)?;

    let (rcr, auth_state) = state.webauthn.start_passkey_authentication(
        &[stored.passkey.clone()],
    )?;

    state.authentication_states.insert(
        req.credential_id.clone(),
        AuthStateEntry {
            state: auth_state,
            expires_at: Instant::now() + Duration::from_secs(300),
        },
    );

    Ok(Json(RequestChallengeResponse {
        challenge_id: req.credential_id,
        public_key: rcr,
    }))
}

/// POST /webauthn/authenticate/finish
/// Complete WebAuthn authentication and return fresh attestation
pub async fn finish_authentication(
    State(state): State<AppState>,
    Json(req): Json<FinishAuthenticationRequest>,
) -> Result<Json<DeviceAttestationResponse>, ApiError> {
    let auth_state = state.authentication_states
        .remove(&req.challenge_id)
        .ok_or(ApiError::InvalidChallenge)?
        .state;

    let mut stored = state.credentials
        .get_mut(&req.challenge_id)
        .ok_or(ApiError::CredentialNotFound)?;

    let auth_result = state.webauthn.finish_passkey_authentication(
        &req.response,
        &auth_state,
    )?;

    // Update counter
    stored.passkey.update_credential(&auth_result);
    stored.device_attestation.sign_count = auth_result.counter();
    stored.device_attestation.attested_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    Ok(Json(DeviceAttestationResponse {
        device_attestation: stored.device_attestation.clone(),
    }))
}
```

### 1.5 FIDO Metadata Service (MDS)

**Fichier** : `veritas-server/src/webauthn/mds.rs` (nouveau)

```rust
//! FIDO Metadata Service integration for device model lookup

use serde::Deserialize;

const FIDO_MDS_URL: &str = "https://mds3.fidoalliance.org/";

#[derive(Debug, Deserialize)]
pub struct MetadataEntry {
    pub aaguid: String,
    pub description: String,
    pub authenticator_version: Option<u32>,
    pub protocol_family: String,
    pub schema_version: u16,
    pub status_reports: Vec<StatusReport>,
    pub time_of_last_status_change: String,
}

#[derive(Debug, Deserialize)]
pub struct StatusReport {
    pub status: String,
    pub effective_date: Option<String>,
    pub certification_descriptor: Option<String>,
    pub certificate_number: Option<String>,
    pub certification_policy_version: Option<String>,
    pub certification_requirements_version: Option<String>,
}

/// Lookup device model from FIDO MDS by AAGUID
pub async fn lookup_device_model(aaguid: &Aaguid) -> Result<DeviceModel, MdsError> {
    // In production, cache the MDS blob and update periodically
    let client = reqwest::Client::new();

    // The MDS blob is a JWT that needs to be verified and decoded
    // For simplicity, this example uses a direct lookup
    // In production, implement proper JWT verification

    let aaguid_str = aaguid.to_string();

    // Lookup in cached MDS entries
    if let Some(entry) = MDS_CACHE.get(&aaguid_str) {
        return Ok(DeviceModel {
            aaguid: aaguid_str,
            description: entry.description.clone(),
            vendor: extract_vendor(&entry.description),
            certification_level: entry.status_reports
                .first()
                .map(|r| r.status.clone()),
        });
    }

    Err(MdsError::AaguidNotFound)
}

fn extract_vendor(description: &str) -> Option<String> {
    // Common vendor patterns
    let vendors = ["Apple", "Google", "Microsoft", "Yubico", "Feitian"];
    for vendor in vendors {
        if description.contains(vendor) {
            return Some(vendor.to_string());
        }
    }
    None
}
```

---

## Phase 2 : Frontend PWA

### 2.1 Hook useDeviceAttestation

**Fichier** : `www/hooks/useDeviceAttestation.ts` (nouveau)

```typescript
"use client";

import { useState, useCallback } from "react";

interface DeviceAttestation {
  credentialId: string;
  authenticatorType: "platform" | "cross-platform";
  deviceModel?: {
    aaguid: string;
    description: string;
    vendor?: string;
    certificationLevel?: string;
  };
  attestedAt: number;
}

interface UseDeviceAttestationReturn {
  attestation: DeviceAttestation | null;
  isSupported: boolean;
  isRegistering: boolean;
  isAuthenticating: boolean;
  error: string | null;
  register: (deviceName?: string) => Promise<DeviceAttestation>;
  authenticate: () => Promise<DeviceAttestation>;
  clear: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export function useDeviceAttestation(): UseDeviceAttestationReturn {
  const [attestation, setAttestation] = useState<DeviceAttestation | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check WebAuthn support
  const isSupported =
    typeof window !== "undefined" &&
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential === "function";

  // Register new device (creates new credential)
  const register = useCallback(
    async (deviceName?: string): Promise<DeviceAttestation> => {
      if (!isSupported) {
        throw new Error("WebAuthn not supported on this device");
      }

      setIsRegistering(true);
      setError(null);

      try {
        // 1. Start registration - get challenge from server
        const startRes = await fetch(`${API_URL}/webauthn/register/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_name: deviceName }),
        });

        if (!startRes.ok) {
          throw new Error("Failed to start registration");
        }

        const { challenge_id, public_key } = await startRes.json();

        // 2. Create credential with browser WebAuthn API
        const credential = (await navigator.credentials.create({
          publicKey: {
            ...public_key,
            challenge: base64ToArrayBuffer(public_key.challenge),
            user: {
              ...public_key.user,
              id: base64ToArrayBuffer(public_key.user.id),
            },
            // Request direct attestation for device verification
            attestation: "direct",
            // Prefer platform authenticator (TouchID, FaceID, Windows Hello)
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              userVerification: "preferred",
              residentKey: "preferred",
            },
          },
        })) as PublicKeyCredential;

        if (!credential) {
          throw new Error("Credential creation cancelled");
        }

        // 3. Send attestation to server for verification
        const attestationResponse =
          credential.response as AuthenticatorAttestationResponse;

        const finishRes = await fetch(`${API_URL}/webauthn/register/finish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challenge_id,
            response: {
              id: credential.id,
              rawId: arrayBufferToBase64(credential.rawId),
              type: credential.type,
              response: {
                clientDataJSON: arrayBufferToBase64(
                  attestationResponse.clientDataJSON
                ),
                attestationObject: arrayBufferToBase64(
                  attestationResponse.attestationObject
                ),
              },
            },
          }),
        });

        if (!finishRes.ok) {
          throw new Error("Failed to verify attestation");
        }

        const { device_attestation } = await finishRes.json();

        // Store credential ID for future authentications
        localStorage.setItem(
          "veritas_credential_id",
          device_attestation.credentialId
        );

        setAttestation(device_attestation);
        return device_attestation;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Registration failed";
        setError(message);
        throw err;
      } finally {
        setIsRegistering(false);
      }
    },
    [isSupported]
  );

  // Authenticate with existing credential
  const authenticate = useCallback(async (): Promise<DeviceAttestation> => {
    if (!isSupported) {
      throw new Error("WebAuthn not supported on this device");
    }

    const credentialId = localStorage.getItem("veritas_credential_id");
    if (!credentialId) {
      throw new Error("No registered device found. Please register first.");
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      // 1. Start authentication
      const startRes = await fetch(`${API_URL}/webauthn/authenticate/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential_id: credentialId }),
      });

      if (!startRes.ok) {
        throw new Error("Failed to start authentication");
      }

      const { challenge_id, public_key } = await startRes.json();

      // 2. Get assertion from authenticator
      const credential = (await navigator.credentials.get({
        publicKey: {
          ...public_key,
          challenge: base64ToArrayBuffer(public_key.challenge),
          allowCredentials: public_key.allowCredentials?.map(
            (c: { id: string; type: string }) => ({
              ...c,
              id: base64ToArrayBuffer(c.id),
            })
          ),
        },
      })) as PublicKeyCredential;

      if (!credential) {
        throw new Error("Authentication cancelled");
      }

      // 3. Verify assertion on server
      const assertionResponse =
        credential.response as AuthenticatorAssertionResponse;

      const finishRes = await fetch(
        `${API_URL}/webauthn/authenticate/finish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challenge_id,
            response: {
              id: credential.id,
              rawId: arrayBufferToBase64(credential.rawId),
              type: credential.type,
              response: {
                clientDataJSON: arrayBufferToBase64(
                  assertionResponse.clientDataJSON
                ),
                authenticatorData: arrayBufferToBase64(
                  assertionResponse.authenticatorData
                ),
                signature: arrayBufferToBase64(assertionResponse.signature),
                userHandle: assertionResponse.userHandle
                  ? arrayBufferToBase64(assertionResponse.userHandle)
                  : null,
              },
            },
          }),
        }
      );

      if (!finishRes.ok) {
        throw new Error("Failed to verify authentication");
      }

      const { device_attestation } = await finishRes.json();
      setAttestation(device_attestation);
      return device_attestation;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Authentication failed";
      setError(message);
      throw err;
    } finally {
      setIsAuthenticating(false);
    }
  }, [isSupported]);

  const clear = useCallback(() => {
    setAttestation(null);
    localStorage.removeItem("veritas_credential_id");
  }, []);

  return {
    attestation,
    isSupported,
    isRegistering,
    isAuthenticating,
    error,
    register,
    authenticate,
    clear,
  };
}

// Utility functions
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
```

### 2.2 Composant DeviceAttestationBadge

**Fichier** : `www/components/DeviceAttestationBadge.tsx` (nouveau)

```tsx
"use client";

import { Shield, ShieldCheck, ShieldAlert, Fingerprint } from "lucide-react";
import { useDeviceAttestation } from "@/hooks/useDeviceAttestation";

interface Props {
  className?: string;
  onAttestationChange?: (attestation: DeviceAttestation | null) => void;
}

export default function DeviceAttestationBadge({
  className,
  onAttestationChange,
}: Props) {
  const {
    attestation,
    isSupported,
    isRegistering,
    isAuthenticating,
    error,
    register,
    authenticate,
  } = useDeviceAttestation();

  const handleAttest = async () => {
    try {
      const result = attestation ? await authenticate() : await register();
      onAttestationChange?.(result);
    } catch {
      // Error already set in hook
    }
  };

  if (!isSupported) {
    return (
      <div className={`flex items-center gap-2 text-foreground/40 ${className}`}>
        <ShieldAlert className="w-4 h-4" />
        <span className="text-xs">WebAuthn non supporté</span>
      </div>
    );
  }

  if (attestation) {
    return (
      <div
        className={`flex items-center gap-2 text-quantum ${className}`}
        title={`Device: ${attestation.deviceModel?.description || "Unknown"}`}
      >
        <ShieldCheck className="w-4 h-4" />
        <span className="text-xs">
          {attestation.deviceModel?.vendor || "Device"} attesté
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={handleAttest}
      disabled={isRegistering || isAuthenticating}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full
        bg-surface-elevated hover:bg-surface border border-border
        transition-colors ${className}`}
    >
      {isRegistering || isAuthenticating ? (
        <>
          <Fingerprint className="w-4 h-4 animate-pulse" />
          <span className="text-xs">Attestation...</span>
        </>
      ) : (
        <>
          <Shield className="w-4 h-4" />
          <span className="text-xs">Attester l&apos;appareil</span>
        </>
      )}
    </button>
  );
}
```

### 2.3 Intégration CameraCapture

**Fichier** : `www/components/CameraCapture.tsx` (modifier)

```tsx
// Ajouter import
import DeviceAttestationBadge from "./DeviceAttestationBadge";
import { useDeviceAttestation } from "@/hooks/useDeviceAttestation";

// Dans le composant
const { attestation, authenticate } = useDeviceAttestation();

// Modifier la fonction de capture pour inclure l'attestation
const captureAndSeal = async () => {
  // ... existing capture code ...

  // Get fresh attestation if available
  let deviceAttestation = attestation;
  if (attestation) {
    try {
      deviceAttestation = await authenticate();
    } catch {
      // Continue without fresh attestation
    }
  }

  // Include attestation in seal request
  const formData = new FormData();
  formData.append("file", blob, "capture.jpg");
  formData.append("media_type", "image");
  if (deviceAttestation) {
    formData.append("device_attestation", JSON.stringify(deviceAttestation));
  }

  const response = await fetch(`${API_URL}/seal`, {
    method: "POST",
    body: formData,
  });

  // ... rest of existing code ...
};

// Dans le JSX, ajouter le badge
<div className="flex items-center justify-between">
  <DeviceAttestationBadge onAttestationChange={setAttestation} />
  {/* ... other controls ... */}
</div>
```

---

## Phase 3 : Intégration VeritasSeal

### 3.1 Mise à jour structure Seal

**Fichier** : `veritas-core/src/seal.rs` (modifier)

```rust
// Ajouter le champ device_attestation
pub struct VeritasSeal {
    // ... existing fields ...

    /// WebAuthn device attestation (optional)
    pub device_attestation: Option<DeviceAttestation>,
}

impl SealBuilder {
    /// Set device attestation from WebAuthn
    pub fn device_attestation(mut self, attestation: DeviceAttestation) -> Self {
        self.device_attestation = Some(attestation);
        self
    }
}
```

### 3.2 Endpoint /seal avec attestation

**Fichier** : `veritas-server/src/handlers/seal.rs` (modifier)

```rust
pub async fn create_seal(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<SealResponse>, ApiError> {
    let mut file_data = None;
    let mut media_type = None;
    let mut device_attestation = None;

    while let Some(field) = multipart.next_field().await? {
        match field.name() {
            Some("file") => {
                file_data = Some(field.bytes().await?);
            }
            Some("media_type") => {
                media_type = Some(field.text().await?.parse()?);
            }
            Some("device_attestation") => {
                let json = field.text().await?;
                device_attestation = Some(serde_json::from_str(&json)?);
            }
            _ => {}
        }
    }

    let file_data = file_data.ok_or(ApiError::MissingField("file"))?;
    let media_type = media_type.unwrap_or(MediaType::Image);

    let mut builder = SealBuilder::new()
        .content(&file_data)
        .media_type(media_type)
        .qrng_source(state.qrng_provider.clone());

    if let Some(attestation) = device_attestation {
        // Verify attestation signature is recent (within 5 minutes)
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        if now - attestation.attested_at > 300 {
            return Err(ApiError::StaleAttestation);
        }
        builder = builder.device_attestation(attestation);
    }

    let seal = builder.build().await?;

    Ok(Json(SealResponse {
        seal: seal.to_base64()?,
        has_device_attestation: seal.device_attestation.is_some(),
    }))
}
```

---

## Phase 4 : Tests

### 4.1 Tests Backend

**Fichier** : `veritas-server/src/webauthn/tests.rs` (nouveau)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_registration_flow() {
        let config = WebAuthnConfig::new(
            "localhost",
            &Url::parse("http://localhost:3001").unwrap(),
            "Test",
        ).unwrap();

        // Test challenge generation
        let (ccr, _state) = config.webauthn().start_passkey_registration(
            Uuid::new_v4(),
            "test_user",
            "Test User",
            None,
        ).unwrap();

        assert!(!ccr.public_key.challenge.is_empty());
    }

    #[tokio::test]
    async fn test_attestation_format_parsing() {
        let packed = AttestationFormat::Packed;
        assert_eq!(serde_json::to_string(&packed).unwrap(), "\"Packed\"");
    }
}
```

### 4.2 Tests Frontend

**Fichier** : `www/__tests__/useDeviceAttestation.test.ts` (nouveau)

```typescript
import { renderHook, act } from "@testing-library/react";
import { useDeviceAttestation } from "@/hooks/useDeviceAttestation";

// Mock navigator.credentials
const mockCreate = jest.fn();
const mockGet = jest.fn();

Object.defineProperty(window, "PublicKeyCredential", {
  value: jest.fn(),
  writable: true,
});

Object.defineProperty(navigator, "credentials", {
  value: {
    create: mockCreate,
    get: mockGet,
  },
  writable: true,
});

describe("useDeviceAttestation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it("should detect WebAuthn support", () => {
    const { result } = renderHook(() => useDeviceAttestation());
    expect(result.current.isSupported).toBe(true);
  });

  it("should handle registration", async () => {
    // Mock server responses
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          challenge_id: "test-id",
          public_key: {
            challenge: btoa("test-challenge"),
            user: { id: btoa("user-id") },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          device_attestation: {
            credentialId: "cred-123",
            authenticatorType: "platform",
            attestedAt: Date.now() / 1000,
          },
        }),
      });

    // Mock credential creation
    mockCreate.mockResolvedValueOnce({
      id: "cred-123",
      rawId: new ArrayBuffer(32),
      type: "public-key",
      response: {
        clientDataJSON: new ArrayBuffer(10),
        attestationObject: new ArrayBuffer(10),
      },
    });

    const { result } = renderHook(() => useDeviceAttestation());

    await act(async () => {
      await result.current.register("Test Device");
    });

    expect(result.current.attestation).toBeTruthy();
    expect(result.current.attestation?.credentialId).toBe("cred-123");
  });
});
```

---

## Variables d'Environnement

```bash
# Backend (veritas-server)
WEBAUTHN_RP_ID=veritas-q.com
WEBAUTHN_RP_ORIGIN=https://veritas-q.com
WEBAUTHN_RP_NAME=Veritas Q

# Frontend (www)
NEXT_PUBLIC_API_URL=https://api.veritas-q.com
```

---

## Dépendances

### Backend (Rust)
```toml
# veritas-server/Cargo.toml
[dependencies]
webauthn-rs = { version = "0.5", features = ["danger-allow-state-serialisation"] }
webauthn-rs-proto = "0.5"
```

### Frontend (TypeScript)
Aucune dépendance supplémentaire (API WebAuthn native du navigateur).

---

## Fichiers à Créer/Modifier

### Nouveaux fichiers (8)
| Fichier | Description |
|---------|-------------|
| `veritas-server/src/webauthn/mod.rs` | Module WebAuthn |
| `veritas-server/src/webauthn/config.rs` | Configuration Relying Party |
| `veritas-server/src/webauthn/handlers.rs` | Endpoints registration/auth |
| `veritas-server/src/webauthn/mds.rs` | FIDO Metadata Service |
| `veritas-server/src/webauthn/tests.rs` | Tests backend |
| `www/hooks/useDeviceAttestation.ts` | Hook WebAuthn frontend |
| `www/components/DeviceAttestationBadge.tsx` | UI attestation |
| `www/__tests__/useDeviceAttestation.test.ts` | Tests frontend |

### Fichiers à modifier (3)
| Fichier | Modifications |
|---------|---------------|
| `veritas-core/src/seal.rs` | Ajouter champ device_attestation |
| `veritas-server/src/handlers/seal.rs` | Accepter attestation |
| `www/components/CameraCapture.tsx` | Intégrer attestation |

---

## Considérations Sécurité

1. **Attestation Freshness**: Vérifier que l'attestation a été créée récemment (< 5 minutes)
2. **Counter Verification**: Implémenter la vérification du sign_count pour détecter le clonage
3. **AAGUID Allowlist**: En production, maintenir une liste d'AAGUIDs approuvés
4. **Origin Binding**: Le RP ID doit correspondre exactement au domaine

---

## Sources

- [WebAuthn Guide](https://webauthn.guide/)
- [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/)
- [FIDO Alliance](https://fidoalliance.org/fido2-2/fido2-web-authentication-webauthn/)
- [webauthn-rs Documentation](https://docs.rs/webauthn-rs)
- [Yubico Attestation Guide](https://developers.yubico.com/WebAuthn/Concepts/Securing_WebAuthn_with_Attestation.html)
- [Android FIDO2 API Changes 2025](https://android-developers.googleblog.com/2024/09/attestation-format-change-for-android-fido2-api.html)

---

*Plan généré le 2026-01-06*
