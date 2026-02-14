'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, CloudOff, Loader2 } from 'lucide-react';
import { useServiceWorker } from '@/hooks/useServiceWorker';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Alert, AlertTitle, AlertDescription, AlertAction } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Unified connectivity status component.
 * Replaces both PWAStatus and OfflineIndicator.
 *
 * - Online with no pending: hidden
 * - Offline: Alert variant="warning" fixed at bottom
 * - Update available: Alert variant="info" with update button
 * - Pending captures (online): compact Alert with sync action
 */
export default function ConnectivityStatus() {
  const { isOffline, updateAvailable, applyUpdate } = useServiceWorker();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  if (!mounted) return null;

  const showOffline = isOffline;
  const showUpdate = updateAvailable && !isOffline;

  if (!showOffline && !showUpdate) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] flex flex-col gap-2 max-w-md mx-auto animate-[slideUp_0.3s_ease-out]">
      {showOffline && (
        <Alert variant="warning">
          <WifiOff className="size-4" />
          <AlertTitle>Hors connexion</AlertTitle>
          <AlertDescription>
            Fonctionnalites limitees - les captures seront synchronisees au retour de la connexion.
          </AlertDescription>
        </Alert>
      )}

      {showUpdate && (
        <Alert variant="info">
          <RefreshCw className="size-4" />
          <AlertTitle>Nouvelle version disponible</AlertTitle>
          <AlertAction>
            <Button size="xs" onClick={applyUpdate}>
              Mettre a jour
            </Button>
          </AlertAction>
        </Alert>
      )}
    </div>
  );
}

/**
 * Compact connectivity indicator for inline use (e.g. in camera toolbar).
 * Shows offline/syncing/pending status as a small badge or card.
 */
interface ConnectivityIndicatorProps {
  compact?: boolean;
  banner?: boolean;
}

export function ConnectivityIndicator({
  compact = false,
  banner = false,
}: ConnectivityIndicatorProps) {
  const { isOffline } = useServiceWorker();
  const { pendingCount, isSyncing, syncAll, lastSyncError } = useOfflineSync();

  if (!isOffline && pendingCount === 0 && !isSyncing) return null;

  // Compact mode: small badge
  if (compact) {
    return (
      <Badge
        variant={isOffline ? 'warning' : isSyncing ? 'default' : 'warning'}
        size="sm"
        className="gap-1 animate-[scaleIn_0.3s_ease-out]"
      >
        {isOffline ? (
          <WifiOff className="size-3" />
        ) : isSyncing ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <CloudOff className="size-3" />
        )}
        {pendingCount > 0 && <span>{pendingCount}</span>}
      </Badge>
    );
  }

  // Banner mode: fixed at top
  if (banner && isOffline) {
    return (
      <Alert variant="warning" className="animate-[slideDown_0.3s_ease-out]">
        <WifiOff className="size-4" />
        <AlertTitle>Mode Hors-ligne</AlertTitle>
        {pendingCount > 0 && (
          <AlertAction>
            <Badge variant="warning" size="sm">{pendingCount} en attente</Badge>
          </AlertAction>
        )}
      </Alert>
    );
  }

  // Full mode: detailed status
  return (
    <Alert
      variant={isOffline ? 'warning' : lastSyncError ? 'error' : isSyncing ? 'info' : 'warning'}
      className="animate-[slideDown_0.3s_ease-out]"
    >
      {isOffline ? (
        <WifiOff className="size-4" />
      ) : isSyncing ? (
        <Loader2 className="size-4 animate-spin" />
      ) : lastSyncError ? (
        <CloudOff className="size-4" />
      ) : (
        <CloudOff className="size-4" />
      )}
      <AlertTitle>
        {isOffline
          ? 'Mode Hors-ligne'
          : isSyncing
            ? 'Synchronisation en cours...'
            : lastSyncError
              ? 'Erreur de synchronisation'
              : 'Captures en attente'}
      </AlertTitle>
      <AlertDescription>
        {isOffline
          ? 'Vos captures seront synchronisees au retour de la connexion.'
          : isSyncing
            ? `Synchronisation de ${pendingCount} capture(s)...`
            : lastSyncError
              ? lastSyncError
              : `${pendingCount} capture(s) en attente de synchronisation.`}
      </AlertDescription>
      {!isOffline && !isSyncing && pendingCount > 0 && (
        <AlertAction>
          <Button size="xs" variant="ghost" onClick={syncAll} className="gap-1.5">
            <RefreshCw className="size-3.5" />
            Synchroniser
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
