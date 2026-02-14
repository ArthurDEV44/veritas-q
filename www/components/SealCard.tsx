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
import { Card, CardPanel, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import type { SealRecord } from '@/hooks/useSealsQuery';
import SealBadge, { type TrustTier } from './SealBadge';
import { formatDate, formatTime, formatFileSize } from '@/lib/formatters';

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
      <Card
        render={<Link href={`/dashboard/seals/${seal.id}`} aria-label={`${mediaLabel} — ${formatDate(seal.captured_at)}`} />}
        className="flex-row items-center gap-3 p-3 transition-all duration-200 hover:border-primary/30 active:scale-[0.98] cursor-pointer"
      >
        {/* Media type icon */}
        <Avatar className="size-10 rounded-lg shrink-0">
          <AvatarFallback className="rounded-lg bg-surface-1">
            <MediaIcon className="size-5 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{mediaLabel}</span>
            <SealBadge
              status="valid"
              trustTier={trustTier}
              size="small"
              animate={false}
              clickable={false}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDate(seal.captured_at)} &bull; {formatTime(seal.captured_at)}
          </p>
        </div>

        {/* Indicators */}
        {seal.c2pa_manifest_embedded && (
          <Badge variant="info" size="sm">
            C2PA
          </Badge>
        )}
        {hasLocation && (
          <Badge
            variant="outline"
            size="sm"
            className="text-primary shrink-0"
          >
            <MapPin />
          </Badge>
        )}
      </Card>
    );
  }

  return (
    <Card
      render={<Link href={`/dashboard/seals/${seal.id}`} aria-label={`Seal ${mediaLabel} — ${formatDate(seal.captured_at)}`} />}
      className="overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg active:scale-[0.98] cursor-pointer"
    >
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-surface-1 flex items-center justify-center">
        <Avatar className="size-16">
          <AvatarFallback>
            <MediaIcon className="size-8 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>

        {/* Media type badge */}
        <Badge
          variant="outline"
          size="sm"
          className="absolute top-2 left-2 backdrop-blur-sm bg-black/60 border-white/10 text-white"
        >
          {mediaLabel}
        </Badge>

        {/* Seal trust tier badge */}
        <SealBadge
          status="valid"
          trustTier={trustTier}
          size="small"
          position="bottom-right"
          animate={false}
          clickable={false}
        />

        {/* Location indicator */}
        {hasLocation && (
          <Badge
            variant="outline"
            size="sm"
            className="absolute top-2 right-2 bg-primary/20 border-primary/30 text-primary backdrop-blur-sm"
          >
            <MapPin />
          </Badge>
        )}

        {/* C2PA indicator */}
        {seal.c2pa_manifest_embedded && (
          <Badge
            variant="info"
            size="sm"
            className="absolute bottom-2 left-2 backdrop-blur-sm"
          >
            C2PA
          </Badge>
        )}
      </div>

      {/* Info section */}
      <CardPanel className="space-y-3 p-4">
        {/* Date and time */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="size-4" />
          <span>{formatDate(seal.captured_at)}</span>
          <Clock className="size-4 ml-2" />
          <span>{formatTime(seal.captured_at)}</span>
        </div>

        {/* Location if present */}
        {hasLocation && seal.metadata.location && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4 text-primary" />
            <span>
              {seal.metadata.location.lat.toFixed(4)},{' '}
              {seal.metadata.location.lng.toFixed(4)}
            </span>
          </div>
        )}

        {/* Metadata row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {seal.file_size ? formatFileSize(seal.file_size) : 'Taille inconnue'}
          </span>
          <div className="flex items-center gap-1">
            {seal.metadata.has_device_attestation ? (
              <>
                <ShieldCheck className="size-3 text-primary" />
                <span className="text-primary">Atteste</span>
              </>
            ) : (
              <>
                <Shield className="size-3" />
                <span>Non atteste</span>
              </>
            )}
          </div>
        </div>
      </CardPanel>

      {/* Content hash preview */}
      <CardFooter className="border-t border-border px-4 py-3">
        <p className="text-xs font-mono text-muted-foreground/60 truncate">
          {seal.content_hash.slice(0, 32)}...
        </p>
      </CardFooter>
    </Card>
  );
}

/** Skeleton loader for SealCard using CossUI Skeleton */
export function SealCardSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Card className="flex-row items-center gap-3 p-3">
        <Skeleton className="size-10 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-video w-full rounded-none" />
      <CardPanel className="space-y-3 p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </CardPanel>
    </Card>
  );
}
