'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Shield, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import SealList from '@/components/SealList';
import SealFilters from '@/components/SealFilters';
import type { SealFilters as SealFiltersType } from '@/hooks/useSealsQuery';

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
        hasLocation === 'true' ? true : hasLocation === 'false' ? false : undefined,
    };
  });

  const [view, setView] = useState<'grid' | 'list'>(() => {
    const savedView =
      typeof window !== 'undefined'
        ? localStorage.getItem('seals_view')
        : null;
    return (savedView as 'grid' | 'list') || 'grid';
  });

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();

    if (filters.media_type) {
      params.set('media_type', filters.media_type);
    }
    if (filters.has_location !== undefined) {
      params.set('has_location', String(filters.has_location));
    }

    const newUrl = params.toString()
      ? `/dashboard/seals?${params.toString()}`
      : '/dashboard/seals';

    router.replace(newUrl, { scroll: false });
  }, [filters, router]);

  // Persist view preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('seals_view', view);
    }
  }, [view]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 -ml-2 rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-foreground/60" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-quantum/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-quantum" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Mes Seals
                </h1>
                <p className="text-foreground/60 text-sm">
                  Historique de vos medias authentifies
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <SealFilters
        filters={filters}
        onFiltersChange={setFilters}
        view={view}
        onViewChange={setView}
      />

      {/* Seal list with infinite scroll */}
      <div className="animate-[slideUp_0.3s_ease-out]">
        <SealList filters={filters} view={view} />
      </div>
    </div>
  );
}

function SealsPageFallback() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 -ml-2 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-foreground/60" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-quantum/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-quantum" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Mes Seals</h1>
                <p className="text-foreground/60 text-sm">Historique de vos medias authentifies</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-quantum" />
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
