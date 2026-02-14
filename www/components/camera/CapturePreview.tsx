"use client";

import {
  CheckCircle,
  XCircle,
  ShieldCheck,
  Download,
  MapPinOff,
  User,
  Video,
  CloudOff,
} from "lucide-react";
import SealBadge, { TrustTier } from "@/components/SealBadge";
import PendingSealBadge from "@/components/PendingSealBadge";
import MiniMap from "@/components/MiniMap";
import { Card, CardPanel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Progress,
  ProgressLabel,
  ProgressTrack,
  ProgressIndicator,
} from "@/components/ui/progress";
import { Alert, AlertTitle } from "@/components/ui/alert";
import type { SealResponse } from "@/hooks/useSealMutation";
import type { CapturedLocation } from "./LocationCapture";
import type { CaptureState } from "./CaptureControls";

interface CapturePreviewProps {
  state: CaptureState;
  sealData: SealResponse | null;
  capturedImageUrl: string | null;
  capturedVideoUrl: string | null;
  capturedLocation: CapturedLocation | null;
  pendingLocalId: string | null;
  pendingThumbnail: string | null;
  errorMessage: string;
  onDownloadImage: () => void;
  onDownloadVideo: () => void;
}

const SEALING_STEPS = [
  { label: "Hachage", threshold: 25 },
  { label: "QRNG", threshold: 50 },
  { label: "Signature", threshold: 75 },
  { label: "Terminé", threshold: 100 },
];

function getSealingProgress(state: CaptureState): number {
  if (state === "capturing") return 10;
  if (state === "sealing") return 60;
  if (state === "success") return 100;
  return 0;
}

function getSealingStepLabel(state: CaptureState): string {
  if (state === "capturing") return "Hachage du contenu...";
  if (state === "sealing") return "Signature quantique...";
  if (state === "success") return "Terminé";
  return "";
}

export default function CapturePreview({
  state,
  sealData,
  capturedImageUrl,
  capturedVideoUrl,
  capturedLocation,
  pendingLocalId,
  pendingThumbnail,
  errorMessage,
  onDownloadImage,
  onDownloadVideo,
}: CapturePreviewProps) {
  // Sealing state with Progress
  if (state === "sealing" || state === "capturing") {
    return (
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-6 p-6 animate-[fadeIn_0.2s_var(--ease-out-expo)]">
        <Spinner className="w-10 h-10 text-primary" />
        <div className="w-full max-w-xs space-y-3">
          <Progress value={getSealingProgress(state)}>
            <div className="flex items-center justify-between gap-2">
              <ProgressLabel className="text-primary">
                {getSealingStepLabel(state)}
              </ProgressLabel>
            </div>
            <ProgressTrack className="bg-primary/20">
              <ProgressIndicator className="bg-primary transition-all duration-700" />
            </ProgressTrack>
          </Progress>
          <div className="flex justify-between text-xs text-muted-foreground">
            {SEALING_STEPS.map((step) => (
              <span
                key={step.label}
                className={
                  getSealingProgress(state) >= step.threshold
                    ? "text-primary"
                    : ""
                }
              >
                {step.label}
              </span>
            ))}
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Liaison de l&apos;entropie au contenu
        </p>
      </div>
    );
  }

  // Saving offline state
  if (state === "saving_offline") {
    return (
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 animate-[fadeIn_0.2s_var(--ease-out-expo)]">
        <Spinner className="w-10 h-10 text-warning" />
        <p className="text-warning font-medium">Sauvegarde locale...</p>
        <p className="text-muted-foreground text-sm">
          Le media sera scelle au retour de la connexion
        </p>
      </div>
    );
  }

  // Success state
  if (state === "success") {
    return (
      <div className="absolute inset-0 bg-background flex flex-col items-center gap-4 p-4 overflow-y-auto animate-[fadeIn_0.3s_var(--ease-out-expo)]">
        {/* Image preview with SealBadge overlay */}
        {(capturedImageUrl || sealData?.sealed_image) && !capturedVideoUrl && (
          <div className="relative w-full max-w-sm rounded-xl overflow-hidden border border-border animate-[slideUp_0.3s_var(--ease-out-expo)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                sealData?.sealed_image
                  ? `data:image/jpeg;base64,${sealData.sealed_image}`
                  : capturedImageUrl || ""
              }
              alt="Media scelle"
              className="w-full h-auto"
            />
            {sealData && (
              <SealBadge
                sealId={sealData.seal_id}
                status="valid"
                trustTier={sealData.trust_tier as TrustTier}
                size="medium"
                position="bottom-right"
                clickable={true}
                showExternalIcon={true}
              />
            )}
          </div>
        )}

        {/* Video preview with SealBadge overlay */}
        {capturedVideoUrl && (
          <div className="relative w-full max-w-sm rounded-xl overflow-hidden border border-border animate-[slideUp_0.3s_var(--ease-out-expo)]">
            <video src={capturedVideoUrl} controls playsInline aria-label="Video capturee" className="w-full h-auto">
              Votre navigateur ne supporte pas la lecture video.
            </video>
            {sealData && (
              <div className="absolute bottom-12 right-2">
                <SealBadge
                  sealId={sealData.seal_id}
                  status="valid"
                  trustTier={sealData.trust_tier as TrustTier}
                  size="small"
                  clickable={true}
                  showExternalIcon={true}
                />
              </div>
            )}
            <div className="absolute top-2 left-2">
              <Badge variant="error" size="sm" className="gap-1">
                <Video className="w-3 h-3" />
                <span>Video</span>
              </Badge>
            </div>
          </div>
        )}

        {/* Success icon with ring expand animation */}
        <div
          className="w-14 h-14 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0 animate-[scaleIn_0.3s_var(--ease-out-expo)]"
          style={{ boxShadow: "0 0 30px var(--success)" }}
        >
          <CheckCircle className="w-7 h-7 text-success" />
        </div>
        <h3 className="text-lg font-semibold text-success">Scelle !</h3>

        {sealData && (
          <div className="w-full max-w-sm space-y-2">
            <Card>
              <CardPanel className="space-y-1">
                <p className="text-xs text-muted-foreground">ID du sceau</p>
                <p className="font-mono text-sm text-foreground/80 break-all">
                  {sealData.seal_id}
                </p>
              </CardPanel>
            </Card>

            <Card>
              <CardPanel className="space-y-1">
                <p className="text-xs text-muted-foreground">Horodatage</p>
                <p className="font-mono text-sm text-foreground/80">
                  {new Date(sealData.timestamp).toLocaleString("fr-FR")}
                </p>
              </CardPanel>
            </Card>

            {/* Device attestation */}
            {sealData.has_device_attestation ? (
              <Alert variant="success">
                <ShieldCheck />
                <AlertTitle>Appareil atteste</AlertTitle>
              </Alert>
            ) : (
              <Card>
                <CardPanel>
                  <span className="text-xs text-muted-foreground">
                    Sans attestation d&apos;appareil
                  </span>
                </CardPanel>
              </Card>
            )}

            {/* Location display with mini-map */}
            {capturedLocation && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Localisation</p>
                <MiniMap
                  lat={capturedLocation.lat}
                  lng={capturedLocation.lng}
                  altitude={capturedLocation.altitude}
                />
              </div>
            )}

            {/* No location indicator */}
            {!capturedLocation && (
              <Card>
                <CardPanel className="flex items-center gap-2">
                  <MapPinOff className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Sans localisation</span>
                </CardPanel>
              </Card>
            )}

            {/* Authenticated user indicator */}
            {sealData.user_id && (
              <Alert variant="info">
                <User />
                <AlertTitle>
                  Sceau authentifie
                  <span className="text-muted-foreground ml-1 font-normal">
                    (Tier {sealData.trust_tier.replace("tier", "")})
                  </span>
                </AlertTitle>
              </Alert>
            )}

            {/* C2PA manifest indicator */}
            {sealData.sealed_image && (
              <Alert variant="success">
                <CheckCircle />
                <AlertTitle>
                  Manifest C2PA integre
                  {sealData.manifest_size && (
                    <span className="text-muted-foreground ml-1 font-normal">
                      ({Math.round(sealData.manifest_size / 1024)} Ko)
                    </span>
                  )}
                </AlertTitle>
              </Alert>
            )}

            {/* Download button - Image */}
            {(capturedImageUrl || sealData.sealed_image) && !capturedVideoUrl && (
              <Button
                onClick={onDownloadImage}
                className="w-full active:scale-[0.97] transition-all"
              >
                <Download className="w-5 h-5" />
                <span>
                  {sealData.sealed_image
                    ? "Telecharger (avec C2PA)"
                    : "Telecharger l'image"}
                </span>
              </Button>
            )}

            {/* Download button - Video */}
            {capturedVideoUrl && (
              <Button
                onClick={onDownloadVideo}
                className="w-full active:scale-[0.97] transition-all"
              >
                <Download className="w-5 h-5" />
                <span>Telecharger la video</span>
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Pending sync state
  if (state === "pending_sync") {
    return (
      <div className="absolute inset-0 bg-background flex flex-col items-center gap-4 p-4 overflow-y-auto animate-[fadeIn_0.3s_var(--ease-out-expo)]">
        {/* Image preview with PendingSealBadge */}
        {(capturedImageUrl || pendingThumbnail) && !capturedVideoUrl && (
          <div className="relative w-full max-w-sm rounded-xl overflow-hidden border border-warning/30 animate-[slideUp_0.3s_var(--ease-out-expo)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingThumbnail || capturedImageUrl || ""}
              alt="Media en attente"
              className="w-full h-auto"
            />
            <PendingSealBadge
              status="pending"
              size="medium"
              position="bottom-right"
              overlay={true}
            />
          </div>
        )}

        {/* Video preview with PendingSealBadge */}
        {capturedVideoUrl && (
          <div className="relative w-full max-w-sm rounded-xl overflow-hidden border border-warning/30 animate-[slideUp_0.3s_var(--ease-out-expo)]">
            <video src={capturedVideoUrl} controls playsInline aria-label="Video en attente de synchronisation" className="w-full h-auto" />
            <div className="absolute bottom-12 right-2">
              <PendingSealBadge status="pending" size="small" />
            </div>
          </div>
        )}

        <div
          className="w-14 h-14 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0 animate-[scaleIn_0.3s_var(--ease-out-expo)]"
          style={{ boxShadow: "0 0 30px var(--warning)" }}
        >
          <CloudOff className="w-7 h-7 text-warning" />
        </div>
        <h3 className="text-lg font-semibold text-warning">Sauvegarde locale</h3>
        <p className="text-muted-foreground text-sm text-center max-w-xs">
          Le media sera scelle automatiquement au retour de la connexion internet.
        </p>

        {/* Location display */}
        {capturedLocation && (
          <div className="w-full max-w-sm space-y-2">
            <p className="text-xs text-muted-foreground">Localisation capturee</p>
            <MiniMap
              lat={capturedLocation.lat}
              lng={capturedLocation.lng}
              altitude={capturedLocation.altitude}
            />
          </div>
        )}

        {/* Pending sync indicator */}
        <Alert variant="warning" className="w-full max-w-sm">
          <CloudOff />
          <AlertTitle>En attente de synchronisation</AlertTitle>
        </Alert>

        {pendingLocalId && (
          <Card className="w-full max-w-sm">
            <CardPanel className="space-y-1">
              <p className="text-xs text-muted-foreground">ID local</p>
              <p className="font-mono text-xs text-muted-foreground break-all">
                {pendingLocalId}
              </p>
            </CardPanel>
          </Card>
        )}
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className="absolute inset-0 bg-background flex flex-col items-center justify-center gap-4 p-6 animate-[fadeIn_0.3s_var(--ease-out-expo)]">
        <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center animate-[shield-failed_0.4s_var(--ease-out-expo)]">
          <XCircle className="w-10 h-10 text-destructive" />
        </div>
        <h3 className="text-xl font-semibold text-destructive">Erreur</h3>
        <p className="text-muted-foreground text-sm text-center max-w-xs">{errorMessage}</p>
      </div>
    );
  }

  return null;
}
