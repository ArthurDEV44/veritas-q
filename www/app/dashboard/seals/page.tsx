'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Shield,
  ArrowLeft,
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import SealList from '@/components/SealList';
import SealFilters from '@/components/SealFilters';
import {
  useSealsPaginatedQuery,
  type SealFilters as SealFiltersType,
} from '@/hooks/useSealsQuery';

const PAGE_SIZE = 20;

/** Generate page number items with ellipsis for large page counts */
function generatePaginationItems(
  currentPage: number,
  totalPages: number
): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items: (number | 'ellipsis')[] = [1];

  if (currentPage > 3) items.push('ellipsis');

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) items.push(i);

  if (currentPage < totalPages - 2) items.push('ellipsis');

  if (totalPages > 1) items.push(totalPages);

  return items;
}

function SealsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize filters from URL params
  const [filters, setFilters] = useState<SealFiltersType>(() => {
    const mediaType = searchParams.get('media_type') as
      | 'image'
      | 'video'
      | 'audio'
      | null;
    const hasLocation = searchParams.get('has_location');

    return {
      media_type: mediaType || undefined,
      has_location:
        hasLocation === 'true'
          ? true
          : hasLocation === 'false'
            ? false
            : undefined,
    };
  });

  const [page, setPage] = useState(() => {
    const p = searchParams.get('page');
    return p ? Math.max(1, parseInt(p, 10)) : 1;
  });

  const [view, setView] = useState<'grid' | 'list'>(() => {
    const savedView =
      typeof window !== 'undefined'
        ? localStorage.getItem('seals_view')
        : null;
    return (savedView as 'grid' | 'list') || 'grid';
  });

  // Paginated query with keepPreviousData for smooth transitions
  const { data, isLoading, isError, error, refetch, isFetching } =
    useSealsPaginatedQuery(filters, page, PAGE_SIZE);

  const seals = data?.seals ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((v) => v !== undefined),
    [filters]
  );

  const paginationItems = useMemo(
    () => generatePaginationItems(page, totalPages),
    [page, totalPages]
  );

  // Update URL when filters or page change
  useEffect(() => {
    const params = new URLSearchParams();

    if (filters.media_type) {
      params.set('media_type', filters.media_type);
    }
    if (filters.has_location !== undefined) {
      params.set('has_location', String(filters.has_location));
    }
    if (page > 1) {
      params.set('page', String(page));
    }

    const newUrl = params.toString()
      ? `/dashboard/seals?${params.toString()}`
      : '/dashboard/seals';

    router.replace(newUrl, { scroll: false });
  }, [filters, page, router]);

  // Persist view preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('seals_view', view);
    }
  }, [view]);

  const handleFiltersChange = (newFilters: SealFiltersType) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            render={<Link href="/dashboard" />}
          >
            <ArrowLeft />
          </Button>
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Mes Seals</h1>
              {total > 0 && (
                <Badge variant="secondary">{total}</Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              Historique de vos medias authentifies
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && <Spinner className="size-4" />}
          <Button render={<Link href="/" />} size="sm">
            <Plus />
            <span className="max-sm:hidden">Nouveau Seal</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <SealFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        view={view}
        onViewChange={setView}
      />

      {/* Seal list */}
      <div className="animate-[slideUp_0.3s_ease-out]">
        <SealList
          seals={seals}
          isLoading={isLoading}
          isError={isError}
          error={error}
          view={view}
          hasActiveFilters={hasActiveFilters}
          onRetry={() => refetch()}
          onClearFilters={() => handleFiltersChange({})}
          isFetching={isFetching && !isLoading}
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && !isLoading && !isError && (
        <Pagination>
          <PaginationContent>
            {/* Previous */}
            <PaginationItem>
              <PaginationLink
                href="#"
                size="default"
                aria-label="Page precedente"
                aria-disabled={page <= 1}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  if (page > 1) handlePageChange(page - 1);
                }}
                className={
                  page <= 1
                    ? 'pointer-events-none opacity-50 max-sm:aspect-square max-sm:p-0'
                    : 'max-sm:aspect-square max-sm:p-0'
                }
              >
                <ChevronLeft className="sm:-ms-1" />
                <span className="max-sm:hidden">Precedent</span>
              </PaginationLink>
            </PaginationItem>

            {/* Page numbers */}
            {paginationItems.map((item, index) =>
              item === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    href="#"
                    isActive={item === page}
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault();
                      handlePageChange(item);
                    }}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              )
            )}

            {/* Next */}
            <PaginationItem>
              <PaginationLink
                href="#"
                size="default"
                aria-label="Page suivante"
                aria-disabled={page >= totalPages}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  if (page < totalPages) handlePageChange(page + 1);
                }}
                className={
                  page >= totalPages
                    ? 'pointer-events-none opacity-50 max-sm:aspect-square max-sm:p-0'
                    : 'max-sm:aspect-square max-sm:p-0'
                }
              >
                <span className="max-sm:hidden">Suivant</span>
                <ChevronRight className="sm:-me-1" />
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {/* Results info */}
      {total > 0 && !isLoading && (
        <p className="text-center text-sm text-muted-foreground">
          {(page - 1) * PAGE_SIZE + 1}&ndash;
          {Math.min(page * PAGE_SIZE, total)} sur {total} seal
          {total > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

function SealsPageFallback() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="size-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-full rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function SealsPage() {
  return (
    <Suspense fallback={<SealsPageFallback />}>
      <SealsPageContent />
    </Suspense>
  );
}
