'use client';

import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, FileX2, RefreshCw } from 'lucide-react';
import {
  useSealsInfiniteQuery,
  getAllSeals,
  getTotalSealsCount,
  type SealFilters,
} from '@/hooks/useSealsQuery';
import SealCard, { SealCardSkeleton } from './SealCard';

interface SealListProps {
  /** Filter options */
  filters?: SealFilters;
  /** Display mode */
  view?: 'grid' | 'list';
  /** Number of items per page */
  pageSize?: number;
}

export default function SealList({
  filters = {},
  view = 'grid',
  pageSize = 20,
}: SealListProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useSealsInfiniteQuery(filters, pageSize);

  const seals = getAllSeals(data);
  const totalCount = getTotalSealsCount(data);

  // Setup intersection observer for infinite scroll
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    observerRef.current = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '100px',
      threshold: 0,
    });

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [handleObserver]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SealCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <SealCardSkeleton key={i} compact />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <FileX2 className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-red-500 mb-2">
          Erreur de chargement
        </h3>
        <p className="text-foreground/60 text-sm text-center mb-4 max-w-md">
          {error instanceof Error
            ? error.message
            : 'Impossible de charger les seals. Veuillez reessayer.'}
        </p>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-surface-elevated hover:bg-surface rounded-lg border border-border transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Reessayer</span>
        </motion.button>
      </div>
    );
  }

  // Empty state
  if (seals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="w-16 h-16 rounded-full bg-surface-elevated flex items-center justify-center mb-4">
          <FileX2 className="w-8 h-8 text-foreground/40" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Aucun seal trouve
        </h3>
        <p className="text-foreground/60 text-sm text-center max-w-md">
          {Object.keys(filters).length > 0
            ? 'Aucun seal ne correspond aux filtres selectionnes. Essayez de modifier vos criteres.'
            : "Vous n'avez pas encore cree de seal. Capturez votre premier media pour commencer !"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Results count */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-foreground/60">
          {totalCount} seal{totalCount > 1 ? 's' : ''} trouve{totalCount > 1 ? 's' : ''}
        </p>
      </div>

      {/* Seals grid/list */}
      <AnimatePresence mode="popLayout">
        {view === 'grid' ? (
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {seals.map((seal, index) => (
              <motion.div
                key={seal.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05, duration: 0.2 }}
              >
                <SealCard seal={seal} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div layout className="space-y-2">
            {seals.map((seal, index) => (
              <motion.div
                key={seal.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.03, duration: 0.2 }}
              >
                <SealCard seal={seal} compact />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Load more trigger (for infinite scroll) */}
      <div ref={loadMoreRef} className="py-4 flex justify-center">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-foreground/60">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Chargement...</span>
          </div>
        )}
        {!hasNextPage && seals.length > 0 && (
          <p className="text-sm text-foreground/40">
            Tous les seals ont ete charges
          </p>
        )}
      </div>
    </div>
  );
}
