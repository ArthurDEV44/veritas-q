import { useRef, useCallback, type Dispatch } from "react";
import { useDeviceAttestation } from "@/hooks/useDeviceAttestation";
import { useSealMutation } from "@/hooks/useSealMutation";
import { useOfflineStore } from "@/stores/offlineStore";
import { getSupportedMimeType } from "./utils";
import type { CapturedLocation } from "./LocationCapture";
import type { CaptureState } from "./CaptureControls";
import type { CameraCaptureAction, CameraCaptureState } from "./reducer";

interface UseCapturePipelineOptions {
  state: CameraCaptureState;
  dispatch: Dispatch<CameraCaptureAction>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stopCamera: () => void;
  stopRecording: () => void;
  includeLocation: boolean;
  isOffline: boolean;
}

export function useCapturePipeline({
  state,
  dispatch,
  videoRef,
  stopCamera,
  stopRecording,
  includeLocation,
  isOffline,
}: UseCapturePipelineOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { getAttestationJson } = useDeviceAttestation();
  const sealMutation = useSealMutation();
  const { addPendingCapture } = useOfflineStore();

  const setError = useCallback(
    (msg: string) => dispatch({ type: "SET_ERROR", payload: msg }),
    [dispatch],
  );

  // -- Core seal-or-save logic -----------------------------------------------

  const sealOrSave = useCallback(
    async (blob: Blob, filename: string, mediaType: "image" | "video", location?: CapturedLocation) => {
      if (isOffline) {
        dispatch({ type: "SET_CAPTURE_STATE", payload: "saving_offline" });
        try {
          const localId = await addPendingCapture(blob, filename, mediaType, {
            location,
            deviceAttestation: getAttestationJson() ?? undefined,
          });
          const thumbnail =
            mediaType === "image" && canvasRef.current
              ? canvasRef.current.toDataURL("image/jpeg", 0.5)
              : null;
          dispatch({
            type: "OFFLINE_SAVED",
            localId,
            thumbnail,
            imageUrl: mediaType === "image" ? URL.createObjectURL(blob) : null,
            videoUrl: mediaType === "video" ? URL.createObjectURL(blob) : null,
            location: location ?? null,
          });
          stopCamera();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      dispatch({ type: "SET_CAPTURE_STATE", payload: "sealing" });
      try {
        const data = await sealMutation.mutateAsync({
          file: blob,
          filename,
          mediaType,
          deviceAttestation: getAttestationJson() ?? undefined,
          location,
        });
        dispatch({
          type: "SEAL_SUCCESS",
          sealData: data,
          imageUrl: mediaType === "image" ? state.capturedImageUrl : null,
          videoUrl: mediaType === "video" ? state.capturedVideoUrl : null,
          location: location ?? null,
        });
        stopCamera();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [isOffline, addPendingCapture, getAttestationJson, sealMutation, stopCamera, setError, dispatch, state.capturedImageUrl, state.capturedVideoUrl],
  );

  // -- Photo capture ---------------------------------------------------------

  const captureAndSeal = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    dispatch({ type: "SET_CAPTURE_STATE", payload: "capturing" });

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Contexte canvas non disponible");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Echec de la creation de l'image"))),
        "image/jpeg",
        0.92,
      );
    });

    const location =
      includeLocation && state.currentLocation
        ? {
            lat: state.currentLocation.coords.latitude,
            lng: state.currentLocation.coords.longitude,
            altitude: state.currentLocation.coords.altitude ?? undefined,
          }
        : undefined;

    const imageUrl = URL.createObjectURL(blob);
    dispatch({ type: "CAPTURE_TAKEN", imageUrl, location: location ?? null });
    await sealOrSave(blob, `capture_${Date.now()}.jpg`, "image", location);
  }, [videoRef, includeLocation, state.currentLocation, sealOrSave, setError, dispatch]);

  // -- Video callback --------------------------------------------------------

  const handleVideoRecorded = useCallback(
    async (videoUrl: string, videoBlob: Blob, extension: string, location?: CapturedLocation) => {
      dispatch({ type: "VIDEO_TAKEN", videoUrl, location: location ?? null });
      await sealOrSave(videoBlob, `video_${Date.now()}.${extension}`, "video", location);
    },
    [sealOrSave, dispatch],
  );

  // -- Downloads -------------------------------------------------------------

  const downloadImage = useCallback(() => {
    const { sealData, capturedImageUrl } = state;
    if (!sealData) return;

    let blobUrl: string;
    if (sealData.sealed_image) {
      const bytes = Uint8Array.from(atob(sealData.sealed_image), (c) => c.charCodeAt(0));
      blobUrl = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
    } else if (capturedImageUrl) {
      blobUrl = capturedImageUrl;
    } else {
      return;
    }

    triggerDownload(blobUrl, `veritas-seal-${sealData.seal_id.slice(0, 8)}.jpg`);
    if (sealData.sealed_image) URL.revokeObjectURL(blobUrl);
  }, [state]);

  const downloadVideo = useCallback(() => {
    const { sealData, capturedVideoUrl } = state;
    if (!sealData || !capturedVideoUrl) return;
    const ext = getSupportedMimeType().includes("mp4") ? "mp4" : "webm";
    triggerDownload(capturedVideoUrl, `veritas-seal-${sealData.seal_id.slice(0, 8)}.${ext}`);
  }, [state]);

  // -- Reset -----------------------------------------------------------------

  const reset = useCallback(() => {
    stopRecording();
    stopCamera();
    if (state.capturedImageUrl) URL.revokeObjectURL(state.capturedImageUrl);
    if (state.capturedVideoUrl) URL.revokeObjectURL(state.capturedVideoUrl);
    dispatch({ type: "RESET" });
  }, [stopCamera, stopRecording, state.capturedImageUrl, state.capturedVideoUrl, dispatch]);

  return {
    canvasRef,
    captureAndSeal,
    handleVideoRecorded,
    downloadImage,
    downloadVideo,
    reset,
    setError,
    setState: useCallback((s: CaptureState) => dispatch({ type: "SET_CAPTURE_STATE", payload: s }), [dispatch]),
  };
}

// -- Helpers -----------------------------------------------------------------

function triggerDownload(url: string, filename: string) {
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
