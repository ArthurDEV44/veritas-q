'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useServiceWorker } from './useServiceWorker';
import { useOfflineStore } from '@/stores/offlineStore';

interface UseOfflineSyncOptions {
  /** Auto-sync when coming back online (default: true) */
  autoSync?: boolean;
  /** Show notification when sync completes (default: true) */
  showNotifications?: boolean;
}

interface UseOfflineSyncReturn {
  /** Number of captures pending sync */
  pendingCount: number;
  /** Whether sync is currently in progress */
  isSyncing: boolean;
  /** Whether the device is offline */
  isOffline: boolean;
  /** Last sync timestamp */
  lastSyncAt: number | null;
  /** Last sync error */
  lastSyncError: string | null;
  /** Manually trigger sync of all pending captures */
  syncAll: () => Promise<void>;
  /** Retry a specific failed capture */
  retryCapture: (localId: string) => Promise<void>;
  /** Clear all pending captures */
  clearAll: () => Promise<void>;
}

/**
 * Hook to manage offline sync behavior
 * - Auto-syncs when coming back online
 * - Provides sync progress and status
 * - Handles notifications
 */
export function useOfflineSync(
  options: UseOfflineSyncOptions = {}
): UseOfflineSyncReturn {
  const { autoSync = true, showNotifications = true } = options;

  const { getToken } = useAuth();
  const { isOffline } = useServiceWorker();

  const {
    pendingCount,
    isSyncing,
    lastSyncAt,
    lastSyncError,
    syncAllPending,
    retryCapture: storeRetryCapture,
    clearAllPending,
    refreshPendingCount,
  } = useOfflineStore();

  // Track previous offline state to detect online transition
  const wasOfflineRef = useRef(isOffline);

  // Sync all pending captures
  const syncAll = useCallback(async () => {
    if (isOffline) {
      console.log('Cannot sync while offline');
      return;
    }

    await syncAllPending(getToken);

    // Show notification if enabled
    if (showNotifications && 'Notification' in window) {
      const finalPendingCount = useOfflineStore.getState().pendingCount;
      if (finalPendingCount === 0) {
        showSyncNotification('Synchronisation terminee', 'Tous les medias ont ete scelles.');
      }
    }
  }, [isOffline, syncAllPending, getToken, showNotifications]);

  // Retry a specific capture
  const retryCapture = useCallback(
    async (localId: string) => {
      if (isOffline) {
        console.log('Cannot retry while offline');
        return;
      }

      await storeRetryCapture(localId, getToken);
    },
    [isOffline, storeRetryCapture, getToken]
  );

  // Clear all pending
  const clearAll = useCallback(async () => {
    await clearAllPending();
  }, [clearAllPending]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (!autoSync) return;

    // Check if we just came back online
    if (wasOfflineRef.current && !isOffline) {
      console.log('Back online - checking for pending captures to sync');

      // Small delay to ensure network is stable
      const timeoutId = setTimeout(() => {
        refreshPendingCount().then(() => {
          const count = useOfflineStore.getState().pendingCount;
          if (count > 0) {
            console.log(`Found ${count} pending captures - starting auto-sync`);

            // Show notification that sync is starting
            if (showNotifications && 'Notification' in window) {
              showSyncNotification(
                'Connexion retablie',
                `Synchronisation de ${count} media(s) en cours...`
              );
            }

            syncAll();
          }
        });
      }, 1000);

      return () => clearTimeout(timeoutId);
    }

    // Update ref
    wasOfflineRef.current = isOffline;
  }, [isOffline, autoSync, refreshPendingCount, syncAll, showNotifications]);

  // Refresh pending count on mount
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Register for background sync if available
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
      return;
    }

    // Register background sync when we have pending captures
    const registerBackgroundSync = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        if ('sync' in registration) {
          await (registration as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-pending-captures');
          console.log('Background sync registered');
        }
      } catch (error) {
        console.warn('Background sync registration failed:', error);
      }
    };

    if (pendingCount > 0) {
      registerBackgroundSync();
    }
  }, [pendingCount]);

  // Listen for service worker messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_PENDING_CAPTURES') {
        console.log('Received sync request from service worker');
        syncAll();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [syncAll]);

  // Notify service worker when sync completes
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    // When sync completes and we had pending items
    if (!isSyncing && lastSyncAt && pendingCount === 0) {
      navigator.serviceWorker.ready.then((registration) => {
        if (registration.active) {
          registration.active.postMessage({
            type: 'SYNC_COMPLETE',
            count: 0,
            timestamp: lastSyncAt,
          });
        }
      });
    }
  }, [isSyncing, lastSyncAt, pendingCount]);

  return {
    pendingCount,
    isSyncing,
    isOffline,
    lastSyncAt,
    lastSyncError,
    syncAll,
    retryCapture,
    clearAll,
  };
}

/**
 * Show a notification for sync status
 */
function showSyncNotification(title: string, body: string) {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      tag: 'veritas-sync',
      silent: true,
    });
  } else if (Notification.permission === 'default') {
    // Request permission
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          tag: 'veritas-sync',
          silent: true,
        });
      }
    });
  }
}
