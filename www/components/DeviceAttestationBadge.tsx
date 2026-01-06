"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  ShieldCheck,
  ShieldX,
  Fingerprint,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
} from "lucide-react";
import {
  useDeviceAttestation,
  DeviceAttestation,
} from "@/hooks/useDeviceAttestation";

interface DeviceAttestationBadgeProps {
  compact?: boolean;
  onAttestationChange?: (attestation: DeviceAttestation | null) => void;
}

export default function DeviceAttestationBadge({
  compact = false,
  onAttestationChange,
}: DeviceAttestationBadgeProps) {
  const {
    isSupported,
    isRegistered,
    isAuthenticated,
    isLoading,
    error,
    attestation,
    register,
    authenticate,
    clear,
    isFresh,
  } = useDeviceAttestation();

  const [showDetails, setShowDetails] = useState(false);

  // Handle registration/authentication
  const handleAttest = useCallback(async () => {
    let success = false;

    if (isRegistered) {
      // Already registered, just authenticate to refresh
      success = await authenticate();
    } else {
      // First time, register the device
      const deviceName = `Veritas Device ${new Date().toLocaleDateString("fr-FR")}`;
      success = await register(deviceName);
    }

    if (success && onAttestationChange) {
      // Small delay to ensure state is updated
      setTimeout(() => {
        const stored = localStorage.getItem("veritas-device-attestation");
        if (stored) {
          onAttestationChange(JSON.parse(stored));
        }
      }, 100);
    }
  }, [isRegistered, authenticate, register, onAttestationChange]);

  // Handle clear
  const handleClear = useCallback(() => {
    clear();
    if (onAttestationChange) {
      onAttestationChange(null);
    }
  }, [clear, onAttestationChange]);

  // Not supported
  if (!isSupported) {
    if (compact) {
      return (
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface-elevated border border-border text-foreground/40 text-xs"
          title="WebAuthn non supporté"
        >
          <ShieldX className="w-3.5 h-3.5" />
          <span>Non supporté</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-elevated border border-border">
        <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center">
          <ShieldX className="w-5 h-5 text-foreground/40" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground/60">
            Attestation non disponible
          </p>
          <p className="text-xs text-foreground/40">
            WebAuthn n&apos;est pas supporté sur cet appareil
          </p>
        </div>
      </div>
    );
  }

  // Compact mode
  if (compact) {
    const fresh = isFresh();

    if (isLoading) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface-elevated border border-border text-foreground/60 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Attestation...</span>
        </div>
      );
    }

    if (isAuthenticated && fresh) {
      return (
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-500 text-xs hover:bg-green-500/20 transition-colors"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Attesté</span>
        </button>
      );
    }

    if (isRegistered) {
      return (
        <button
          onClick={handleAttest}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 text-xs hover:bg-yellow-500/20 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualiser</span>
        </button>
      );
    }

    return (
      <button
        onClick={handleAttest}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-quantum/10 border border-quantum/30 text-quantum text-xs hover:bg-quantum/20 transition-colors"
      >
        <Fingerprint className="w-3.5 h-3.5" />
        <span>Attester</span>
      </button>
    );
  }

  // Full mode
  const fresh = isFresh();

  return (
    <div className="relative">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-elevated border border-border">
        {/* Icon */}
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isAuthenticated && fresh
              ? "bg-green-500/20"
              : isRegistered
                ? "bg-yellow-500/20"
                : "bg-quantum/20"
          }`}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 text-quantum animate-spin" />
          ) : isAuthenticated && fresh ? (
            <ShieldCheck className="w-5 h-5 text-green-500" />
          ) : isRegistered ? (
            <Shield className="w-5 h-5 text-yellow-500" />
          ) : (
            <Fingerprint className="w-5 h-5 text-quantum" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {isAuthenticated && fresh
              ? "Appareil attesté"
              : isRegistered
                ? "Attestation expirée"
                : "Attestation disponible"}
          </p>
          <p className="text-xs text-foreground/60 truncate">
            {isAuthenticated && fresh && attestation
              ? attestation.device_model?.description || "Authenticateur vérifié"
              : isRegistered
                ? "Actualisez pour re-attester"
                : "Enregistrez cet appareil"}
          </p>
        </div>

        {/* Action button */}
        {!isLoading && (
          <div className="flex items-center gap-2">
            {isRegistered && (
              <button
                onClick={handleClear}
                className="p-2 rounded-lg hover:bg-foreground/5 text-foreground/40 hover:text-foreground/60 transition-colors"
                title="Supprimer l'enregistrement"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleAttest}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isAuthenticated && fresh
                  ? "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                  : isRegistered
                    ? "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
                    : "bg-quantum/10 text-quantum hover:bg-quantum/20"
              }`}
            >
              {isAuthenticated && fresh
                ? "Voir"
                : isRegistered
                  ? "Actualiser"
                  : "Enregistrer"}
            </button>
          </div>
        )}
      </div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 z-20"
          >
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-500">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Details modal */}
      <AnimatePresence>
        {showDetails && attestation && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute top-full left-0 right-0 mt-2 p-4 rounded-xl bg-surface-elevated border border-border shadow-lg z-10"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-foreground">
                Détails de l&apos;attestation
              </h4>
              <button
                onClick={() => setShowDetails(false)}
                className="p-1 rounded hover:bg-foreground/5"
              >
                <X className="w-4 h-4 text-foreground/60" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-foreground/60">ID du credential</span>
                <span className="font-mono text-foreground/80 truncate max-w-[150px]">
                  {attestation.credential_id.slice(0, 20)}...
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground/60">Type</span>
                <span className="text-foreground/80">
                  {attestation.authenticator_type === "platform"
                    ? "Plateforme"
                    : "Externe"}
                </span>
              </div>
              {attestation.device_model && (
                <div className="flex justify-between">
                  <span className="text-foreground/60">Modèle</span>
                  <span className="text-foreground/80">
                    {attestation.device_model.description}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-foreground/60">Compteur</span>
                <span className="font-mono text-foreground/80">
                  {attestation.sign_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground/60">Attesté le</span>
                <span className="text-foreground/80">
                  {new Date(attestation.attested_at * 1000).toLocaleString(
                    "fr-FR"
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground/60">Statut</span>
                <span
                  className={`px-2 py-0.5 rounded ${fresh ? "bg-green-500/20 text-green-500" : "bg-yellow-500/20 text-yellow-500"}`}
                >
                  {fresh ? "Valide" : "Expiré"}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
