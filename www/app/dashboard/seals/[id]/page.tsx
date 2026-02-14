'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ShieldCheck,
  ShieldX,
  Calendar,
  Clock,
  MapPin,
  Image as ImageIcon,
  Video,
  Music,
  Copy,
  Check,
  ExternalLink,
  Fingerprint,
  Download,
  Link2,
  Blocks,
  Monitor,
  Share2,
  Info,
} from 'lucide-react';
import { useSealDetailQuery, useSealExport, type ExportFormat } from '@/hooks/useSealsQuery';
import SealBadge, { TrustTier } from '@/components/SealBadge';
import MiniMap from '@/components/MiniMap';
import ExportModal from '@/components/ExportModal';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionPanel,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Group, GroupSeparator } from '@/components/ui/group';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipTrigger, TooltipPopup } from '@/components/ui/tooltip';
import { formatDate, formatTime, formatFileSize } from '@/lib/formatters';

interface SealDetailPageProps {
  params: Promise<{ id: string }>;
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
      return 'Tier 1 — In-App';
    case 2:
      return 'Tier 2 — Verified Reporter';
    case 3:
      return 'Tier 3 — Hardware Secure';
    default:
      return 'Inconnu';
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
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopy}
          />
        }
      >
        {copied ? (
          <Check className="size-3.5 text-success" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </TooltipTrigger>
      <TooltipPopup>
        {copied ? 'Copie !' : `Copier ${label}`}
      </TooltipPopup>
    </Tooltip>
  );
}

function HashBlock({ value, truncate = false }: { value: string; truncate?: boolean }) {
  return (
    <Kbd className="h-auto min-w-0 w-full justify-start rounded-md bg-background px-3 py-2 font-mono text-xs text-muted-foreground break-all leading-relaxed">
      {truncate ? `${value.slice(0, 128)}...` : value}
    </Kbd>
  );
}

function TechTooltip({ term, explanation, children }: { term?: string; explanation: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex items-center gap-1 cursor-help border-b border-dashed border-muted-foreground/40">
        {children}
      </TooltipTrigger>
      <TooltipPopup className="max-w-xs">
        {term && <span className="font-semibold">{term} — </span>}
        {explanation}
      </TooltipPopup>
    </Tooltip>
  );
}

function SealDetailSkeleton() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Skeleton className="h-5 w-64" />
      <Card>
        <CardHeader className="gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </CardHeader>
        <CardPanel>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </CardPanel>
      </Card>

      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>

      <Skeleton className="h-10 w-80" />
    </div>
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

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'Veritas Seal',
        text: `Seal authentifie #${id.slice(0, 8)}`,
        url: window.location.href,
      });
    } else {
      await navigator.clipboard.writeText(window.location.href);
    }
  };

  if (isLoading) {
    return <SealDetailSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/dashboard" />}>Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/dashboard/seals" />}>Seals</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Erreur</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="border-destructive/30">
          <CardPanel className="flex flex-col items-center py-12 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
              <ShieldX className="size-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold text-destructive mb-2">
              Seal introuvable
            </h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-md">
              {error instanceof Error
                ? error.message
                : 'Ce seal n\'existe pas ou vous n\'y avez pas acces.'}
            </p>
            <Button variant="outline" render={<Link href="/dashboard/seals" />}>
              <ArrowLeft className="size-4" />
              Retour a la liste
            </Button>
          </CardPanel>
        </Card>
      </div>
    );
  }

  const seal = data.seal;
  const MediaIcon = mediaTypeIcons[seal.media_type] || ImageIcon;
  const mediaLabel = mediaTypeLabels[seal.media_type] || seal.media_type;
  const trustTier = trustTierFromNumber(seal.trust_tier);

  const defaultOpenSections = ['info', 'crypto'];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/dashboard" />}>Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/dashboard/seals" />}>Seals</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">
              #{seal.id.slice(0, 8)}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Hero Card */}
      <Card className="animate-[fadeIn_0.3s_var(--ease-out-expo)]">
        <CardHeader>
          <div className="flex items-start gap-4">
            {/* Media icon */}
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <MediaIcon className="size-7 text-primary" />
            </div>
            {/* Title + meta */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="text-lg">Detail du Seal</CardTitle>
                <SealBadge
                  status="valid"
                  trustTier={trustTier}
                  size="medium"
                  clickable={false}
                  animate={false}
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Kbd className="font-mono text-[11px]">{seal.id}</Kbd>
                <CopyButton text={seal.id} label="ID" />
              </div>
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardPanel>
          <div className="flex items-center flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="size-3.5 text-primary" />
              {formatDate(seal.captured_at)}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-3.5 text-primary" />
              {formatTime(seal.captured_at)}
            </span>
            <Badge variant="outline" size="sm">
              <MediaIcon className="size-3" />
              {mediaLabel}
            </Badge>
            {seal.c2pa_manifest_embedded && (
              <Badge variant="info" size="sm">C2PA</Badge>
            )}
            {seal.metadata.location && (
              <Badge variant="outline" size="sm">
                <MapPin className="size-3" />
                Geolocalise
              </Badge>
            )}
          </div>
        </CardPanel>
      </Card>

      {/* Media Preview */}
      <Card className="overflow-hidden animate-[slideUp_0.3s_var(--ease-out-expo)]">
        <div className="relative aspect-video bg-background flex items-center justify-center">
          <div className="flex size-24 items-center justify-center rounded-full bg-muted">
            <MediaIcon className="size-12 text-muted-foreground" />
          </div>

          {/* Floating badges */}
          <div className="absolute top-3 left-3">
            <Badge variant="secondary" className="backdrop-blur-sm bg-background/70">
              <MediaIcon className="size-3" />
              {mediaLabel}
            </Badge>
          </div>
          {seal.c2pa_manifest_embedded && (
            <div className="absolute top-3 right-3">
              <Badge variant="default" className="backdrop-blur-sm">
                C2PA Embedded
              </Badge>
            </div>
          )}
        </div>
      </Card>

      {/* Accordion Sections */}
      <Accordion multiple defaultValue={defaultOpenSections}>
        {/* Informations du Seal */}
        <AccordionItem value="info">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Info className="size-4 text-primary" />
              Informations du Seal
            </span>
          </AccordionTrigger>
          <AccordionPanel>
            <Card>
              <CardPanel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Type de media</p>
                    <p className="text-sm font-medium flex items-center gap-2">
                      <MediaIcon className="size-4 text-primary" />
                      {mediaLabel}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Taille du fichier</p>
                    <p className="text-sm font-medium">{formatFileSize(seal.file_size)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Date de capture</p>
                    <p className="text-sm font-medium">{formatDate(seal.captured_at)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Heure de capture</p>
                    <p className="text-sm font-medium">{formatTime(seal.captured_at)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Niveau de confiance</p>
                    <div className="flex items-center gap-2">
                      <SealBadge
                        status="valid"
                        trustTier={trustTier}
                        size="small"
                        clickable={false}
                        animate={false}
                      />
                      <span className="text-sm text-muted-foreground">
                        {trustTierLabel(seal.trust_tier)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Statut du media</p>
                    <p className="text-sm font-medium">
                      {seal.media_deleted ? (
                        <Badge variant="warning" size="sm">Supprime (RGPD)</Badge>
                      ) : (
                        <Badge variant="success" size="sm">Disponible</Badge>
                      )}
                    </p>
                  </div>
                </div>
              </CardPanel>
            </Card>
          </AccordionPanel>
        </AccordionItem>

        {/* Cryptographie */}
        <AccordionItem value="crypto">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Fingerprint className="size-4 text-primary" />
              Cryptographie
            </span>
          </AccordionTrigger>
          <AccordionPanel>
            <Card>
              <CardPanel className="space-y-5">
                {/* Content Hash */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <TechTooltip
                        term="SHA3-256"
                        explanation="Algorithme de hachage cryptographique resistant aux attaques quantiques, utilise pour generer une empreinte unique du contenu."
                      >
                        Hash du contenu (SHA3-256)
                      </TechTooltip>
                    </p>
                    <CopyButton text={seal.content_hash} label="hash" />
                  </div>
                  <HashBlock value={seal.content_hash} />
                </div>

                {/* Perceptual Hash */}
                {seal.perceptual_hash && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <TechTooltip
                            term="Hash perceptuel"
                            explanation="Empreinte basee sur le contenu visuel du media, permettant de detecter les manipulations meme apres recompression ou redimensionnement."
                          >
                            Hash perceptuel (DCT)
                          </TechTooltip>
                        </p>
                        <CopyButton text={seal.perceptual_hash} label="hash perceptuel" />
                      </div>
                      <HashBlock value={seal.perceptual_hash} />
                    </div>
                  </>
                )}

                <Separator />

                {/* Signature */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <TechTooltip
                        term="ML-DSA-65"
                        explanation="Module Lattice Digital Signature Algorithm (FIPS 204) — signature numerique post-quantique. Resistante aux attaques par ordinateur quantique."
                      >
                        Signature ML-DSA-65
                      </TechTooltip>
                    </p>
                    <CopyButton text={seal.signature} label="signature" />
                  </div>
                  <HashBlock value={seal.signature} truncate />
                  <p className="text-xs text-muted-foreground">
                    {Math.floor(seal.signature.length / 2)} octets (FIPS 204)
                  </p>
                </div>

                <Separator />

                {/* Public Key */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Cle publique</p>
                    <CopyButton text={seal.public_key} label="cle publique" />
                  </div>
                  <HashBlock value={seal.public_key} truncate />
                </div>

                <Separator />

                {/* QRNG Entropy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <TechTooltip
                        term="QRNG"
                        explanation="Quantum Random Number Generator — generateur d'entropie quantique utilisee comme sel unique lors de la signature. Garantit l'imprevisibilite absolue."
                      >
                        Entropie QRNG
                      </TechTooltip>
                    </p>
                    <CopyButton text={seal.qrng_entropy} label="entropie" />
                  </div>
                  <HashBlock value={seal.qrng_entropy} />
                  <p className="text-xs text-muted-foreground">
                    Source : <Badge variant="outline" size="sm">{seal.qrng_source.toUpperCase()}</Badge>
                  </p>
                </div>
              </CardPanel>
            </Card>
          </AccordionPanel>
        </AccordionItem>

        {/* Localisation */}
        {seal.metadata.location && (
          <AccordionItem value="location">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                Localisation
              </span>
            </AccordionTrigger>
            <AccordionPanel>
              <Card>
                <CardPanel>
                  <MiniMap
                    lat={seal.metadata.location.lat}
                    lng={seal.metadata.location.lng}
                    altitude={seal.metadata.location.altitude}
                    className="border border-border"
                  />
                </CardPanel>
              </Card>
            </AccordionPanel>
          </AccordionItem>
        )}

        {/* Blockchain */}
        <AccordionItem value="blockchain">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Blocks className="size-4 text-primary" />
              Blockchain
            </span>
          </AccordionTrigger>
          <AccordionPanel>
            <Card>
              <CardPanel>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Statut d&apos;ancrage</p>
                    <Badge variant="secondary" size="sm">Non ancre</Badge>
                  </div>
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    L&apos;ancrage blockchain permet de prouver l&apos;existence du seal a une date precise via Solana.
                    Utilisez la commande CLI <Kbd>veritas anchor</Kbd> pour ancrer ce seal.
                  </p>
                </div>
              </CardPanel>
            </Card>
          </AccordionPanel>
        </AccordionItem>

        {/* C2PA */}
        <AccordionItem value="c2pa">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Link2 className="size-4 text-primary" />
              C2PA
            </span>
          </AccordionTrigger>
          <AccordionPanel>
            <Card>
              <CardPanel>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Manifeste C2PA</p>
                    {seal.c2pa_manifest_embedded ? (
                      <Badge variant="success" size="sm">Embarque</Badge>
                    ) : (
                      <Badge variant="secondary" size="sm">Non embarque</Badge>
                    )}
                  </div>
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    <TechTooltip
                      term="C2PA"
                      explanation="Coalition for Content Provenance and Authenticity — standard ouvert (Adobe, Microsoft, BBC) pour tracer la provenance du contenu numerique."
                    >
                      C2PA (Content Credentials)
                    </TechTooltip>
                    {' '}permet la verification d&apos;authenticite compatible avec l&apos;ecosysteme Adobe/Microsoft/BBC.
                  </p>
                </div>
              </CardPanel>
            </Card>
          </AccordionPanel>
        </AccordionItem>

        {/* Appareil */}
        <AccordionItem value="device">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Monitor className="size-4 text-primary" />
              Appareil
            </span>
          </AccordionTrigger>
          <AccordionPanel>
            <Card>
              <CardPanel>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Attestation d&apos;appareil</p>
                    {seal.metadata.has_device_attestation ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="success" size="sm">
                          <ShieldCheck className="size-3" />
                          Verifiee
                        </Badge>
                        <span className="text-xs text-muted-foreground">WebAuthn/FIDO2</span>
                      </div>
                    ) : (
                      <Badge variant="secondary" size="sm">Non attestee</Badge>
                    )}
                  </div>
                  {seal.metadata.device && (
                    <>
                      <Separator />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {seal.metadata.device.platform && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Plateforme</p>
                            <p className="text-sm font-medium">{seal.metadata.device.platform}</p>
                          </div>
                        )}
                        {seal.metadata.device.user_agent && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">User Agent</p>
                            <p className="text-xs font-mono text-muted-foreground truncate">
                              {seal.metadata.device.user_agent}
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </CardPanel>
            </Card>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      {/* Actions Bar */}
      <Separator />
      <div className="flex flex-wrap gap-3 animate-[fadeIn_0.3s_var(--ease-out-expo)]">
        <Group>
          <Button onClick={() => setIsExportModalOpen(true)}>
            <Download className="size-4" />
            Exporter
          </Button>
          <GroupSeparator />
          <Button variant="outline" render={<Link href={`/verify?seal_id=${seal.id}`} />}>
            <ExternalLink className="size-4" />
            Verifier
          </Button>
          <GroupSeparator />
          <Button variant="outline" onClick={handleShare}>
            <Share2 className="size-4" />
            Partager
          </Button>
        </Group>
      </div>

      {/* Export Modal */}
      <ExportModal
        open={isExportModalOpen}
        onOpenChange={setIsExportModalOpen}
        sealId={seal.id}
        onExport={handleExport}
      />
    </div>
  );
}
