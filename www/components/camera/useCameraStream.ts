import { useRef, useState, useCallback, useEffect } from "react";
import { isIOS } from "@/lib/device";
import { getErrorMessage } from "./utils";
import type { CaptureMode, CaptureState } from "./CaptureControls";

interface UseCameraStreamOptions {
  captureMode: CaptureMode;
  onStateChange: (state: CaptureState) => void;
  onError: (message: string) => void;
}

export function useCameraStream({
  captureMode,
  onStateChange,
  onError,
}: UseCameraStreamOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

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
    onStateChange("requesting");

    try {
      // Check if mediaDevices is available
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Votre navigateur ne supporte pas l'accès à la caméra.");
      }

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
          await new Promise((resolve) => setTimeout(resolve, 100));

          try {
            await video.play();
            console.log("iOS video.play() succeeded, readyState:", video.readyState);
          } catch (playError) {
            console.warn("iOS video.play() failed:", playError);
          }

          // Check if video is actually playing
          if (video.readyState >= 2) {
            console.log("Video ready, dimensions:", video.videoWidth, "x", video.videoHeight);
            onStateChange("streaming");
            return;
          }

          // Wait a bit more for iOS
          await new Promise((resolve) => setTimeout(resolve, 500));

          if (video.readyState >= 1) {
            console.log("Video loading, proceeding to streaming state");
            onStateChange("streaming");
            return;
          }

          // Last resort: proceed anyway after 2 seconds
          await new Promise((resolve) => setTimeout(resolve, 2000));
          console.log("iOS fallback: proceeding with readyState:", video.readyState);
          onStateChange("streaming");
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

          onStateChange("streaming");
        }
      }
    } catch (err) {
      stopCamera();
      onError(getErrorMessage(err));
      onStateChange("error");
    }
  }, [facingMode, captureMode, onStateChange, onError, stopCamera]);

  const switchCamera = useCallback(async () => {
    stopCamera();
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }, [stopCamera]);

  // Restart camera when facingMode changes (after initial mount)
  useEffect(() => {
    // Only restart if we're already streaming
    let isMounted = true;
    const restart = async () => {
      if (isMounted) {
        await startCamera();
      }
    };
    restart();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  return {
    videoRef,
    streamRef,
    facingMode,
    hasMultipleCameras,
    startCamera,
    stopCamera,
    switchCamera,
  };
}
