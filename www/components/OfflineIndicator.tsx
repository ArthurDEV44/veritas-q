'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, CloudOff, RefreshCw, Loader2, CheckCircle } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';

interface OfflineIndicatorProps {
  /** Show compact version (just icon and count) */
  compact?: boolean;
  /** Show as fixed banner at top */
  banner?: boolean;
}

export default function OfflineIndicator({
  compact = false,
  banner = false,
}: OfflineIndicatorProps) {
  const { isOffline, pendingCount, isSyncing, syncAll, lastSyncError } =
    useOfflineSync();

  // Nothing to show if online and no pending
  if (!isOffline && pendingCount === 0 && !isSyncing) {
    return null;
  }

  // Compact mode - just shows status icon
  if (compact) {
    return (
      <AnimatePresence>
        {(isOffline || pendingCount > 0) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
              isOffline
                ? 'bg-amber-500/20 text-amber-400'
                : isSyncing
                  ? 'bg-quantum/20 text-quantum'
                  : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            {isOffline ? (
              <WifiOff className="w-3 h-3" />
            ) : isSyncing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <CloudOff className="w-3 h-3" />
            )}
            {pendingCount > 0 && <span>{pendingCount}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Banner mode - fixed at top
  if (banner) {
    return (
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-0 left-0 right-0 z-50 px-4 py-2 bg-amber-500/90 backdrop-blur-sm text-black text-center text-sm font-medium"
          >
            <div className="flex items-center justify-center gap-2">
              <WifiOff className="w-4 h-4" />
              <span>Mode Hors-ligne</span>
              {pendingCount > 0 && (
                <span className="px-2 py-0.5 bg-black/20 rounded-full text-xs">
                  {pendingCount} en attente
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Full mode - detailed status card
  return (
    <AnimatePresence>
      {(isOffline || pendingCount > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className={`rounded-xl border p-4 ${
            isOffline
              ? 'bg-amber-500/10 border-amber-500/30'
              : isSyncing
                ? 'bg-quantum/10 border-quantum/30'
                : lastSyncError
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-amber-500/10 border-amber-500/30'
          }`}
        >
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                isOffline
                  ? 'bg-amber-500/20'
                  : isSyncing
                    ? 'bg-quantum/20'
                    : lastSyncError
                      ? 'bg-red-500/20'
                      : 'bg-amber-500/20'
              }`}
            >
              {isOffline ? (
                <WifiOff className="w-5 h-5 text-amber-400" />
              ) : isSyncing ? (
                <Loader2 className="w-5 h-5 text-quantum animate-spin" />
              ) : lastSyncError ? (
                <CloudOff className="w-5 h-5 text-red-400" />
              ) : (
                <CloudOff className="w-5 h-5 text-amber-400" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4
                className={`font-medium ${
                  isOffline
                    ? 'text-amber-400'
                    : isSyncing
                      ? 'text-quantum'
                      : lastSyncError
                        ? 'text-red-400'
                        : 'text-amber-400'
                }`}
              >
                {isOffline
                  ? 'Mode Hors-ligne'
                  : isSyncing
                    ? 'Synchronisation en cours...'
                    : lastSyncError
                      ? 'Erreur de synchronisation'
                      : 'Captures en attente'}
              </h4>

              <p className="text-sm text-foreground/60 mt-1">
                {isOffline
                  ? 'Vos captures seront synchronisees au retour de la connexion.'
                  : isSyncing
                    ? `Synchronisation de ${pendingCount} capture(s)...`
                    : lastSyncError
                      ? lastSyncError
                      : `${pendingCount} capture(s) en attente de synchronisation.`}
              </p>

              {/* Action button */}
              {!isOffline && !isSyncing && pendingCount > 0 && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={syncAll}
                  className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-quantum/20 hover:bg-quantum/30 text-quantum rounded-lg text-sm font-medium transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Synchroniser maintenant</span>
                </motion.button>
              )}
            </div>

            {/* Pending count badge */}
            {pendingCount > 0 && (
              <div
                className={`px-2.5 py-1 rounded-full text-sm font-medium ${
                  isOffline
                    ? 'bg-amber-500/20 text-amber-400'
                    : isSyncing
                      ? 'bg-quantum/20 text-quantum'
                      : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                {pendingCount}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Sync success notification that appears briefly
 */
export function SyncSuccessToast({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 bg-green-500/90 backdrop-blur-sm text-white rounded-xl shadow-lg"
      onAnimationComplete={() => {
        setTimeout(onClose, 3000);
      }}
    >
      <CheckCircle className="w-5 h-5" />
      <span className="font-medium">Synchronisation terminee !</span>
    </motion.div>
  );
}
