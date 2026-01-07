/**
 * Verification API utilities for Veritas Q
 * Handles classic verification, C2PA verification, and soft binding resolution
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// ============================================================================
// Response Types
// ============================================================================

export interface VerifyResponse {
  authentic: boolean;
  details: string;
}

export interface C2paVerifyResponse {
  c2pa_valid: boolean;
  claim_generator: string | null;
  quantum_seal: QuantumSealInfo | null;
  validation_errors: string[];
}

export interface QuantumSealInfo {
  qrng_source: string;
  capture_timestamp: number;
  content_hash: string;
  signature_size: number;
  blockchain_anchor: BlockchainAnchorInfo | null;
}

export interface BlockchainAnchorInfo {
  chain: string;
  network: string;
  transaction_id: string;
}

export interface ResolveResponse {
  found: boolean;
  count: number;
  matches: ResolveMatch[];
}

export interface ResolveMatch {
  seal_id: string;
  image_hash: string;
  hamming_distance: number;
  media_type: string;
  created_at: string;
  seal_data?: string;
}

// ============================================================================
// Unified Verification Result
// ============================================================================

export type VerificationMethod = "classic" | "c2pa" | "soft_binding";

export interface UnifiedVerificationResult {
  method: VerificationMethod;
  success: boolean;

  // Classic verification result
  classic?: VerifyResponse;

  // C2PA verification result
  c2pa?: C2paVerifyResponse;

  // Soft binding resolution result
  resolution?: ResolveResponse;

  // Error if any
  error?: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Classic verification: media file + .veritas seal file
 */
export async function verifyClassic(
  mediaFile: File,
  sealData: string
): Promise<VerifyResponse> {
  const formData = new FormData();
  formData.append("file", mediaFile);
  formData.append("seal_data", sealData);

  const response = await fetch(`${API_URL}/verify`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * C2PA verification: extract and verify embedded C2PA manifest
 */
export async function verifyC2pa(file: File): Promise<C2paVerifyResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/c2pa/verify`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Soft binding resolution: find seal by perceptual hash similarity
 */
export async function resolveByImage(
  file: File,
  options?: {
    threshold?: number;
    limit?: number;
    includeSealData?: boolean;
  }
): Promise<ResolveResponse> {
  // Convert file to base64
  const arrayBuffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      ""
    )
  );

  const response = await fetch(`${API_URL}/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_data: base64,
      threshold: options?.threshold ?? 10,
      limit: options?.limit ?? 5,
      include_seal_data: options?.includeSealData ?? true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Unified verification: tries all methods in order
 * 1. If seal file provided -> classic verification
 * 2. Else -> try C2PA verification (embedded manifest)
 * 3. If no C2PA manifest -> try soft binding resolution
 */
export async function verifyUnified(
  mediaFile: File,
  sealFile?: File
): Promise<UnifiedVerificationResult> {
  // Path 1: Classic verification with seal file
  if (sealFile) {
    try {
      const sealData = await sealFile.text();
      const result = await verifyClassic(mediaFile, sealData);
      return {
        method: "classic",
        success: result.authentic,
        classic: result,
      };
    } catch (error) {
      return {
        method: "classic",
        success: false,
        error: error instanceof Error ? error.message : "Verification failed",
      };
    }
  }

  // Path 2: Try C2PA verification (embedded manifest)
  try {
    const c2paResult = await verifyC2pa(mediaFile);

    // If C2PA manifest found and valid
    if (c2paResult.quantum_seal) {
      return {
        method: "c2pa",
        success: c2paResult.c2pa_valid,
        c2pa: c2paResult,
      };
    }
  } catch {
    // C2PA verification failed, continue to soft binding
  }

  // Path 3: Try soft binding resolution
  try {
    const resolveResult = await resolveByImage(mediaFile);

    if (resolveResult.found && resolveResult.count > 0) {
      return {
        method: "soft_binding",
        success: true,
        resolution: resolveResult,
      };
    }

    // No match found
    return {
      method: "soft_binding",
      success: false,
      resolution: resolveResult,
      error: "Aucun sceau trouvé pour cette image",
    };
  } catch (error) {
    return {
      method: "soft_binding",
      success: false,
      error: error instanceof Error ? error.message : "Resolution failed",
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format timestamp to locale string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Format QRNG source for display
 */
export function formatQrngSource(source: string): string {
  const sources: Record<string, string> = {
    Anu: "ANU (Australian National University)",
    IdQuantique: "ID Quantique",
    Mock: "Mock (Test)",
  };
  return sources[source] || source;
}

/**
 * Truncate hash for display
 */
export function truncateHash(hash: string, length: number = 16): string {
  if (hash.length <= length) return hash;
  return `${hash.slice(0, length / 2)}...${hash.slice(-length / 2)}`;
}

/**
 * Get confidence level from Hamming distance
 */
export function getConfidenceLevel(distance: number): {
  level: "exact" | "high" | "medium" | "low";
  label: string;
  color: string;
} {
  if (distance === 0) {
    return { level: "exact", label: "Correspondance exacte", color: "text-green-500" };
  }
  if (distance <= 5) {
    return { level: "high", label: "Haute confiance", color: "text-green-400" };
  }
  if (distance <= 10) {
    return { level: "medium", label: "Confiance moyenne", color: "text-yellow-500" };
  }
  return { level: "low", label: "Faible confiance", color: "text-orange-500" };
}

/**
 * Check if file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * Check if file is a seal file
 */
export function isSealFile(file: File): boolean {
  return file.name.endsWith(".veritas");
}
