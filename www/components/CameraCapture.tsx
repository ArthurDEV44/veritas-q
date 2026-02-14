"use client";

import { useReducer, useEffect, useCallback } from "react";
import { Camera, Video, User } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import DeviceAttestationBadge from "@/components/DeviceAttestationBadge";
import { ConnectivityIndicator } from "@/components/ConnectivityStatus";
import PendingCapturesList from "@/components/PendingCapturesList";
import CameraViewfinder from "./camera/CameraViewfinder";
import CaptureControls, { type CaptureMode } from "./camera/CaptureControls";
import CapturePreview from "./camera/CapturePreview";
import LocationCapture, { useLocationPreference } from "./camera/LocationCapture";
import { useCameraStream } from "./camera/useCameraStream";
import { useVideoRecorder } from "./camera/useVideoRecorder";
import { useCapturePipeline } from "./camera/useCapturePipeline";
import { cameraCaptureReducer, initialCameraCaptureState } from "./camera/reducer";
import { ToggleGroup, Toggle } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { toastManager } from "@/components/ui/toast";

export default function CameraCapture() {
  const [state, dispatch] = useReducer(cameraCaptureReducer, initialCameraCaptureState);
  const { isSignedIn } = useAuth();
  const { isOffline } = useServiceWorker();
  const { pendingCount } = useOfflineSync();
  const { includeLocation, toggleLocation } = useLocationPreference();

  const onLocationChange = useCallback(
    (loc: GeolocationPosition | null) => dispatch({ type: "SET_LOCATION", payload: loc }),
    []
  );

  const { videoRef, facingMode, hasMultipleCameras, startCamera, stopCamera, switchCamera, streamRef } =
    useCameraStream({
      captureMode: state.captureMode,
      onStateChange: (s) => dispatch({ type: "SET_CAPTURE_STATE", payload: s }),
      onError: (msg) => dispatch({ type: "SET_ERROR", payload: msg }),
    });

  const {
    canvasRef,
    captureAndSeal, handleVideoRecorded,
    downloadImage, downloadVideo,
    reset, setError, setState: setPipelineState,
  } = useCapturePipeline({
    state, dispatch, videoRef, stopCamera,
    stopRecording: () => stopRec(),
    includeLocation, isOffline,
  });

  const { recordingDuration, startRecording, stopRecording: stopRec } = useVideoRecorder({
    streamRef, includeLocation,
    currentLocation: state.currentLocation,
    onStateChange: setPipelineState,
    onError: setError,
    onSuccess: handleVideoRecorded,
  });

  // Cleanup on unmount
  useEffect(() => () => { stopRec(); stopCamera(); }, [stopCamera, stopRec]);

  // Toast notifications for capture outcomes
  useEffect(() => {
    if (state.captureState === "success") {
      toastManager.add({
        title: "Scelle avec succes !",
        description: state.sealData?.seal_id
          ? `Seal ID: ${state.sealData.seal_id.slice(0, 12)}...`
          : undefined,
        type: "success",
      });
    } else if (state.captureState === "pending_sync") {
      toastManager.add({
        title: "Sauvegarde locale",
        description: "Le media sera scelle au retour de la connexion.",
        type: "warning",
      });
    } else if (state.captureState === "error" && state.errorMessage) {
      toastManager.add({
        title: "Erreur de capture",
        description: state.errorMessage,
        type: "error",
      });
    }
  }, [state.captureState, state.sealData?.seal_id, state.errorMessage]);

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {isOffline && state.captureState === "idle" && <ConnectivityIndicator banner />}

      {/* Toolbar */}
      <div className="w-full max-w-sm space-y-2">
        <DeviceAttestationBadge compact={state.captureState !== "idle"} />
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-card rounded-lg border border-border">
          <LocationCapture
            includeLocation={includeLocation}
            onToggle={toggleLocation}
            onLocationChange={onLocationChange}
          />
          <Badge
            variant={isSignedIn ? "success" : "outline"}
            size="lg"
            className="gap-1.5"
          >
            <User className="w-3.5 h-3.5" />
            <span>{isSignedIn ? "Connecte" : "Anonyme"}</span>
          </Badge>
        </div>
        {state.captureState === "idle" && (
          <ModeToggle
            current={state.captureMode}
            onChange={(m) => dispatch({ type: "SET_CAPTURE_MODE", payload: m })}
          />
        )}
      </div>

      {/* Viewfinder + preview */}
      <div className="relative w-full aspect-[4/3] sm:aspect-video bg-card rounded-2xl overflow-hidden border border-border">
        <CameraViewfinder videoRef={videoRef} state={state.captureState} captureMode={state.captureMode} facingMode={facingMode} hasMultipleCameras={hasMultipleCameras} recordingDuration={recordingDuration} isOffline={isOffline} onSwitchCamera={switchCamera} />
        <CapturePreview state={state.captureState} sealData={state.sealData} capturedImageUrl={state.capturedImageUrl} capturedVideoUrl={state.capturedVideoUrl} capturedLocation={state.capturedLocation} pendingLocalId={state.pendingLocalId} pendingThumbnail={state.pendingThumbnail} errorMessage={state.errorMessage} onDownloadImage={downloadImage} onDownloadVideo={downloadVideo} />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Controls */}
      <CaptureControls state={state.captureState} captureMode={state.captureMode} isOffline={isOffline} onStartCamera={startCamera} onCapture={captureAndSeal} onStartRecording={startRecording} onStopRecording={stopRec} onReset={reset} />

      {/* Status hints */}
      {state.captureState === "streaming" && <StatusHint mode={state.captureMode} isOffline={isOffline} />}
      {state.captureState === "recording" && (
        <div className={`flex items-center gap-2 text-sm ${isOffline ? "text-warning" : "text-destructive"}`}>
          <span className={`w-2 h-2 rounded-full ${isOffline ? "bg-warning" : "bg-destructive"} animate-pulse`} />
          <span>{isOffline ? "Enregistrement hors-ligne..." : "Enregistrement en cours..."}</span>
        </div>
      )}

      {/* Pending captures */}
      {state.captureState === "idle" && pendingCount > 0 && (
        <div className="w-full max-w-sm"><PendingCapturesList collapsible maxItems={3} /></div>
      )}
      {state.captureState === "idle" && !isOffline && pendingCount > 0 && <ConnectivityIndicator />}
    </div>
  );
}

/* ---------- Small presentational helpers ---------- */

function ModeToggle({ current, onChange }: { current: CaptureMode; onChange: (m: CaptureMode) => void }) {
  return (
    <ToggleGroup
      defaultValue={[current]}
      variant="outline"
      className="w-full justify-center"
    >
      <Toggle
        value="photo"
        aria-label="Mode photo"
        pressed={current === "photo"}
        onPressedChange={(pressed) => { if (pressed) onChange("photo"); }}
        className={`flex-1 gap-2 ${current === "photo" ? "bg-primary text-primary-foreground" : ""}`}
      >
        <Camera className="w-4 h-4" />
        <span>Photo</span>
      </Toggle>
      <Toggle
        value="video"
        aria-label="Mode video"
        pressed={current === "video"}
        onPressedChange={(pressed) => { if (pressed) onChange("video"); }}
        className={`flex-1 gap-2 ${current === "video" ? "bg-destructive text-white" : ""}`}
      >
        <Video className="w-4 h-4" />
        <span>Video</span>
      </Toggle>
    </ToggleGroup>
  );
}

function StatusHint({ mode, isOffline }: { mode: CaptureMode; isOffline: boolean }) {
  if (isOffline) return (
    <div className="flex items-center gap-2 text-sm text-warning">
      <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
      <span>Mode hors-ligne - sauvegarde locale</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className={`w-2 h-2 rounded-full ${mode === "photo" ? "bg-primary" : "bg-destructive"} animate-pulse`} />
      <span>{mode === "photo" ? "Pret a capturer" : "Appuyez pour enregistrer (max 60s)"}</span>
    </div>
  );
}
