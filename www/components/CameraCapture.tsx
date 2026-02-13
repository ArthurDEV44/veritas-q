"use client";

import { useReducer, useEffect } from "react";
import { Camera, Video, User } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import DeviceAttestationBadge from "@/components/DeviceAttestationBadge";
import OfflineIndicator from "@/components/OfflineIndicator";
import PendingCapturesList from "@/components/PendingCapturesList";
import CameraViewfinder from "./camera/CameraViewfinder";
import CaptureControls, { type CaptureMode } from "./camera/CaptureControls";
import CapturePreview from "./camera/CapturePreview";
import LocationCapture, { useLocationPreference } from "./camera/LocationCapture";
import { useCameraStream } from "./camera/useCameraStream";
import { useVideoRecorder } from "./camera/useVideoRecorder";
import { useCapturePipeline } from "./camera/useCapturePipeline";
import { cameraCaptureReducer, initialCameraCaptureState } from "./camera/reducer";

export default function CameraCapture() {
  const [state, dispatch] = useReducer(cameraCaptureReducer, initialCameraCaptureState);
  const { isSignedIn } = useAuth();
  const { isOffline } = useServiceWorker();
  const { pendingCount } = useOfflineSync();
  const { includeLocation, toggleLocation } = useLocationPreference();

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

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {isOffline && state.captureState === "idle" && <OfflineIndicator banner />}

      {/* Toolbar */}
      <div className="w-full max-w-sm space-y-2">
        <DeviceAttestationBadge compact={state.captureState !== "idle"} />
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-elevated rounded-lg border border-border">
          <LocationCapture
            includeLocation={includeLocation}
            onToggle={toggleLocation}
            onLocationChange={(loc) => dispatch({ type: "SET_LOCATION", payload: loc })}
          />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${isSignedIn ? "bg-quantum/20 text-quantum" : "bg-surface text-foreground/40"}`}>
            <User className="w-4 h-4" />
            <span>{isSignedIn ? "Connecte" : "Anonyme"}</span>
          </div>
        </div>
        {state.captureState === "idle" && (
          <ModeToggle current={state.captureMode} onChange={(m) => dispatch({ type: "SET_CAPTURE_MODE", payload: m })} />
        )}
      </div>

      {/* Viewfinder + preview */}
      <div className="relative w-full aspect-[4/3] sm:aspect-video bg-surface rounded-2xl overflow-hidden border border-border">
        <CameraViewfinder videoRef={videoRef} state={state.captureState} captureMode={state.captureMode} facingMode={facingMode} hasMultipleCameras={hasMultipleCameras} recordingDuration={recordingDuration} isOffline={isOffline} onSwitchCamera={switchCamera} />
        <CapturePreview state={state.captureState} sealData={state.sealData} capturedImageUrl={state.capturedImageUrl} capturedVideoUrl={state.capturedVideoUrl} capturedLocation={state.capturedLocation} pendingLocalId={state.pendingLocalId} pendingThumbnail={state.pendingThumbnail} errorMessage={state.errorMessage} onDownloadImage={downloadImage} onDownloadVideo={downloadVideo} />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Controls */}
      <CaptureControls state={state.captureState} captureMode={state.captureMode} isOffline={isOffline} onStartCamera={startCamera} onCapture={captureAndSeal} onStartRecording={startRecording} onStopRecording={stopRec} onReset={reset} />

      {/* Status hints */}
      {state.captureState === "streaming" && <StatusHint mode={state.captureMode} isOffline={isOffline} />}
      {state.captureState === "recording" && (
        <div className={`flex items-center gap-2 text-sm ${isOffline ? "text-amber-400" : "text-red-400"}`}>
          <span className={`w-2 h-2 rounded-full ${isOffline ? "bg-amber-500" : "bg-red-500"} animate-pulse`} />
          <span>{isOffline ? "Enregistrement hors-ligne..." : "Enregistrement en cours..."}</span>
        </div>
      )}

      {/* Pending captures */}
      {state.captureState === "idle" && pendingCount > 0 && (
        <div className="w-full max-w-sm"><PendingCapturesList collapsible maxItems={3} /></div>
      )}
      {state.captureState === "idle" && !isOffline && pendingCount > 0 && <OfflineIndicator />}
    </div>
  );
}

/* ---------- Small presentational helpers ---------- */

function ModeToggle({ current, onChange }: { current: CaptureMode; onChange: (m: CaptureMode) => void }) {
  return (
    <div className="flex items-center justify-center gap-1 p-1 bg-surface-elevated rounded-full border border-border">
      {(["photo", "video"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            current === m
              ? m === "photo" ? "bg-quantum text-black" : "bg-red-500 text-white"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          {m === "photo" ? <Camera className="w-4 h-4" /> : <Video className="w-4 h-4" />}
          <span>{m === "photo" ? "Photo" : "Video"}</span>
        </button>
      ))}
    </div>
  );
}

function StatusHint({ mode, isOffline }: { mode: CaptureMode; isOffline: boolean }) {
  if (isOffline) return (
    <div className="flex items-center gap-2 text-sm text-amber-400">
      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
      <span>Mode hors-ligne - sauvegarde locale</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2 text-sm text-foreground/60">
      <span className={`w-2 h-2 rounded-full ${mode === "photo" ? "bg-quantum" : "bg-red-500"} animate-pulse`} />
      <span>{mode === "photo" ? "Pret a capturer" : "Appuyez pour enregistrer (max 60s)"}</span>
    </div>
  );
}
