import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  offlineDb,
  type PendingCapture,
  computeHash,
  generateLocalId,
  generateThumbnail,
  generateVideoThumbnail,
} from '@/lib/offlineDb';
import type { SealResponse, SealInput } from '@/hooks/useSealMutation';
import { API_URL, getAuthHeaders } from '@/lib/api';

export interface OfflineState {
  /** Number of pending captures waiting for sync */
  pendingCount: number;
  /** Currently syncing capture IDs */
  syncingIds: Set<string>;
  /** Whether sync is in progress */
  isSyncing: boolean;
  /** Last sync timestamp */
  lastSyncAt: number | null;
  /** Last sync error message */
  lastSyncError: string | null;
}

export interface OfflineActions {
  /** Add a new capture to the offline queue */
  addPendingCapture: (
    blob: Blob,
    filename: string,
    mediaType: 'image' | 'video' | 'audio',
    options?: {
      location?: SealInput['location'];
      deviceAttestation?: string;
    }
  ) => Promise<string>;

  /** Get all pending captures */
  getPendingCaptures: () => Promise<PendingCapture[]>;

  /** Remove a pending capture (after successful sync or manual deletion) */
  removePendingCapture: (localId: string) => Promise<void>;

  /** Sync a single pending capture */
  syncCapture: (
    localId: string,
    getToken: () => Promise<string | null>
  ) => Promise<SealResponse | null>;

  /** Sync all pending captures */
  syncAllPending: (getToken: () => Promise<string | null>) => Promise<void>;

  /** Update pending count from database */
  refreshPendingCount: () => Promise<void>;

  /** Retry a failed capture */
  retryCapture: (
    localId: string,
    getToken: () => Promise<string | null>
  ) => Promise<void>;

  /** Clear all pending captures */
  clearAllPending: () => Promise<void>;

  /** Mark a capture as failed */
  markCaptureFailed: (localId: string, error: string) => Promise<void>;
}

export type OfflineStore = OfflineState & OfflineActions;

export const useOfflineStore = create<OfflineStore>()(
  persist(
    (set, get) => ({
      // Initial state
      pendingCount: 0,
      syncingIds: new Set(),
      isSyncing: false,
      lastSyncAt: null,
      lastSyncError: null,

      // Actions
      addPendingCapture: async (blob, filename, mediaType, options) => {
        const localId = generateLocalId();
        const arrayBuffer = await blob.arrayBuffer();
        const localHash = await computeHash(arrayBuffer);

        // Generate thumbnail
        let thumbnail: string | undefined;
        if (mediaType === 'image') {
          thumbnail = await generateThumbnail(blob);
        } else if (mediaType === 'video') {
          thumbnail = await generateVideoThumbnail(blob);
        }

        const pendingCapture: PendingCapture = {
          localId,
          mediaData: arrayBuffer,
          filename,
          mimeType: blob.type,
          mediaType,
          fileSize: blob.size,
          localHash,
          thumbnail,
          capturedAt: Date.now(),
          location: options?.location,
          deviceAttestation: options?.deviceAttestation,
          status: 'pending',
          syncAttempts: 0,
        };

        await offlineDb.pendingCaptures.add(pendingCapture);
        await get().refreshPendingCount();

        return localId;
      },

      getPendingCaptures: async () => {
        return offlineDb.pendingCaptures
          .orderBy('capturedAt')
          .reverse()
          .toArray();
      },

      removePendingCapture: async (localId) => {
        await offlineDb.pendingCaptures.where('localId').equals(localId).delete();
        await get().refreshPendingCount();
      },

      syncCapture: async (localId, getToken) => {
        const { syncingIds } = get();

        // Already syncing this capture
        if (syncingIds.has(localId)) {
          return null;
        }

        // Get the capture from DB
        const capture = await offlineDb.pendingCaptures
          .where('localId')
          .equals(localId)
          .first();

        if (!capture) {
          console.warn(`Capture ${localId} not found in offline DB`);
          return null;
        }

        // Mark as syncing
        set({
          syncingIds: new Set([...syncingIds, localId]),
          isSyncing: true,
        });

        // Update status in DB
        await offlineDb.pendingCaptures
          .where('localId')
          .equals(localId)
          .modify({
            status: 'syncing',
            lastSyncAttempt: Date.now(),
            syncAttempts: capture.syncAttempts + 1,
          });

        try {
          // Create blob from stored data
          const blob = new Blob([capture.mediaData], { type: capture.mimeType });

          // Build form data
          const formData = new FormData();
          formData.append('file', blob, capture.filename);
          formData.append('media_type', capture.mediaType);

          if (capture.deviceAttestation) {
            formData.append('device_attestation', capture.deviceAttestation);
          }

          if (capture.location) {
            formData.append('location', JSON.stringify(capture.location));
          }

          // Build headers
          let headers: HeadersInit = {};
          try {
            headers = await getAuthHeaders(getToken);
          } catch {
            // Offline mode - will retry when online with auth
          }

          // Make API call
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

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

          const sealResponse: SealResponse = await response.json();

          // Success! Store synced seal reference and remove pending
          await offlineDb.syncedSeals.add({
            sealId: sealResponse.seal_id,
            localId,
            timestamp: sealResponse.timestamp,
            trustTier: sealResponse.trust_tier,
            hasDeviceAttestation: sealResponse.has_device_attestation,
            thumbnail: capture.thumbnail,
            syncedAt: Date.now(),
          });

          // Remove from pending
          await get().removePendingCapture(localId);

          // Update state
          const newSyncingIds = new Set(get().syncingIds);
          newSyncingIds.delete(localId);

          set({
            syncingIds: newSyncingIds,
            isSyncing: newSyncingIds.size > 0,
            lastSyncAt: Date.now(),
            lastSyncError: null,
          });

          return sealResponse;
        } catch (error) {
          // Mark as failed
          const errorMessage =
            error instanceof Error ? error.message : 'Erreur de synchronisation';

          await offlineDb.pendingCaptures
            .where('localId')
            .equals(localId)
            .modify({
              status: 'failed',
              errorMessage,
            });

          // Update state
          const newSyncingIds = new Set(get().syncingIds);
          newSyncingIds.delete(localId);

          set({
            syncingIds: newSyncingIds,
            isSyncing: newSyncingIds.size > 0,
            lastSyncError: errorMessage,
          });

          console.error(`Failed to sync capture ${localId}:`, error);
          return null;
        }
      },

      syncAllPending: async (getToken) => {
        const captures = await offlineDb.pendingCaptures
          .where('status')
          .anyOf(['pending', 'failed'])
          .toArray();

        if (captures.length === 0) {
          return;
        }

        set({ isSyncing: true });

        // Sync each capture sequentially to avoid overwhelming the API
        for (const capture of captures) {
          // Skip if already syncing
          if (get().syncingIds.has(capture.localId)) {
            continue;
          }

          await get().syncCapture(capture.localId, getToken);

          // Small delay between syncs
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        set({ isSyncing: false });
      },

      refreshPendingCount: async () => {
        const count = await offlineDb.pendingCaptures.count();
        set({ pendingCount: count });
      },

      retryCapture: async (localId, getToken) => {
        // Reset status to pending
        await offlineDb.pendingCaptures
          .where('localId')
          .equals(localId)
          .modify({
            status: 'pending',
            errorMessage: undefined,
          });

        // Attempt sync
        await get().syncCapture(localId, getToken);
      },

      clearAllPending: async () => {
        await offlineDb.pendingCaptures.clear();
        set({ pendingCount: 0 });
      },

      markCaptureFailed: async (localId, error) => {
        await offlineDb.pendingCaptures
          .where('localId')
          .equals(localId)
          .modify({
            status: 'failed',
            errorMessage: error,
          });
      },
    }),
    {
      name: 'veritas-offline-state',
      storage: createJSONStorage(() => localStorage),
      // Only persist certain fields, not the full state
      partialize: (state) => ({
        pendingCount: state.pendingCount,
        lastSyncAt: state.lastSyncAt,
      }),
    }
  )
);

// Initialize pending count on load
if (typeof window !== 'undefined') {
  // Defer to avoid hydration issues
  setTimeout(() => {
    useOfflineStore.getState().refreshPendingCount();
  }, 100);
}
