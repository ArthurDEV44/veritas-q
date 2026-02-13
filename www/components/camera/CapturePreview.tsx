"use client";

import { motion } from "motion/react";
import {
  CheckCircle,
  XCircle,
  ShieldCheck,
  Download,
  MapPinOff,
  User,
  Video,
  CloudOff,
  Loader2,
} from "lucide-react";
import SealBadge, { TrustTier } from "@/components/SealBadge";
import PendingSealBadge from "@/components/PendingSealBadge";
import MiniMap from "@/components/MiniMap";
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
  // Sealing state
  if (state === "sealing") {
    return (
      <motion.div
        key="sealing"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4"
      >
        <Loader2 className="w-12 h-12 text-quantum animate-spin" />
        <p className="text-quantum font-medium">Scellement quantique...</p>
        <p className="text-foreground/60 text-sm">
          Liaison de l&apos;entropie au contenu
        </p>
      </motion.div>
    );
  }

  // Saving offline state
  if (state === "saving_offline") {
    return (
      <motion.div
        key="saving_offline"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4"
      >
        <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
        <p className="text-amber-400 font-medium">Sauvegarde locale...</p>
        <p className="text-foreground/60 text-sm">
          Le media sera scelle au retour de la connexion
        </p>
      </motion.div>
    );
  }

  // Success state
  if (state === "success") {
    return (
      <motion.div
        key="success"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-surface flex flex-col items-center gap-4 p-4 overflow-y-auto"
      >
        {/* Image preview with SealBadge overlay */}
        {(capturedImageUrl || sealData?.sealed_image) && !capturedVideoUrl && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative w-full max-w-sm rounded-xl overflow-hidden border border-border"
          >
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
            {/* SealBadge overlay on the image */}
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
          </motion.div>
        )}

        {/* Video preview with SealBadge overlay */}
        {capturedVideoUrl && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative w-full max-w-sm rounded-xl overflow-hidden border border-border"
          >
            <video src={capturedVideoUrl} controls playsInline className="w-full h-auto">
              Votre navigateur ne supporte pas la lecture video.
            </video>
            {/* SealBadge overlay on the video */}
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
            {/* Video icon indicator */}
            <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/80 text-white text-xs">
              <Video className="w-3 h-3" />
              <span>Video</span>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0"
          style={{ boxShadow: "0 0 30px rgba(34, 197, 94, 0.3)" }}
        >
          <CheckCircle className="w-7 h-7 text-green-500" />
        </motion.div>
        <h3 className="text-lg font-semibold text-green-500">Scelle !</h3>

        {sealData && (
          <div className="w-full max-w-sm space-y-2">
            <div className="bg-surface-elevated rounded-lg p-3">
              <p className="text-xs text-foreground/40 mb-1">ID du sceau</p>
              <p className="font-mono text-sm text-foreground/80 break-all">
                {sealData.seal_id}
              </p>
            </div>
            <div className="bg-surface-elevated rounded-lg p-3">
              <p className="text-xs text-foreground/40 mb-1">Horodatage</p>
              <p className="font-mono text-sm text-foreground/80">
                {new Date(sealData.timestamp).toLocaleString("fr-FR")}
              </p>
            </div>
            <div
              className={`rounded-lg p-3 flex items-center gap-2 ${
                sealData.has_device_attestation
                  ? "bg-green-500/10 border border-green-500/30"
                  : "bg-surface-elevated"
              }`}
            >
              {sealData.has_device_attestation ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-500">Appareil attesté</span>
                </>
              ) : (
                <span className="text-xs text-foreground/40">
                  Sans attestation d&apos;appareil
                </span>
              )}
            </div>

            {/* Location display with mini-map */}
            {capturedLocation && (
              <div className="space-y-2">
                <p className="text-xs text-foreground/40">Localisation</p>
                <MiniMap
                  lat={capturedLocation.lat}
                  lng={capturedLocation.lng}
                  altitude={capturedLocation.altitude}
                />
              </div>
            )}

            {/* No location indicator */}
            {!capturedLocation && (
              <div className="rounded-lg p-3 bg-surface-elevated flex items-center gap-2">
                <MapPinOff className="w-4 h-4 text-foreground/40" />
                <span className="text-xs text-foreground/40">Sans localisation</span>
              </div>
            )}

            {/* Authenticated user indicator */}
            {sealData.user_id && (
              <div className="rounded-lg p-3 bg-quantum/10 border border-quantum/30 flex items-center gap-2">
                <User className="w-4 h-4 text-quantum" />
                <span className="text-sm text-quantum">
                  Sceau authentifie
                  <span className="text-quantum/60 ml-1">
                    (Tier {sealData.trust_tier.replace("tier", "")})
                  </span>
                </span>
              </div>
            )}

            {/* C2PA manifest indicator */}
            {sealData.sealed_image && (
              <div className="rounded-lg p-3 bg-quantum/10 border border-quantum/30 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-quantum" />
                <span className="text-sm text-quantum">
                  Manifest C2PA integre
                  {sealData.manifest_size && (
                    <span className="text-quantum/60 ml-1">
                      ({Math.round(sealData.manifest_size / 1024)} Ko)
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Download button - Image */}
            {(capturedImageUrl || sealData.sealed_image) && !capturedVideoUrl && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onDownloadImage}
                className="w-full flex items-center justify-center gap-2 py-3 bg-quantum text-black font-semibold rounded-lg hover:bg-quantum-dim transition-colors"
              >
                <Download className="w-5 h-5" />
                <span>
                  {sealData.sealed_image
                    ? "Telecharger (avec C2PA)"
                    : "Telecharger l'image"}
                </span>
              </motion.button>
            )}

            {/* Download button - Video */}
            {capturedVideoUrl && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onDownloadVideo}
                className="w-full flex items-center justify-center gap-2 py-3 bg-quantum text-black font-semibold rounded-lg hover:bg-quantum-dim transition-colors"
              >
                <Download className="w-5 h-5" />
                <span>Telecharger la video</span>
              </motion.button>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  // Pending sync state
  if (state === "pending_sync") {
    return (
      <motion.div
        key="pending_sync"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-surface flex flex-col items-center gap-4 p-4 overflow-y-auto"
      >
        {/* Image preview with PendingSealBadge */}
        {(capturedImageUrl || pendingThumbnail) && !capturedVideoUrl && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative w-full max-w-sm rounded-xl overflow-hidden border border-amber-500/30"
          >
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
          </motion.div>
        )}

        {/* Video preview with PendingSealBadge */}
        {capturedVideoUrl && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative w-full max-w-sm rounded-xl overflow-hidden border border-amber-500/30"
          >
            <video src={capturedVideoUrl} controls playsInline className="w-full h-auto" />
            <div className="absolute bottom-12 right-2">
              <PendingSealBadge status="pending" size="small" />
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0"
          style={{ boxShadow: "0 0 30px rgba(245, 158, 11, 0.3)" }}
        >
          <CloudOff className="w-7 h-7 text-amber-400" />
        </motion.div>
        <h3 className="text-lg font-semibold text-amber-400">Sauvegarde locale</h3>
        <p className="text-foreground/60 text-sm text-center max-w-xs">
          Le media sera scelle automatiquement au retour de la connexion internet.
        </p>

        {/* Location display */}
        {capturedLocation && (
          <div className="w-full max-w-sm space-y-2">
            <p className="text-xs text-foreground/40">Localisation capturee</p>
            <MiniMap
              lat={capturedLocation.lat}
              lng={capturedLocation.lng}
              altitude={capturedLocation.altitude}
            />
          </div>
        )}

        {/* Pending sync indicator */}
        <div className="w-full max-w-sm bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center gap-2">
          <CloudOff className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-amber-400">En attente de synchronisation</span>
        </div>

        {pendingLocalId && (
          <div className="w-full max-w-sm bg-surface-elevated rounded-lg p-3">
            <p className="text-xs text-foreground/40 mb-1">ID local</p>
            <p className="font-mono text-xs text-foreground/60 break-all">
              {pendingLocalId}
            </p>
          </div>
        )}
      </motion.div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <motion.div
        key="error"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-surface flex flex-col items-center justify-center gap-4 p-6"
      >
        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
          <XCircle className="w-10 h-10 text-red-500" />
        </div>
        <h3 className="text-xl font-semibold text-red-500">Erreur</h3>
        <p className="text-foreground/60 text-sm text-center max-w-xs">{errorMessage}</p>
      </motion.div>
    );
  }

  return null;
}
