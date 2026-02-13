'use client';

import Link from 'next/link';
import {
  Image as ImageIcon,
  Video,
  Music,
  MapPin,
  Calendar,
  Shield,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import type { SealRecord } from '@/hooks/useSealsQuery';
import SealBadge, { TrustTier } from './SealBadge';

interface SealCardProps {
  seal: SealRecord;
  /** Whether to show as compact card */
  compact?: boolean;
}

const mediaTypeIcons = {
  image: ImageIcon,
  video: Video,
  audio: Music,
};

const mediaTypeLabels = {
  image: 'Photo',
  video: 'Video',
  audio: 'Audio',
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function trustTierFromNumber(tier: number): TrustTier {
  switch (tier) {
    case 1:
      return 'tier1';
    case 2:
      return 'tier2';
    case 3:
      return 'tier3';
    default:
      return 'tier1';
  }
}

export default function SealCard({ seal, compact = false }: SealCardProps) {
  const MediaIcon = mediaTypeIcons[seal.media_type] || ImageIcon;
  const mediaLabel = mediaTypeLabels[seal.media_type] || seal.media_type;
  const hasLocation = !!seal.metadata.location;
  const trustTier = trustTierFromNumber(seal.trust_tier);

  if (compact) {
    return (
      <Link href={`/dashboard/seals/${seal.id}`}>
        <div className="flex items-center gap-3 p-3 bg-surface-elevated rounded-xl border border-border hover:border-quantum/30 transition-colors cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-transform">
          {/* Media type icon */}
          <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
            <MediaIcon className="w-5 h-5 text-foreground/60" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {mediaLabel}
              </span>
              <SealBadge
                status="valid"
                trustTier={trustTier}
                size="small"
              />
            </div>
            <p className="text-xs text-foreground/60 mt-0.5">
              {formatDate(seal.captured_at)} • {formatTime(seal.captured_at)}
            </p>
          </div>

          {/* Location indicator */}
          {hasLocation && (
            <MapPin className="w-4 h-4 text-quantum/60 flex-shrink-0" />
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/dashboard/seals/${seal.id}`}>
      <div className="bg-surface-elevated rounded-xl border border-border hover:border-quantum/30 overflow-hidden transition-colors cursor-pointer hover:-translate-y-0.5 active:scale-[0.98] transition-transform">
        {/* Thumbnail area */}
        <div className="relative aspect-video bg-surface flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-surface-elevated flex items-center justify-center">
            <MediaIcon className="w-8 h-8 text-foreground/40" />
          </div>

          {/* Media type badge */}
          <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-lg text-xs text-white font-medium">
            {mediaLabel}
          </div>

          {/* Seal badge overlay */}
          <div className="absolute bottom-2 right-2">
            <SealBadge
              status="valid"
              trustTier={trustTier}
              size="small"
            />
          </div>

          {/* Location indicator */}
          {hasLocation && (
            <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-quantum/20 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-quantum" />
            </div>
          )}

          {/* C2PA indicator */}
          {seal.c2pa_manifest_embedded && (
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-quantum/20 backdrop-blur-sm rounded-lg text-xs text-quantum font-medium">
              C2PA
            </div>
          )}
        </div>

        {/* Info section */}
        <div className="p-4 space-y-3">
          {/* Date and time */}
          <div className="flex items-center gap-2 text-sm text-foreground/60">
            <Calendar className="w-4 h-4" />
            <span>{formatDate(seal.captured_at)}</span>
            <Clock className="w-4 h-4 ml-2" />
            <span>{formatTime(seal.captured_at)}</span>
          </div>

          {/* Location if present */}
          {hasLocation && seal.metadata.location && (
            <div className="flex items-center gap-2 text-sm text-foreground/60">
              <MapPin className="w-4 h-4 text-quantum" />
              <span>
                {seal.metadata.location.lat.toFixed(4)},{' '}
                {seal.metadata.location.lng.toFixed(4)}
              </span>
            </div>
          )}

          {/* Metadata row */}
          <div className="flex items-center justify-between text-xs text-foreground/40">
            <span>
              {seal.file_size ? formatFileSize(seal.file_size) : 'Taille inconnue'}
            </span>
            <div className="flex items-center gap-1">
              {seal.metadata.has_device_attestation ? (
                <>
                  <ShieldCheck className="w-3 h-3 text-quantum" />
                  <span className="text-quantum">Atteste</span>
                </>
              ) : (
                <>
                  <Shield className="w-3 h-3" />
                  <span>Non atteste</span>
                </>
              )}
            </div>
          </div>

          {/* Content hash preview */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-mono text-foreground/30 truncate">
              {seal.content_hash.slice(0, 32)}...
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Skeleton loader for SealCard */
export function SealCardSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-surface-elevated rounded-xl border border-border animate-pulse">
        <div className="w-10 h-10 rounded-lg bg-surface" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 bg-surface rounded" />
          <div className="h-3 w-32 bg-surface rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-elevated rounded-xl border border-border overflow-hidden animate-pulse">
      <div className="aspect-video bg-surface" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-40 bg-surface rounded" />
        <div className="h-4 w-32 bg-surface rounded" />
        <div className="h-3 w-24 bg-surface rounded" />
      </div>
    </div>
  );
}
