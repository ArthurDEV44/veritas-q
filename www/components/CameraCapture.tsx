"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Video,
  Loader2,
  CheckCircle,
  XCircle,
  RotateCcw,
  SwitchCamera,
  ShieldCheck,
  Download,
  MapPin,
  MapPinOff,
  User,
  Square,
  Circle,
  CloudOff,
} from "lucide-react";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { useDeviceAttestation } from "@/hooks/useDeviceAttestation";
import { useSealMutation, SealResponse } from "@/hooks/useSealMutation";
import { useOfflineStore } from "@/stores/offlineStore";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import DeviceAttestationBadge from "@/components/DeviceAttestationBadge";
import MiniMap from "@/components/MiniMap";
import SealBadge, { TrustTier } from "@/components/SealBadge";
import PendingSealBadge from "@/components/PendingSealBadge";
import OfflineIndicator from "@/components/OfflineIndicator";
import PendingCapturesList from "@/components/PendingCapturesList";
import { useAuth } from "@clerk/nextjs";

interface CapturedLocation {
  lat: number;
  lng: number;
  altitude?: number;
}

type CaptureState =
  | "idle"
  | "requesting"
  | "streaming"
  | "capturing"
  | "recording"
  | "sealing"
  | "saving_offline"
  | "success"
  | "pending_sync"
  | "error";

type CaptureMode = "photo" | "video";

// Video capture constants
const MAX_VIDEO_DURATION_SECONDS = 60; // 60 seconds for Free tier
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

// Get supported video MIME type
function getSupportedMimeType(): string {
  const types = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "video/webm"; // fallback
}

// Format seconds to MM:SS
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [state, setState] = useState<CaptureState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [sealData, setSealData] = useState<SealResponse | null>(null);
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);
  const [capturedVideoUrl, setCapturedVideoUrl] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("photo");
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [includeLocation, setIncludeLocation] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("veritas_include_gps") !== "false";
    }
    return true;
  });
  const [currentLocation, setCurrentLocation] = useState<GeolocationPosition | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [capturedLocation, setCapturedLocation] = useState<CapturedLocation | null>(null);
  const [pendingLocalId, setPendingLocalId] = useState<string | null>(null);
  const [pendingThumbnail, setPendingThumbnail] = useState<string | null>(null);

  const { isOffline } = useServiceWorker();
  const { getAttestationJson } = useDeviceAttestation();
  const { isSignedIn, userId } = useAuth();
  const sealMutation = useSealMutation();
  const { addPendingCapture } = useOfflineStore();
  const { pendingCount } = useOfflineSync();

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

  // Request geolocation when GPS is enabled
  useEffect(() => {
    if (!includeLocation) {
      setCurrentLocation(null);
      setLocationError(null);
      return;
    }

    if (!navigator.geolocation) {
      setLocationError("Geolocation not supported");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentLocation(position);
        setLocationError(null);
      },
      (error) => {
        setLocationError(error.message);
        setCurrentLocation(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 30000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [includeLocation]);

  // Persist location preference
  const toggleLocation = useCallback(() => {
    setIncludeLocation((prev) => {
      const newValue = !prev;
      localStorage.setItem("veritas_include_gps", String(newValue));
      return newValue;
    });
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
    // Note: We allow camera start even when offline for offline capture mode
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
      // Request audio only for video mode
      const needsAudio = captureMode === "video";
      const constraints: MediaStreamConstraints = isIOS()
        ? {
            video: {
              facingMode: facingMode,
            },
            audio: needsAudio,
          }
        : {
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1920, max: 3840 },
              height: { ideal: 1080, max: 2160 },
            },
            audio: needsAudio,
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
  }, [facingMode, stopCamera, captureMode]);

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

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Echec de la creation de l'image"));
        },
        "image/jpeg",
        0.92
      );
    });

    // Build location data if available
    const location = includeLocation && currentLocation
      ? {
          lat: currentLocation.coords.latitude,
          lng: currentLocation.coords.longitude,
          altitude: currentLocation.coords.altitude ?? undefined,
        }
      : undefined;

    // Store captured location for display in success screen
    setCapturedLocation(location ?? null);

    // Create a URL for the captured image so user can download it
    const imageUrl = URL.createObjectURL(blob);
    setCapturedImageUrl(imageUrl);

    // OFFLINE MODE: Save locally if offline
    if (isOffline) {
      setState("saving_offline");

      try {
        const localId = await addPendingCapture(
          blob,
          `capture_${Date.now()}.jpg`,
          "image",
          {
            location,
            deviceAttestation: getAttestationJson() ?? undefined,
            userId: userId ?? undefined,
          }
        );

        // Generate thumbnail for display
        const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.5);
        setPendingThumbnail(thumbnailUrl);
        setPendingLocalId(localId);

        setState("pending_sync");
        stopCamera();
      } catch (err) {
        setErrorMessage(getErrorMessage(err));
        setState("error");
      }
      return;
    }

    // ONLINE MODE: Send to API for quantum sealing
    setState("sealing");

    try {
      // Use mutation to create seal
      const data = await sealMutation.mutateAsync({
        file: blob,
        filename: `capture_${Date.now()}.jpg`,
        mediaType: "image",
        deviceAttestation: getAttestationJson() ?? undefined,
        location,
      });

      setSealData(data);
      setState("success");
      stopCamera();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setErrorMessage("Delai d'attente depasse. Reessayez.");
      } else {
        setErrorMessage(getErrorMessage(err));
      }
      setState("error");
    }
  }, [isOffline, stopCamera, getAttestationJson, sealMutation, includeLocation, currentLocation, addPendingCapture, userId]);

  // Stop video recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  // Start video recording
  const startRecording = useCallback(() => {
    if (!streamRef.current) {
      setErrorMessage("Flux camera non disponible");
      setState("error");
      return;
    }

    // Note: We allow recording even when offline for offline capture mode
    // Reset recorded chunks
    recordedChunksRef.current = [];
    setRecordingDuration(0);

    try {
      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        videoBitsPerSecond: 2500000, // 2.5 Mbps
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Clear recording timer
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        try {
          // Create video blob
          const mimeType = getSupportedMimeType();
          const videoBlob = new Blob(recordedChunksRef.current, { type: mimeType });

          // Check file size
          if (videoBlob.size > MAX_VIDEO_SIZE_BYTES) {
            throw new Error(`Video trop volumineuse (${Math.round(videoBlob.size / 1024 / 1024)}MB). Maximum: 50MB`);
          }

          // Build location data if available
          const location = includeLocation && currentLocation
            ? {
                lat: currentLocation.coords.latitude,
                lng: currentLocation.coords.longitude,
                altitude: currentLocation.coords.altitude ?? undefined,
              }
            : undefined;

          setCapturedLocation(location ?? null);

          // Determine file extension based on mime type
          const extension = mimeType.includes("mp4") ? "mp4" : "webm";

          // Create a URL for the captured video so user can preview/download it
          const videoUrl = URL.createObjectURL(videoBlob);
          setCapturedVideoUrl(videoUrl);

          // OFFLINE MODE: Save locally if offline
          if (isOffline) {
            setState("saving_offline");

            try {
              const localId = await addPendingCapture(
                videoBlob,
                `video_${Date.now()}.${extension}`,
                "video",
                {
                  location,
                  deviceAttestation: getAttestationJson() ?? undefined,
                  userId: userId ?? undefined,
                }
              );

              setPendingLocalId(localId);
              // No thumbnail for video in pending state, will use video URL
              setPendingThumbnail(null);

              setState("pending_sync");
              stopCamera();
            } catch (err) {
              setErrorMessage(getErrorMessage(err));
              setState("error");
            }
            return;
          }

          // ONLINE MODE: Send to API for quantum sealing
          setState("sealing");

          // Use mutation to create seal
          const data = await sealMutation.mutateAsync({
            file: videoBlob,
            filename: `video_${Date.now()}.${extension}`,
            mediaType: "video",
            deviceAttestation: getAttestationJson() ?? undefined,
            location,
          });

          setSealData(data);
          setState("success");
          stopCamera();
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            setErrorMessage("Delai d'attente depasse. Reessayez.");
          } else {
            setErrorMessage(getErrorMessage(err));
          }
          setState("error");
        }
      };

      mediaRecorder.onerror = () => {
        setErrorMessage("Erreur lors de l'enregistrement video");
        setState("error");
        stopRecording();
      };

      // Start recording with timeslice for regular data chunks
      mediaRecorder.start(1000);
      setState("recording");

      // Start recording duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          const newDuration = prev + 1;
          // Auto-stop at max duration
          if (newDuration >= MAX_VIDEO_DURATION_SECONDS) {
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);
    } catch {
      setErrorMessage("Impossible de demarrer l'enregistrement video");
      setState("error");
    }
  }, [isOffline, stopCamera, getAttestationJson, sealMutation, includeLocation, currentLocation, stopRecording, addPendingCapture, userId]);

  const reset = useCallback(() => {
    // Stop any ongoing recording
    stopRecording();
    stopCamera();
    setSealData(null);
    setCapturedLocation(null);
    setRecordingDuration(0);
    // Clean up the image URL to avoid memory leaks
    if (capturedImageUrl) {
      URL.revokeObjectURL(capturedImageUrl);
      setCapturedImageUrl(null);
    }
    // Clean up video URL
    if (capturedVideoUrl) {
      URL.revokeObjectURL(capturedVideoUrl);
      setCapturedVideoUrl(null);
    }
    // Clean up offline state
    setPendingLocalId(null);
    setPendingThumbnail(null);
    setErrorMessage("");
    setState("idle");
  }, [stopCamera, stopRecording, capturedImageUrl, capturedVideoUrl]);

  const downloadImage = useCallback(() => {
    if (!sealData) return;

    let blobUrl: string;

    if (sealData.sealed_image) {
      // Image with embedded C2PA manifest (preferred)
      const byteString = atob(sealData.sealed_image);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "image/jpeg" });
      blobUrl = URL.createObjectURL(blob);
    } else if (capturedImageUrl) {
      // Fallback: original image without C2PA manifest
      blobUrl = capturedImageUrl;
    } else {
      return;
    }

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `veritas-seal-${sealData.seal_id.slice(0, 8)}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up blob URL if we created one for sealed_image
    if (sealData.sealed_image) {
      URL.revokeObjectURL(blobUrl);
    }
  }, [capturedImageUrl, sealData]);

  const downloadVideo = useCallback(() => {
    if (!sealData || !capturedVideoUrl) return;

    const mimeType = getSupportedMimeType();
    const extension = mimeType.includes("mp4") ? "mp4" : "webm";

    const link = document.createElement("a");
    link.href = capturedVideoUrl;
    link.download = `veritas-seal-${sealData.seal_id.slice(0, 8)}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [capturedVideoUrl, sealData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      stopCamera();
    };
  }, [stopCamera, stopRecording]);

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Offline indicator banner */}
      {isOffline && state === "idle" && (
        <OfflineIndicator banner />
      )}

      {/* Device attestation badge + GPS toggle + Auth status */}
      <div className="w-full max-w-sm space-y-2">
        <DeviceAttestationBadge compact={state !== "idle"} />

        {/* GPS and Auth status row */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-elevated rounded-lg border border-border">
          {/* GPS Toggle */}
          <button
            onClick={toggleLocation}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
              includeLocation
                ? currentLocation
                  ? "bg-green-500/20 text-green-400"
                  : locationError
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-quantum/20 text-quantum"
                : "bg-surface text-foreground/40"
            }`}
          >
            {includeLocation ? (
              <>
                <MapPin className="w-4 h-4" />
                <span>{currentLocation ? "GPS actif" : locationError ? "GPS erreur" : "GPS..."}</span>
              </>
            ) : (
              <>
                <MapPinOff className="w-4 h-4" />
                <span>GPS off</span>
              </>
            )}
          </button>

          {/* Auth Status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            isSignedIn
              ? "bg-quantum/20 text-quantum"
              : "bg-surface text-foreground/40"
          }`}>
            <User className="w-4 h-4" />
            <span>{isSignedIn ? "Connecte" : "Anonyme"}</span>
          </div>
        </div>

        {/* Capture Mode Toggle (Photo/Video) */}
        {state === "idle" && (
          <div className="flex items-center justify-center gap-1 p-1 bg-surface-elevated rounded-full border border-border">
            <button
              onClick={() => setCaptureMode("photo")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                captureMode === "photo"
                  ? "bg-quantum text-black"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Photo</span>
            </button>
            <button
              onClick={() => setCaptureMode("video")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                captureMode === "video"
                  ? "bg-red-500 text-white"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Video</span>
            </button>
          </div>
        )}
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
                  <CloudOff className="w-10 h-10 text-amber-400" />
                ) : (
                  <Camera className="w-10 h-10 text-foreground/60" />
                )}
              </div>
              <p className="text-foreground/60 text-sm text-center px-4">
                {isOffline
                  ? "Mode hors-ligne actif"
                  : "Appuyez pour activer la camera"}
              </p>
              {isOffline && (
                <p className="text-amber-400/80 text-xs text-center px-4">
                  Les captures seront synchronisees au retour de la connexion
                </p>
              )}
              {isIOS() && !isOffline && (
                <p className="text-foreground/40 text-xs text-center px-4">
                  Safari recommande sur iOS
                </p>
              )}
            </motion.div>
          )}


          {(state === "requesting" ||
            state === "streaming" ||
            state === "recording" ||
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
                    Acces a la camera...
                  </p>
                </div>
              )}

              {/* Capture frame overlay - red when recording */}
              <div className={`absolute inset-4 border-2 rounded-lg pointer-events-none ${
                state === "recording" ? "border-red-500/50" : "border-quantum/30"
              }`} />

              {/* Corner markers - red when recording */}
              <div className={`absolute top-4 left-4 w-6 h-6 border-l-2 border-t-2 ${
                state === "recording" ? "border-red-500" : "border-quantum"
              }`} />
              <div className={`absolute top-4 right-4 w-6 h-6 border-r-2 border-t-2 ${
                state === "recording" ? "border-red-500" : "border-quantum"
              }`} />
              <div className={`absolute bottom-4 left-4 w-6 h-6 border-l-2 border-b-2 ${
                state === "recording" ? "border-red-500" : "border-quantum"
              }`} />
              <div className={`absolute bottom-4 right-4 w-6 h-6 border-r-2 border-b-2 ${
                state === "recording" ? "border-red-500" : "border-quantum"
              }`} />

              {/* Recording indicator */}
              {state === "recording" && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/90 backdrop-blur-sm text-white text-sm font-medium"
                >
                  <motion.div
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-2.5 h-2.5 rounded-full bg-white"
                  />
                  <span>{formatDuration(recordingDuration)}</span>
                  <span className="text-white/70">/ {formatDuration(MAX_VIDEO_DURATION_SECONDS)}</span>
                </motion.div>
              )}

              {/* Camera switch button */}
              {hasMultipleCameras && (state === "streaming" || state === "recording") && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={switchCamera}
                  disabled={state === "recording"}
                  className={`absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white transition-colors ${
                    state === "recording" ? "opacity-50 cursor-not-allowed" : "hover:bg-black/70"
                  }`}
                  aria-label="Changer de camera"
                >
                  <SwitchCamera className="w-5 h-5" />
                </motion.button>
              )}

              {/* Facing mode indicator */}
              <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full backdrop-blur-sm text-white text-xs ${
                state === "recording" ? "bg-red-500/50" : "bg-black/50"
              }`}>
                {facingMode === "environment" ? "Arriere" : "Avant"}
              </div>

              {/* Mode indicator when streaming */}
              {state === "streaming" && (
                <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs">
                  {captureMode === "photo" ? (
                    <>
                      <Camera className="w-3.5 h-3.5" />
                      <span>Photo</span>
                    </>
                  ) : (
                    <>
                      <Video className="w-3.5 h-3.5 text-red-400" />
                      <span>Video</span>
                    </>
                  )}
                </div>
              )}
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

          {state === "saving_offline" && (
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
          )}

          {state === "success" && (
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
                  <video
                    src={capturedVideoUrl}
                    controls
                    playsInline
                    className="w-full h-auto"
                  >
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
                      onClick={downloadImage}
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
                      onClick={downloadVideo}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-quantum text-black font-semibold rounded-lg hover:bg-quantum-dim transition-colors"
                    >
                      <Download className="w-5 h-5" />
                      <span>Telecharger la video</span>
                    </motion.button>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {state === "pending_sync" && (
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
                  <video
                    src={capturedVideoUrl}
                    controls
                    playsInline
                    className="w-full h-auto"
                  />
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
                <span className="text-sm text-amber-400">
                  En attente de synchronisation
                </span>
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
            className={`flex items-center gap-2 px-6 py-3 rounded-full border transition-colors ${
              isOffline
                ? "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-400"
                : "bg-surface-elevated hover:bg-surface-elevated/80 border-border"
            }`}
          >
            {isOffline ? (
              <CloudOff className="w-5 h-5" />
            ) : captureMode === "photo" ? (
              <Camera className="w-5 h-5" />
            ) : (
              <Video className="w-5 h-5 text-red-400" />
            )}
            <span>{isOffline ? "Capturer hors-ligne" : "Demarrer la camera"}</span>
          </motion.button>
        )}

        {/* Photo mode: Capture button */}
        {state === "streaming" && captureMode === "photo" && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={captureAndSeal}
            className={`relative flex items-center justify-center w-20 h-20 rounded-full font-semibold transition-all ${
              isOffline
                ? "bg-amber-500 text-black hover:bg-amber-400"
                : "bg-quantum text-black hover:bg-quantum-dim"
            }`}
            style={{ boxShadow: isOffline ? "0 0 20px rgba(245, 158, 11, 0.4)" : "0 0 20px rgba(0, 255, 209, 0.4)" }}
          >
            <span className="text-lg">{isOffline ? "SAVE" : "SCELLER"}</span>
            {/* Outer ring animation */}
            <span className={`absolute inset-0 rounded-full border-2 animate-ping opacity-30 ${
              isOffline ? "border-amber-500" : "border-quantum"
            }`} />
          </motion.button>
        )}

        {/* Video mode: Start recording button */}
        {state === "streaming" && captureMode === "video" && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={startRecording}
            className="relative flex items-center justify-center w-20 h-20 rounded-full bg-red-500 text-white font-semibold transition-all hover:bg-red-600"
            style={{ boxShadow: "0 0 20px rgba(239, 68, 68, 0.4)" }}
          >
            <Circle className="w-8 h-8 fill-current" />
            {/* Outer ring animation */}
            <span className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-30" />
          </motion.button>
        )}

        {/* Video mode: Stop recording button */}
        {state === "recording" && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={stopRecording}
            className="relative flex items-center justify-center w-20 h-20 rounded-full bg-red-600 text-white font-semibold transition-all hover:bg-red-700"
            style={{ boxShadow: "0 0 30px rgba(239, 68, 68, 0.5)" }}
          >
            <Square className="w-8 h-8 fill-current" />
            {/* Pulsing ring when recording */}
            <motion.span
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="absolute inset-0 rounded-full border-2 border-red-400 opacity-50"
            />
          </motion.button>
        )}

        {(state === "success" || state === "error" || state === "pending_sync") && (
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
          className={`flex items-center gap-2 text-sm ${
            isOffline ? "text-amber-400" : "text-foreground/60"
          }`}
        >
          {isOffline ? (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Mode hors-ligne - sauvegarde locale</span>
            </>
          ) : captureMode === "photo" ? (
            <>
              <span className="w-2 h-2 rounded-full bg-quantum animate-pulse" />
              <span>Pret a capturer</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span>Appuyez pour enregistrer (max {MAX_VIDEO_DURATION_SECONDS}s)</span>
            </>
          )}
        </motion.div>
      )}

      {/* Status indicator for recording */}
      {state === "recording" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-2 text-sm ${
            isOffline ? "text-amber-400" : "text-red-400"
          }`}
        >
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className={`w-2 h-2 rounded-full ${isOffline ? "bg-amber-500" : "bg-red-500"}`}
          />
          <span>
            {isOffline
              ? "Enregistrement hors-ligne..."
              : "Enregistrement en cours..."}
          </span>
        </motion.div>
      )}

      {/* Pending captures list - shown when idle and there are pending captures */}
      {state === "idle" && pendingCount > 0 && (
        <div className="w-full max-w-sm">
          <PendingCapturesList collapsible maxItems={3} />
        </div>
      )}

      {/* Offline sync status - shown when idle */}
      {state === "idle" && !isOffline && pendingCount > 0 && (
        <OfflineIndicator />
      )}
    </div>
  );
}
