"use client";

import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const CREDENTIAL_STORAGE_KEY = "veritas-device-credential";
const ATTESTATION_STORAGE_KEY = "veritas-device-attestation";

// Maximum age for attestation to be considered fresh (5 minutes)
const MAX_ATTESTATION_AGE_MS = 5 * 60 * 1000;

export type AuthenticatorType = "platform" | "cross_platform";
export type AttestationFormat =
  | "packed"
  | "tpm"
  | "android_key"
  | "android_safety_net"
  | "apple"
  | "fido_u2f"
  | "none";

export interface DeviceModel {
  aaguid: string;
  description: string;
  vendor?: string;
  certification_level?: string;
}

export interface DeviceAttestation {
  credential_id: string;
  authenticator_type: AuthenticatorType;
  device_model?: DeviceModel;
  attestation_format: AttestationFormat;
  attested_at: number;
  sign_count: number;
  aaguid: string;
}

export interface DeviceAttestationState {
  // State
  isSupported: boolean;
  isRegistered: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  attestation: DeviceAttestation | null;

  // Actions
  register: (deviceName?: string) => Promise<boolean>;
  authenticate: () => Promise<boolean>;
  clear: () => void;

  // Helpers
  isFresh: () => boolean;
  getAttestationJson: () => string | null;
}

interface StartRegistrationResponse {
  challenge_id: string;
  public_key: PublicKeyCredentialCreationOptions;
}

interface StartAuthenticationResponse {
  challenge_id: string;
  public_key: PublicKeyCredentialRequestOptions;
}

interface DeviceAttestationResponse {
  device_attestation: DeviceAttestation;
}

// Check if WebAuthn is supported
function isWebAuthnSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential === "function"
  );
}

// Check if platform authenticator is available (TouchID, FaceID, Windows Hello)
async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Convert ArrayBuffer to base64url
function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Convert base64url to Uint8Array
function base64urlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Fix the challenge and credential IDs from the server response
function fixPublicKeyCreationOptions(
  options: PublicKeyCredentialCreationOptions
): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge:
      typeof options.challenge === "string"
        ? base64urlToBuffer(options.challenge as string).buffer as ArrayBuffer
        : options.challenge,
    user: {
      ...options.user,
      id:
        typeof options.user.id === "string"
          ? base64urlToBuffer(options.user.id as string).buffer as ArrayBuffer
          : options.user.id,
    },
    excludeCredentials: options.excludeCredentials?.map((cred) => ({
      ...cred,
      id:
        typeof cred.id === "string"
          ? base64urlToBuffer(cred.id as string).buffer as ArrayBuffer
          : cred.id,
    })),
  };
}

function fixPublicKeyRequestOptions(
  options: PublicKeyCredentialRequestOptions
): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge:
      typeof options.challenge === "string"
        ? base64urlToBuffer(options.challenge as string).buffer as ArrayBuffer
        : options.challenge,
    allowCredentials: options.allowCredentials?.map((cred) => ({
      ...cred,
      id:
        typeof cred.id === "string"
          ? base64urlToBuffer(cred.id as string).buffer as ArrayBuffer
          : cred.id,
    })),
  };
}

export function useDeviceAttestation(): DeviceAttestationState {
  const [isSupported, setIsSupported] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attestation, setAttestation] = useState<DeviceAttestation | null>(
    null
  );

  // Check WebAuthn support and load stored credential on mount
  useEffect(() => {
    async function init() {
      const supported = await isPlatformAuthenticatorAvailable();
      setIsSupported(supported);

      // Load stored credential
      const storedCredential = localStorage.getItem(CREDENTIAL_STORAGE_KEY);
      if (storedCredential) {
        setIsRegistered(true);

        // Load stored attestation
        const storedAttestation = localStorage.getItem(ATTESTATION_STORAGE_KEY);
        if (storedAttestation) {
          try {
            const att = JSON.parse(storedAttestation) as DeviceAttestation;
            setAttestation(att);
          } catch {
            // Invalid stored attestation
          }
        }
      }
    }

    init();
  }, []);

  // Register a new device
  const register = useCallback(
    async (deviceName?: string): Promise<boolean> => {
      if (!isSupported) {
        setError("WebAuthn is not supported on this device");
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Step 1: Start registration
        const startResponse = await fetch(`${API_URL}/webauthn/register/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_name: deviceName }),
        });

        if (!startResponse.ok) {
          throw new Error(`Registration start failed: ${startResponse.status}`);
        }

        const startData: StartRegistrationResponse = await startResponse.json();

        // Fix the options (convert base64url strings to ArrayBuffers)
        const publicKeyOptions = fixPublicKeyCreationOptions(
          startData.public_key
        );

        // Step 2: Create credential with platform authenticator
        const credential = (await navigator.credentials.create({
          publicKey: publicKeyOptions,
        })) as PublicKeyCredential;

        if (!credential) {
          throw new Error("Failed to create credential");
        }

        const attestationResponse =
          credential.response as AuthenticatorAttestationResponse;

        // Step 3: Finish registration
        const finishResponse = await fetch(
          `${API_URL}/webauthn/register/finish`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              challenge_id: startData.challenge_id,
              response: {
                id: credential.id,
                rawId: bufferToBase64url(credential.rawId),
                type: credential.type,
                response: {
                  clientDataJSON: bufferToBase64url(
                    attestationResponse.clientDataJSON
                  ),
                  attestationObject: bufferToBase64url(
                    attestationResponse.attestationObject
                  ),
                },
              },
            }),
          }
        );

        if (!finishResponse.ok) {
          const errorText = await finishResponse.text();
          throw new Error(`Registration failed: ${errorText}`);
        }

        const finishData: DeviceAttestationResponse =
          await finishResponse.json();

        // Store credential ID and attestation
        localStorage.setItem(
          CREDENTIAL_STORAGE_KEY,
          finishData.device_attestation.credential_id
        );
        localStorage.setItem(
          ATTESTATION_STORAGE_KEY,
          JSON.stringify(finishData.device_attestation)
        );

        setIsRegistered(true);
        setIsAuthenticated(true);
        setAttestation(finishData.device_attestation);
        setIsLoading(false);
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Registration failed";
        setError(message);
        setIsLoading(false);
        return false;
      }
    },
    [isSupported]
  );

  // Authenticate with existing credential
  const authenticate = useCallback(async (): Promise<boolean> => {
    const credentialId = localStorage.getItem(CREDENTIAL_STORAGE_KEY);
    if (!credentialId) {
      setError("No registered credential found");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Start authentication
      const startResponse = await fetch(
        `${API_URL}/webauthn/authenticate/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential_id: credentialId }),
        }
      );

      if (!startResponse.ok) {
        throw new Error(`Authentication start failed: ${startResponse.status}`);
      }

      const startData: StartAuthenticationResponse = await startResponse.json();

      // Fix the options
      const publicKeyOptions = fixPublicKeyRequestOptions(startData.public_key);

      // Step 2: Get assertion
      const credential = (await navigator.credentials.get({
        publicKey: publicKeyOptions,
      })) as PublicKeyCredential;

      if (!credential) {
        throw new Error("Failed to get credential");
      }

      const assertionResponse =
        credential.response as AuthenticatorAssertionResponse;

      // Step 3: Finish authentication
      const finishResponse = await fetch(
        `${API_URL}/webauthn/authenticate/finish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challenge_id: startData.challenge_id,
            response: {
              id: credential.id,
              rawId: bufferToBase64url(credential.rawId),
              type: credential.type,
              response: {
                clientDataJSON: bufferToBase64url(
                  assertionResponse.clientDataJSON
                ),
                authenticatorData: bufferToBase64url(
                  assertionResponse.authenticatorData
                ),
                signature: bufferToBase64url(assertionResponse.signature),
                userHandle: assertionResponse.userHandle
                  ? bufferToBase64url(assertionResponse.userHandle)
                  : undefined,
              },
            },
          }),
        }
      );

      if (!finishResponse.ok) {
        const errorText = await finishResponse.text();
        throw new Error(`Authentication failed: ${errorText}`);
      }

      const finishData: DeviceAttestationResponse = await finishResponse.json();

      // Update stored attestation
      localStorage.setItem(
        ATTESTATION_STORAGE_KEY,
        JSON.stringify(finishData.device_attestation)
      );

      setIsAuthenticated(true);
      setAttestation(finishData.device_attestation);
      setIsLoading(false);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Authentication failed";
      setError(message);
      setIsLoading(false);
      return false;
    }
  }, []);

  // Clear stored credential
  const clear = useCallback(() => {
    localStorage.removeItem(CREDENTIAL_STORAGE_KEY);
    localStorage.removeItem(ATTESTATION_STORAGE_KEY);
    setIsRegistered(false);
    setIsAuthenticated(false);
    setAttestation(null);
    setError(null);
  }, []);

  // Check if attestation is fresh (within 5 minutes)
  const isFresh = useCallback((): boolean => {
    if (!attestation) return false;
    const now = Date.now();
    const attestedAt = attestation.attested_at * 1000; // Convert to ms
    return now - attestedAt <= MAX_ATTESTATION_AGE_MS;
  }, [attestation]);

  // Get attestation as JSON string for API calls
  const getAttestationJson = useCallback((): string | null => {
    if (!attestation || !isFresh()) return null;
    return JSON.stringify(attestation);
  }, [attestation, isFresh]);

  return {
    isSupported,
    isRegistered,
    isAuthenticated,
    isLoading,
    error,
    attestation,
    register,
    authenticate,
    clear,
    isFresh,
    getAttestationJson,
  };
}
