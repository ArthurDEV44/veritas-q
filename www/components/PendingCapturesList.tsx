'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Video,
  MapPin,
  Clock,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@clerk/nextjs';
import { useOfflineStore } from '@/stores/offlineStore';
import type { PendingCapture } from '@/lib/offlineDb';
import { formatTimestamp, formatFileSize } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress, ProgressTrack, ProgressIndicator } from '@/components/ui/progress';

interface PendingCapturesListProps {
  collapsible?: boolean;
  maxItems?: number;
}

const statusBadgeMap = {
  pending: { variant: 'warning' as const, label: 'En attente', Icon: Clock },
  syncing: { variant: 'default' as const, label: 'Synchronisation...', Icon: RefreshCw },
  failed: { variant: 'error' as const, label: 'Echec', Icon: null },
} as const;

export default function PendingCapturesList({
  collapsible = false,
  maxItems = 5,
}: PendingCapturesListProps) {
  const { getToken } = useAuth();
  const {
    pendingCount,
    getPendingCaptures,
    removePendingCapture,
    syncCapture,
    isSyncing,
  } = useOfflineStore();

  const [captures, setCaptures] = useState<PendingCapture[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadCaptures = useCallback(async () => {
    const pending = await getPendingCaptures();
    setCaptures(pending);
  }, [getPendingCaptures]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => { loadCaptures(); interval = setInterval(loadCaptures, 2000); };
    const stopPolling = () => { if (interval) { clearInterval(interval); interval = null; } };
    const handleVisibility = () => { if (document.hidden) { stopPolling(); } else { startPolling(); } };
    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { stopPolling(); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [loadCaptures, pendingCount]);

  if (captures.length === 0) return null;

  const displayedCaptures = showAll ? captures : captures.slice(0, maxItems);
  const hasMore = captures.length > maxItems;

  const handleRetry = async (localId: string) => {
    await syncCapture(localId, getToken);
    const pending = await getPendingCaptures();
    setCaptures(pending);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await removePendingCapture(deleteTarget);
    setDeleteTarget(null);
    const pending = await getPendingCaptures();
    setCaptures(pending);
  };

  const captureList = (
    <div className="space-y-2 animate-[fadeIn_0.3s_ease-out] pt-2">
      {displayedCaptures.map((capture) => {
        const statusInfo = statusBadgeMap[capture.status] ?? statusBadgeMap.pending;
        return (
          <Card
            key={capture.localId}
            className="flex-row items-center gap-3 p-3 rounded-xl animate-[slideInLeft_0.3s_ease-out]"
          >
            {/* Thumbnail */}
            <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              {capture.thumbnail ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={capture.thumbnail}
                  alt="Apercu de la capture en attente"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {capture.mediaType === 'video' ? (
                    <Video className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              )}
              <Badge
                variant="secondary"
                size="sm"
                className="absolute top-0.5 left-0.5 px-1 py-0 text-[10px] rounded"
              >
                {capture.mediaType === 'video' ? 'VID' : 'IMG'}
              </Badge>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant={statusInfo.variant} size="sm" className="gap-1">
                  {statusInfo.Icon && (
                    <statusInfo.Icon className={`w-3 h-3 ${capture.status === 'syncing' ? 'animate-spin' : ''}`} />
                  )}
                  {statusInfo.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {formatTimestamp(capture.capturedAt)} &middot; {formatFileSize(capture.fileSize)}
              </p>
              {capture.location && (
                <p className="text-xs text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  <span>
                    {capture.location.lat.toFixed(4)}, {capture.location.lng.toFixed(4)}
                  </span>
                </p>
              )}
              {capture.status === 'syncing' && (
                <Progress value={null} className="mt-1.5">
                  <ProgressTrack className="h-1">
                    <ProgressIndicator className="animate-pulse" />
                  </ProgressTrack>
                </Progress>
              )}
              {capture.status === 'failed' && capture.errorMessage && (
                <p className="text-xs text-destructive mt-1 truncate">
                  {capture.errorMessage}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {capture.status === 'failed' && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRetry(capture.localId)}
                  disabled={isSyncing}
                  aria-label="Reessayer"
                >
                  <RefreshCw className="size-4 text-primary" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDeleteTarget(capture.localId)}
                disabled={capture.status === 'syncing'}
                aria-label="Supprimer"
                className="hover:bg-destructive/10"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </Card>
        );
      })}

      {hasMore && !showAll && (
        <Button
          variant="link"
          size="sm"
          onClick={() => setShowAll(true)}
          className="w-full"
        >
          Voir {captures.length - maxItems} capture(s) de plus
        </Button>
      )}
    </div>
  );

  return (
    <>
      <div className="space-y-3">
        {collapsible ? (
          <Collapsible>
            <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 bg-card rounded-xl border border-border hover:bg-card/80 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-warning" />
                </div>
                <div className="text-left">
                  <h4 className="font-medium text-foreground text-sm">
                    Captures en attente
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {captures.length} capture(s) en attente de synchronisation
                  </p>
                </div>
              </div>
              <Badge variant="warning">{captures.length}</Badge>
            </CollapsibleTrigger>
            <CollapsiblePanel>
              {captureList}
            </CollapsiblePanel>
          </Collapsible>
        ) : (
          <>
            <h4 className="text-sm font-medium text-muted-foreground px-1">
              Captures en attente ({captures.length})
            </h4>
            {captureList}
          </>
        )}
      </div>

      {/* Delete confirmation AlertDialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteTarget(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette capture ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette capture en attente sera definitivement supprimee. Cette action est irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              Annuler
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={handleDeleteConfirm}
            >
              Supprimer
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
