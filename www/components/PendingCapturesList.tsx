'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image as ImageIcon,
  Video,
  MapPin,
  Clock,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '@clerk/nextjs';
import { useOfflineStore } from '@/stores/offlineStore';
import type { PendingCapture } from '@/lib/offlineDb';
import PendingSealBadge from './PendingSealBadge';

interface PendingCapturesListProps {
  /** Show as collapsible section */
  collapsible?: boolean;
  /** Maximum items to show (rest behind "show more") */
  maxItems?: number;
}

export default function PendingCapturesList({
  collapsible = false,
  maxItems = 5,
}: PendingCapturesListProps) {
  const { userId } = useAuth();
  const {
    pendingCount,
    getPendingCaptures,
    removePendingCapture,
    syncCapture,
    isSyncing,
  } = useOfflineStore();

  const [captures, setCaptures] = useState<PendingCapture[]>([]);
  const [isExpanded, setIsExpanded] = useState(!collapsible);
  const [showAll, setShowAll] = useState(false);

  // Load captures
  useEffect(() => {
    const loadCaptures = async () => {
      const pending = await getPendingCaptures();
      setCaptures(pending);
    };

    loadCaptures();

    // Refresh when pending count changes
    const interval = setInterval(loadCaptures, 2000);
    return () => clearInterval(interval);
  }, [getPendingCaptures, pendingCount]);

  if (captures.length === 0) {
    return null;
  }

  const displayedCaptures = showAll ? captures : captures.slice(0, maxItems);
  const hasMore = captures.length > maxItems;

  const handleRetry = async (localId: string) => {
    await syncCapture(localId, userId ?? null);
    // Refresh captures
    const pending = await getPendingCaptures();
    setCaptures(pending);
  };

  const handleDelete = async (localId: string) => {
    if (confirm('Supprimer cette capture en attente ?')) {
      await removePendingCapture(localId);
      // Refresh captures
      const pending = await getPendingCaptures();
      setCaptures(pending);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      {collapsible ? (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 bg-surface-elevated rounded-xl border border-border hover:bg-surface-elevated/80 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-left">
              <h4 className="font-medium text-foreground">
                Captures en attente
              </h4>
              <p className="text-xs text-foreground/60">
                {captures.length} capture(s) en attente de synchronisation
              </p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-foreground/40" />
          ) : (
            <ChevronDown className="w-5 h-5 text-foreground/40" />
          )}
        </button>
      ) : (
        <h4 className="text-sm font-medium text-foreground/60 px-1">
          Captures en attente ({captures.length})
        </h4>
      )}

      {/* List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            {displayedCaptures.map((capture) => (
              <motion.div
                key={capture.localId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-3 p-3 bg-surface-elevated rounded-xl border border-border"
              >
                {/* Thumbnail */}
                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-surface flex-shrink-0">
                  {capture.thumbnail ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={capture.thumbnail}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {capture.mediaType === 'video' ? (
                        <Video className="w-6 h-6 text-foreground/40" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-foreground/40" />
                      )}
                    </div>
                  )}

                  {/* Media type badge */}
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white font-medium">
                    {capture.mediaType === 'video' ? 'VID' : 'IMG'}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <PendingSealBadge status={capture.status} size="small" />
                  </div>

                  <p className="text-xs text-foreground/60 mt-1 truncate">
                    {formatDate(capture.capturedAt)} • {formatFileSize(capture.fileSize)}
                  </p>

                  {capture.location && (
                    <p className="text-xs text-foreground/40 mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>
                        {capture.location.lat.toFixed(4)}, {capture.location.lng.toFixed(4)}
                      </span>
                    </p>
                  )}

                  {capture.status === 'failed' && capture.errorMessage && (
                    <p className="text-xs text-red-400 mt-1 truncate">
                      {capture.errorMessage}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {capture.status === 'failed' && (
                    <button
                      onClick={() => handleRetry(capture.localId)}
                      disabled={isSyncing}
                      className="p-2 rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
                      title="Reessayer"
                    >
                      <RefreshCw className="w-4 h-4 text-quantum" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(capture.localId)}
                    disabled={capture.status === 'syncing'}
                    className="p-2 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </motion.div>
            ))}

            {/* Show more button */}
            {hasMore && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full py-2 text-sm text-quantum hover:text-quantum-dim transition-colors"
              >
                Voir {captures.length - maxItems} capture(s) de plus
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
