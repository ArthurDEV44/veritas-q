'use client';

import Link from 'next/link';
import {
  Shield,
  Filter,
  Camera,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertAction,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import SealCard, { SealCardSkeleton } from './SealCard';
import type { SealRecord } from '@/hooks/useSealsQuery';

interface SealListProps {
  seals: SealRecord[];
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
  view: 'grid' | 'list';
  hasActiveFilters: boolean;
  onRetry: () => void;
  onClearFilters: () => void;
  isFetching?: boolean;
}

export default function SealList({
  seals,
  isLoading,
  isError,
  error,
  view,
  hasActiveFilters,
  onRetry,
  onClearFilters,
  isFetching,
}: SealListProps) {
  // Loading state: CossUI Skeleton grid/list
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

  // Error state: CossUI Alert variant="error"
  if (isError) {
    return (
      <Alert variant="error">
        <AlertCircle />
        <AlertTitle>Erreur de chargement</AlertTitle>
        <AlertDescription>
          {error instanceof Error
            ? error.message
            : 'Impossible de charger les seals. Veuillez reessayer.'}
        </AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw />
            Reessayer
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  // Empty state (no seals at all): CossUI Empty with shield icon
  if (seals.length === 0 && !hasActiveFilters) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Shield />
          </EmptyMedia>
          <EmptyTitle>Aucun seal trouve</EmptyTitle>
          <EmptyDescription>
            Vous n&apos;avez pas encore cree de seal. Capturez votre premier
            media pour commencer !
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link href="/" />}>
            <Camera />
            Capturer un media
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  // Empty filtered state: CossUI Empty with filter icon
  if (seals.length === 0 && hasActiveFilters) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Filter />
          </EmptyMedia>
          <EmptyTitle>Aucun resultat</EmptyTitle>
          <EmptyDescription>
            Aucun seal ne correspond aux filtres selectionnes. Essayez de
            modifier vos criteres.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={onClearFilters}>
            Modifier les filtres
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  // Data state
  return (
    <div
      className={
        isFetching ? 'opacity-60 transition-opacity duration-200' : ''
      }
    >
      {/* Grid view: responsive grid */}
      {view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {seals.map((seal, index) => (
            <div
              key={seal.id}
              className="stagger-item"
              style={{
                animationDelay: `${Math.min(index, 11) * 50}ms`,
              }}
            >
              <SealCard seal={seal} />
            </div>
          ))}
        </div>
      ) : (
        /* List view: stacked compact cards with CossUI Separator */
        <div>
          {seals.map((seal, index) => (
            <div key={seal.id}>
              {index > 0 && <Separator />}
              <div
                className="stagger-item-right"
                style={{
                  animationDelay: `${Math.min(index, 11) * 50}ms`,
                }}
              >
                <SealCard seal={seal} compact />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
