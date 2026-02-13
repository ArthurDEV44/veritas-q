'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  Calendar,
  Clock,
  MapPin,
  Image as ImageIcon,
  Video,
  Music,
  Copy,
  Check,
  ExternalLink,
  FileKey,
  Fingerprint,
  Cpu,
  Download,
} from 'lucide-react';
import { useSealDetailQuery, useSealExport, type ExportFormat } from '@/hooks/useSealsQuery';
import SealBadge, { TrustTier } from '@/components/SealBadge';
import MiniMap from '@/components/MiniMap';
import ExportModal from '@/components/ExportModal';

interface SealDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return 'Taille inconnue';
  if (bytes < 1024) return `${bytes} octets`;
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

function trustTierLabel(tier: number): string {
  switch (tier) {
    case 1:
      return 'Tier 1 - In-App';
    case 2:
      return 'Tier 2 - Verified Reporter';
    case 3:
      return 'Tier 3 - Hardware Secure';
    default:
      return 'Unknown';
  }
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

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 text-xs bg-surface hover:bg-surface-elevated rounded transition-colors"
      title={`Copier ${label}`}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-green-500" />
          <span className="text-green-500">Copie !</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>Copier</span>
        </>
      )}
    </button>
  );
}

export default function SealDetailPage({ params }: SealDetailPageProps) {
  const { id } = use(params);
  const { data, isLoading, isError, error } = useSealDetailQuery(id);
  const { downloadExport } = useSealExport();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    await downloadExport(id, format);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="aspect-video bg-surface rounded-xl" />
        <div className="space-y-4">
          <div className="h-6 w-64 bg-surface rounded" />
          <div className="h-4 w-48 bg-surface rounded" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <Shield className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-red-500 mb-2">
          Seal introuvable
        </h3>
        <p className="text-foreground/60 text-sm text-center mb-4">
          {error instanceof Error
            ? error.message
            : 'Ce seal n\'existe pas ou vous n\'y avez pas acces.'}
        </p>
        <Link
          href="/dashboard/seals"
          className="flex items-center gap-2 px-4 py-2 bg-surface-elevated hover:bg-surface rounded-lg border border-border transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour a la liste</span>
        </Link>
      </div>
    );
  }

  const seal = data.seal;
  const MediaIcon = mediaTypeIcons[seal.media_type] || ImageIcon;
  const mediaLabel = mediaTypeLabels[seal.media_type] || seal.media_type;
  const trustTier = trustTierFromNumber(seal.trust_tier);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/seals"
          className="p-2 rounded-lg hover:bg-surface-elevated transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground/60" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Detail du Seal</h1>
          <p className="text-foreground/60 text-sm font-mono">
            {seal.id}
          </p>
        </div>
        <SealBadge status="valid" trustTier={trustTier} size="medium" />
      </div>

      {/* Media preview */}
      <div className="relative aspect-video bg-surface rounded-xl border border-border overflow-hidden flex items-center justify-center animate-[slideUp_0.3s_ease-out]">
        <div className="w-24 h-24 rounded-full bg-surface-elevated flex items-center justify-center">
          <MediaIcon className="w-12 h-12 text-foreground/40" />
        </div>

        {/* Media type badge */}
        <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-lg text-sm text-white font-medium flex items-center gap-2">
          <MediaIcon className="w-4 h-4" />
          <span>{mediaLabel}</span>
        </div>

        {/* C2PA badge */}
        {seal.c2pa_manifest_embedded && (
          <div className="absolute top-4 right-4 px-3 py-1.5 bg-quantum/20 backdrop-blur-sm rounded-lg text-sm text-quantum font-medium">
            C2PA Embedded
          </div>
        )}
      </div>

      {/* Info sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column - Capture info */}
        <div className="space-y-4 animate-[slideInRight_0.3s_ease-out]">
          {/* Date & Time */}
          <div className="p-4 bg-surface-elevated rounded-xl border border-border space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-quantum" />
              Date de capture
            </h3>
            <div className="space-y-1">
              <p className="text-foreground">{formatDate(seal.captured_at)}</p>
              <p className="text-foreground/60 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {formatTime(seal.captured_at)}
              </p>
            </div>
          </div>

          {/* Location */}
          {seal.metadata.location && (
            <div className="p-4 bg-surface-elevated rounded-xl border border-border space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4 text-quantum" />
                Localisation
              </h3>
              <MiniMap
                lat={seal.metadata.location.lat}
                lng={seal.metadata.location.lng}
                altitude={seal.metadata.location.altitude}
              />
            </div>
          )}

          {/* Trust tier */}
          <div className="p-4 bg-surface-elevated rounded-xl border border-border space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-quantum" />
              Niveau de confiance
            </h3>
            <div className="flex items-center gap-3">
              <SealBadge status="valid" trustTier={trustTier} size="small" />
              <span className="text-foreground/60 text-sm">
                {trustTierLabel(seal.trust_tier)}
              </span>
            </div>
            {seal.metadata.has_device_attestation && (
              <p className="text-xs text-quantum flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Attestation d&apos;appareil verifiee
              </p>
            )}
          </div>

          {/* File info */}
          <div className="p-4 bg-surface-elevated rounded-xl border border-border space-y-2">
            <h3 className="font-semibold text-foreground">Fichier</h3>
            <div className="text-sm text-foreground/60 space-y-1">
              <p>Type: {mediaLabel}</p>
              <p>Taille: {formatFileSize(seal.file_size)}</p>
              {seal.media_deleted && (
                <p className="text-amber-400">Media supprime (GDPR)</p>
              )}
            </div>
          </div>
        </div>

        {/* Right column - Cryptographic data */}
        <div className="space-y-4 animate-[slideInRight_0.3s_ease-out]">
          {/* Content hash */}
          <div className="p-4 bg-surface-elevated rounded-xl border border-border space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-quantum" />
                Hash du contenu (SHA3-256)
              </h3>
              <CopyButton text={seal.content_hash} label="hash" />
            </div>
            <p className="font-mono text-xs text-foreground/60 break-all bg-surface p-2 rounded">
              {seal.content_hash}
            </p>
          </div>

          {/* Perceptual hash */}
          {seal.perceptual_hash && (
            <div className="p-4 bg-surface-elevated rounded-xl border border-border space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <FileKey className="w-4 h-4 text-quantum" />
                  Hash perceptuel (DCT)
                </h3>
                <CopyButton text={seal.perceptual_hash} label="hash perceptuel" />
              </div>
              <p className="font-mono text-xs text-foreground/60 break-all bg-surface p-2 rounded">
                {seal.perceptual_hash}
              </p>
            </div>
          )}

          {/* QRNG info */}
          <div className="p-4 bg-surface-elevated rounded-xl border border-border space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Cpu className="w-4 h-4 text-quantum" />
                Entropie QRNG
              </h3>
              <CopyButton text={seal.qrng_entropy} label="entropie" />
            </div>
            <p className="font-mono text-xs text-foreground/60 break-all bg-surface p-2 rounded max-h-20 overflow-y-auto">
              {seal.qrng_entropy}
            </p>
            <p className="text-xs text-foreground/40">
              Source: {seal.qrng_source.toUpperCase()}
            </p>
          </div>

          {/* Signature */}
          <div className="p-4 bg-surface-elevated rounded-xl border border-border space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-quantum" />
                Signature ML-DSA-65
              </h3>
              <CopyButton text={seal.signature} label="signature" />
            </div>
            <p className="font-mono text-xs text-foreground/60 break-all bg-surface p-2 rounded max-h-20 overflow-y-auto">
              {seal.signature.slice(0, 128)}...
            </p>
            <p className="text-xs text-foreground/40">
              {seal.signature.length / 2} octets (FIPS 204)
            </p>
          </div>

          {/* Public key */}
          <div className="p-4 bg-surface-elevated rounded-xl border border-border space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Cle publique</h3>
              <CopyButton text={seal.public_key} label="cle publique" />
            </div>
            <p className="font-mono text-xs text-foreground/60 break-all bg-surface p-2 rounded max-h-20 overflow-y-auto">
              {seal.public_key.slice(0, 128)}...
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-4 border-t border-border animate-[fadeIn_0.3s_ease-out]">
        <Link
          href={`/verify?seal_id=${seal.id}`}
          className="flex items-center gap-2 px-4 py-2 bg-quantum text-black font-medium rounded-lg hover:bg-quantum-dim transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Verifier ce seal</span>
        </Link>

        <button
          onClick={() => setIsExportModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-surface-elevated hover:bg-surface rounded-lg border border-border transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Exporter</span>
        </button>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        sealId={seal.id}
        onExport={handleExport}
      />
    </div>
  );
}
