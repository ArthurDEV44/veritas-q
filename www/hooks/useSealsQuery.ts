'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { useCallback } from 'react';
import { API_URL, getAuthHeaders } from '@/lib/api';

/** Export format options */
export type ExportFormat = 'json' | 'c2pa';

/** Location data from seal metadata */
export interface SealLocation {
  lat: number;
  lng: number;
  altitude?: number;
}

/** Seal metadata structure */
export interface SealMetadata {
  timestamp?: string;
  location?: SealLocation;
  device?: {
    user_agent?: string;
    platform?: string;
  };
  capture_source?: string;
  has_device_attestation?: boolean;
}

/** Seal record from API */
export interface SealRecord {
  id: string;
  content_hash: string;
  perceptual_hash?: string;
  media_type: 'image' | 'video' | 'audio';
  file_size?: number;
  metadata: SealMetadata;
  trust_tier: number;
  c2pa_manifest_embedded: boolean;
  captured_at: string;
  created_at: string;
  media_deleted: boolean;
}

/** Seal detail response with cryptographic data */
export interface SealDetail extends SealRecord {
  signature: string;
  public_key: string;
  qrng_entropy: string;
  qrng_source: string;
}

/** Paginated seals response */
export interface SealsListResponse {
  seals: SealRecord[];
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
}

/** Filter options for seal list */
export interface SealFilters {
  media_type?: 'image' | 'video' | 'audio';
  has_location?: boolean;
}

/** Fetch user's seals with pagination */
async function fetchSeals(
  page: number,
  limit: number,
  filters: SealFilters,
  getToken: () => Promise<string | null>
): Promise<SealsListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (filters.media_type) {
    params.set('media_type', filters.media_type);
  }

  if (filters.has_location !== undefined) {
    params.set('has_location', String(filters.has_location));
  }

  const authHeaders = await getAuthHeaders(getToken);
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...authHeaders,
  };

  const response = await fetch(`${API_URL}/api/v1/seals?${params}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Erreur HTTP ${response.status}`);
  }

  return response.json();
}

/** Fetch single seal detail */
async function fetchSealDetail(
  sealId: string,
  getToken: () => Promise<string | null>
): Promise<{ seal: SealDetail }> {
  const authHeaders = await getAuthHeaders(getToken);
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...authHeaders,
  };

  const response = await fetch(`${API_URL}/api/v1/seals/${sealId}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Erreur HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Hook for infinite scroll list of user's seals
 */
export function useSealsInfiniteQuery(
  filters: SealFilters = {},
  limit: number = 20
) {
  const { getToken, userId } = useAuth();

  return useInfiniteQuery({
    queryKey: ['seals', 'list', filters, userId],
    queryFn: ({ pageParam = 1 }) =>
      fetchSeals(pageParam, limit, filters, getToken),
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    enabled: !!userId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook for single seal detail
 */
export function useSealDetailQuery(sealId: string | null) {
  const { getToken, userId } = useAuth();

  return useQuery({
    queryKey: ['seals', 'detail', sealId, userId],
    queryFn: () => fetchSealDetail(sealId!, getToken),
    enabled: !!sealId && !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Helper to get total seals count from infinite query
 */
export function getTotalSealsCount(
  data: { pages: SealsListResponse[] } | undefined
): number {
  if (!data?.pages.length) return 0;
  return data.pages[0].total;
}

/**
 * Helper to flatten all seals from infinite query pages
 */
export function getAllSeals(
  data: { pages: SealsListResponse[] } | undefined
): SealRecord[] {
  if (!data?.pages.length) return [];
  return data.pages.flatMap((page) => page.seals);
}

/** JSON export response */
export interface JsonExportResponse {
  export_version: string;
  seal_id: string;
  content_hash: string;
  perceptual_hash?: string;
  media_type: string;
  file_size?: number;
  metadata: SealMetadata;
  trust_tier: {
    level: number;
    label: string;
    description: string;
  };
  captured_at: string;
  created_at: string;
  signature: string;
  public_key: string;
  qrng_entropy: string;
  qrng_source: string;
  c2pa_manifest_embedded: boolean;
  veritas: {
    version: string;
    exported_at: string;
    verification_url: string;
    signature_algorithm: string;
    hash_algorithm: string;
  };
}

/** C2PA export response */
export interface C2paExportResponse {
  manifest: object;
  quantum_seal: {
    label: string;
    version: number;
    qrng_entropy: string;
    qrng_source: string;
    entropy_timestamp: number;
    capture_timestamp: number;
    ml_dsa_signature: string;
    ml_dsa_public_key: string;
    content_hash: string;
    perceptual_hash?: string;
  };
  export_info: {
    c2pa_version: string;
    claim_generator: string;
    exported_at: string;
    usage_note: string;
  };
}

/** Export seal in specified format */
async function exportSeal(
  sealId: string,
  format: ExportFormat,
  getToken: () => Promise<string | null>
): Promise<JsonExportResponse | C2paExportResponse> {
  const params = new URLSearchParams({ format });

  const authHeaders = await getAuthHeaders(getToken);
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...authHeaders,
  };

  const response = await fetch(
    `${API_URL}/api/v1/seals/${sealId}/export?${params}`,
    {
      method: 'GET',
      headers,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Erreur HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Hook for exporting seals
 */
export function useSealExport() {
  const { getToken } = useAuth();

  const downloadExport = useCallback(
    async (sealId: string, format: ExportFormat) => {
      const data = await exportSeal(sealId, format, getToken);

      // Create filename
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `veritas-seal-${sealId.slice(0, 8)}-${format}-${timestamp}.json`;

      // Create blob and trigger download
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    },
    [getToken]
  );

  return { downloadExport };
}
