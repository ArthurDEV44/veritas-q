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
} from "lucide-react";
import { useServiceWorker } from "@/hooks/useServiceWorker";

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
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;

        // Important for iOS: wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;

          const onLoadedMetadata = () => {
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("error", onError);
            resolve();
          };

          const onError = () => {
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("error", onError);
            reject(new Error("Échec du chargement du flux vidéo"));
          };

          video.addEventListener("loadedmetadata", onLoadedMetadata);
          video.addEventListener("error", onError);

          // Timeout for iOS
          setTimeout(() => {
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("error", onError);
            resolve(); // Resolve anyway after timeout
          }, 3000);
        });

        // Play the video (required for iOS)
        try {
          await videoRef.current.play();
        } catch (playError) {
          // iOS may require user gesture, but autoplay with muted should work
          console.warn("Video play warning:", playError);
        }

        setState("streaming");
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
  }, [isOffline, stopCamera]);

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

          {state === "requesting" && (
            <motion.div
              key="requesting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4"
            >
              <Loader2 className="w-12 h-12 text-quantum animate-spin" />
              <p className="text-foreground/60 text-sm">
                Accès à la caméra...
              </p>
            </motion.div>
          )}

          {(state === "streaming" ||
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
