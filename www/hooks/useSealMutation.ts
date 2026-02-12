'use client';

import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { API_URL, getAuthHeaders } from '@/lib/api';

export interface SealResponse {
  seal_id: string;
  seal_data: string;
  timestamp: number;
  has_device_attestation: boolean;
  perceptual_hash?: string;
  /** Base64-encoded image with embedded C2PA manifest */
  sealed_image?: string;
  /** Size of the C2PA manifest in bytes */
  manifest_size?: number;
  /** User ID who created the seal (if authenticated) */
  user_id?: string;
  /** Trust tier of the seal */
  trust_tier: string;
}

export interface SealInput {
  file: Blob;
  filename: string;
  mediaType?: 'image' | 'video' | 'audio';
  deviceAttestation?: string;
  location?: {
    lat: number;
    lng: number;
    altitude?: number;
  };
}

async function createSeal(
  input: SealInput,
  getToken: () => Promise<string | null>
): Promise<SealResponse> {
  const formData = new FormData();
  formData.append('file', input.file, input.filename);
  formData.append('media_type', input.mediaType || 'image');

  if (input.deviceAttestation) {
    formData.append('device_attestation', input.deviceAttestation);
  }

  if (input.location) {
    formData.append('location', JSON.stringify(input.location));
  }

  let headers: HeadersInit = {};
  try {
    headers = await getAuthHeaders(getToken);
  } catch {
    // Anonymous seal creation (no auth)
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${API_URL}/seal`, {
      method: 'POST',
      body: formData,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Erreur HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export function useSealMutation() {
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: (input: SealInput) => createSeal(input, getToken),
    onError: (error) => {
      console.error('Seal mutation error:', error);
    },
  });
}
