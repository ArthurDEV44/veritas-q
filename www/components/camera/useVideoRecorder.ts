import { useRef, useState, useCallback } from "react";
import {
  getSupportedMimeType,
  getErrorMessage,
  MAX_VIDEO_DURATION_SECONDS,
  MAX_VIDEO_SIZE_BYTES,
} from "./utils";
import type { CaptureState } from "./CaptureControls";
import type { CapturedLocation } from "./LocationCapture";

interface UseVideoRecorderOptions {
  streamRef: React.RefObject<MediaStream | null>;
  includeLocation: boolean;
  currentLocation: GeolocationPosition | null;
  onStateChange: (state: CaptureState) => void;
  onError: (message: string) => void;
  onSuccess: (
    videoUrl: string,
    videoBlob: Blob,
    extension: string,
    location?: CapturedLocation
  ) => void;
}

export function useVideoRecorder({
  streamRef,
  includeLocation,
  currentLocation,
  onStateChange,
  onError,
  onSuccess,
}: UseVideoRecorderOptions) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) {
      onError("Flux camera non disponible");
      onStateChange("error");
      return;
    }

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
            throw new Error(
              `Video trop volumineuse (${Math.round(videoBlob.size / 1024 / 1024)}MB). Maximum: 50MB`
            );
          }

          // Build location data if available
          const location =
            includeLocation && currentLocation
              ? {
                  lat: currentLocation.coords.latitude,
                  lng: currentLocation.coords.longitude,
                  altitude: currentLocation.coords.altitude ?? undefined,
                }
              : undefined;

          // Determine file extension based on mime type
          const extension = mimeType.includes("mp4") ? "mp4" : "webm";

          // Create a URL for the captured video
          const videoUrl = URL.createObjectURL(videoBlob);

          // Call success handler with video data
          onSuccess(videoUrl, videoBlob, extension, location);
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            onError("Delai d'attente depasse. Reessayez.");
          } else {
            onError(getErrorMessage(err));
          }
          onStateChange("error");
        }
      };

      mediaRecorder.onerror = () => {
        onError("Erreur lors de l'enregistrement video");
        onStateChange("error");
        stopRecording();
      };

      // Start recording with timeslice for regular data chunks
      mediaRecorder.start(1000);
      onStateChange("recording");

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
      onError("Impossible de demarrer l'enregistrement video");
      onStateChange("error");
    }
  }, [streamRef, includeLocation, currentLocation, onStateChange, onError, onSuccess, stopRecording]);

  return {
    recordingDuration,
    startRecording,
    stopRecording,
  };
}
