"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Loader2,
  CheckCircle,
  XCircle,
  RotateCcw,
  SwitchCamera,
  WifiOff,
  ShieldCheck,
} from "lucide-react";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { useDeviceAttestation } from "@/hooks/useDeviceAttestation";
import DeviceAttestationBadge from "@/components/DeviceAttestationBadge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type CaptureState =
  | "idle"
  | "requesting"
  | "streaming"
  | "capturing"
  | "sealing"
  | "success"
  | "error";

interface SealResponse {
  seal_id: string;
  seal_data: string;
  timestamp: number;
  has_device_attestation: boolean;
}

// Detect iOS for specific handling
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !("MSStream" in window)
  );
}

// Localized error messages
function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Une erreur inattendue s'est produite";
  }

  const message = error.message.toLowerCase();

  if (message.includes("permission") || message.includes("notallowed")) {
    return "Accès à la caméra refusé. Veuillez autoriser l'accès dans les paramètres de votre navigateur.";
  }
  if (message.includes("notfound") || message.includes("not found")) {
    return "Aucune caméra détectée sur cet appareil.";
  }
  if (message.includes("notreadable") || message.includes("not readable")) {
    return "La caméra est utilisée par une autre application.";
  }
  if (message.includes("overconstrained")) {
    return "La caméra ne supporte pas la résolution demandée.";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "Erreur réseau. Vérifiez votre connexion internet.";
  }

  return error.message;
}

export default function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<CaptureState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [sealData, setSealData] = useState<SealResponse | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const { isOffline } = useServiceWorker();
  const { getAttestationJson } = useDeviceAttestation();

  // Check for multiple cameras on mount
  useEffect(() => {
    async function checkCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        setHasMultipleCameras(videoDevices.length > 1);
      } catch {
        // Ignore errors during enumeration
      }
    }
    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      checkCameras();
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    // Check offline status
    if (isOffline) {
      setErrorMessage(
        "Connexion internet requise pour le scellement quantique."
      );
      setState("error");
      return;
    }

    setState("requesting");

    try {
      // Check if mediaDevices is available
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Votre navigateur ne supporte pas l'accès à la caméra."
        );
      }

      // Request camera with iOS-friendly constraints
      // iOS Safari is picky - use simpler constraints
      const constraints: MediaStreamConstraints = isIOS()
        ? {
            video: {
              facingMode: facingMode,
            },
            audio: false,
          }
        : {
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1920, max: 3840 },
              height: { ideal: 1080, max: 2160 },
            },
            audio: false,
          };

      console.log("Requesting camera with constraints:", JSON.stringify(constraints));
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("Got media stream:", stream.id);

      if (videoRef.current) {
        const video = videoRef.current;
        streamRef.current = stream;

        // Log stream info for debugging
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          console.log("Camera track:", videoTrack.label);
          console.log("Track settings:", JSON.stringify(videoTrack.getSettings()));
          console.log("Track state:", videoTrack.readyState, "enabled:", videoTrack.enabled);
        }

        // iOS Safari specific: ensure video element is ready
        video.setAttribute("autoplay", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("muted", "");
        video.muted = true;

        // Set srcObject
        video.srcObject = stream;
        console.log("Set video.srcObject, readyState:", video.readyState);

        // For iOS: try to play immediately without waiting for events
        if (isIOS()) {
          console.log("iOS detected - using direct play approach");

          // Small delay to let iOS process the stream
          await new Promise(resolve => setTimeout(resolve, 100));

          try {
            await video.play();
            console.log("iOS video.play() succeeded, readyState:", video.readyState);
          } catch (playError) {
            console.warn("iOS video.play() failed:", playError);
          }

          // Check if video is actually playing
          if (video.readyState >= 2) {
            console.log("Video ready, dimensions:", video.videoWidth, "x", video.videoHeight);
            setState("streaming");
            return;
          }

          // Wait a bit more for iOS
          await new Promise(resolve => setTimeout(resolve, 500));

          if (video.readyState >= 1) {
            console.log("Video loading, proceeding to streaming state");
            setState("streaming");
            return;
          }

          // Last resort: proceed anyway after 2 seconds
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log("iOS fallback: proceeding with readyState:", video.readyState);
          setState("streaming");
        } else {
          // Non-iOS: wait for proper events
          await new Promise<void>((resolve, reject) => {
            const onLoadedMetadata = () => {
              console.log("Video loadedmetadata:", video.videoWidth, "x", video.videoHeight);
              cleanup();
              resolve();
            };

            const onCanPlay = () => {
              console.log("Video canplay event");
              cleanup();
              resolve();
            };

            const onError = (e: Event) => {
              console.error("Video error:", e);
              cleanup();
              reject(new Error("Échec du chargement du flux vidéo"));
            };

            const cleanup = () => {
              video.removeEventListener("loadedmetadata", onLoadedMetadata);
              video.removeEventListener("canplay", onCanPlay);
              video.removeEventListener("error", onError);
            };

            video.addEventListener("loadedmetadata", onLoadedMetadata);
            video.addEventListener("canplay", onCanPlay);
            video.addEventListener("error", onError);

            // Timeout fallback
            setTimeout(() => {
              console.log("Video timeout - proceeding anyway. readyState:", video.readyState);
              cleanup();
              resolve();
            }, 5000);
          });

          // Play the video
          try {
            await video.play();
            console.log("Video playing successfully");
          } catch (playError) {
            console.warn("Video play warning:", playError);
          }

          setState("streaming");
        }
      }
    } catch (err) {
      stopCamera();
      setErrorMessage(getErrorMessage(err));
      setState("error");
    }
  }, [facingMode, isOffline, stopCamera]);

  const switchCamera = useCallback(async () => {
    stopCamera();
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }, [stopCamera]);

  // Restart camera when facingMode changes (after initial mount)
  useEffect(() => {
    if (state === "streaming" || state === "requesting") {
      // Camera was already started, restart with new facing mode
      const restart = async () => {
        await startCamera();
      };
      restart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const captureAndSeal = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    // Double-check offline status before sealing
    if (isOffline) {
      setErrorMessage(
        "Connexion internet requise pour le scellement quantique."
      );
      setState("error");
      return;
    }

    setState("capturing");

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      setErrorMessage("Contexte canvas non disponible");
      setState("error");
      return;
    }

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame
    ctx.drawImage(video, 0, 0);

    setState("sealing");

    try {
      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Échec de la création de l'image"));
          },
          "image/jpeg",
          0.92
        );
      });

      // Create form data
      const formData = new FormData();
      formData.append("file", blob, `capture_${Date.now()}.jpg`);
      formData.append("media_type", "image");

      // Include device attestation if available and fresh
      const attestationJson = getAttestationJson();
      if (attestationJson) {
        formData.append("device_attestation", attestationJson);
      }

      // Send to API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${API_URL}/seal`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || `Erreur HTTP ${response.status}`);
      }

      const data: SealResponse = await response.json();
      setSealData(data);
      setState("success");
      stopCamera();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setErrorMessage("Délai d'attente dépassé. Réessayez.");
      } else {
        setErrorMessage(getErrorMessage(err));
      }
      setState("error");
    }
  }, [isOffline, stopCamera, getAttestationJson]);

  const reset = useCallback(() => {
    stopCamera();
    setSealData(null);
    setErrorMessage("");
    setState("idle");
  }, [stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Device attestation badge */}
      <div className="w-full max-w-sm">
        <DeviceAttestationBadge compact={state !== "idle"} />
      </div>

      {/* Camera viewport */}
      <div className="relative w-full aspect-[4/3] sm:aspect-video bg-surface rounded-2xl overflow-hidden border border-border">
        <AnimatePresence mode="wait">
          {state === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4"
            >
              <div className="w-20 h-20 rounded-full bg-surface-elevated flex items-center justify-center">
                {isOffline ? (
                  <WifiOff className="w-10 h-10 text-foreground/40" />
                ) : (
                  <Camera className="w-10 h-10 text-foreground/60" />
                )}
              </div>
              <p className="text-foreground/60 text-sm text-center px-4">
                {isOffline
                  ? "Connexion requise pour capturer"
                  : "Appuyez pour activer la caméra"}
              </p>
              {isIOS() && !isOffline && (
                <p className="text-foreground/40 text-xs text-center px-4">
                  Safari recommandé sur iOS
                </p>
              )}
            </motion.div>
          )}


          {(state === "requesting" ||
            state === "streaming" ||
            state === "capturing" ||
            state === "sealing") && (
            <motion.div
              key="video"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Loading overlay during camera request */}
              {state === "requesting" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/80">
                  <Loader2 className="w-12 h-12 text-quantum animate-spin" />
                  <p className="text-foreground/60 text-sm mt-4">
                    Accès à la caméra...
                  </p>
                </div>
              )}

              {/* Capture frame overlay */}
              <div className="absolute inset-4 border-2 border-quantum/30 rounded-lg pointer-events-none" />

              {/* Corner markers */}
              <div className="absolute top-4 left-4 w-6 h-6 border-l-2 border-t-2 border-quantum" />
              <div className="absolute top-4 right-4 w-6 h-6 border-r-2 border-t-2 border-quantum" />
              <div className="absolute bottom-4 left-4 w-6 h-6 border-l-2 border-b-2 border-quantum" />
              <div className="absolute bottom-4 right-4 w-6 h-6 border-r-2 border-b-2 border-quantum" />

              {/* Camera switch button */}
              {hasMultipleCameras && state === "streaming" && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={switchCamera}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                  aria-label="Changer de caméra"
                >
                  <SwitchCamera className="w-5 h-5" />
                </motion.button>
              )}

              {/* Facing mode indicator */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs">
                {facingMode === "environment" ? "Arrière" : "Avant"}
              </div>
            </motion.div>
          )}

          {state === "sealing" && (
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
          )}

          {state === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-surface flex flex-col items-center justify-center gap-4 p-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center"
                style={{ boxShadow: "0 0 30px rgba(34, 197, 94, 0.3)" }}
              >
                <CheckCircle className="w-10 h-10 text-green-500" />
              </motion.div>
              <h3 className="text-xl font-semibold text-green-500">Scellé !</h3>
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
                  <div className={`rounded-lg p-3 flex items-center gap-2 ${
                    sealData.has_device_attestation
                      ? "bg-green-500/10 border border-green-500/30"
                      : "bg-surface-elevated"
                  }`}>
                    {sealData.has_device_attestation ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-green-500">Appareil attesté</span>
                      </>
                    ) : (
                      <span className="text-xs text-foreground/40">Sans attestation d&apos;appareil</span>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {state === "error" && (
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
              <p className="text-foreground/60 text-sm text-center max-w-xs">
                {errorMessage}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Action buttons */}
      <div className="flex gap-4">
        {state === "idle" && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={startCamera}
            disabled={isOffline}
            className="flex items-center gap-2 px-6 py-3 bg-surface-elevated hover:bg-surface-elevated/80 rounded-full border border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Camera className="w-5 h-5" />
            <span>Démarrer la caméra</span>
          </motion.button>
        )}

        {state === "streaming" && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={captureAndSeal}
            className="relative flex items-center justify-center w-20 h-20 rounded-full bg-quantum text-black font-semibold transition-all hover:bg-quantum-dim"
            style={{ boxShadow: "0 0 20px rgba(0, 255, 209, 0.4)" }}
          >
            <span className="text-lg">SCELLER</span>
            {/* Outer ring animation */}
            <span className="absolute inset-0 rounded-full border-2 border-quantum animate-ping opacity-30" />
          </motion.button>
        )}

        {(state === "success" || state === "error") && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={reset}
            className="flex items-center gap-2 px-6 py-3 bg-surface-elevated hover:bg-surface-elevated/80 rounded-full border border-border transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
            <span>Nouvelle capture</span>
          </motion.button>
        )}
      </div>

      {/* Status indicator for streaming */}
      {state === "streaming" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-foreground/60"
        >
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>Prêt à capturer</span>
        </motion.div>
      )}
    </div>
  );
}
