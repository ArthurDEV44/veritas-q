"use client";

import { Camera, Video, RotateCcw, Circle, Square, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CaptureState =
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

export type CaptureMode = "photo" | "video";

interface CaptureControlsProps {
  state: CaptureState;
  captureMode: CaptureMode;
  isOffline: boolean;
  onStartCamera: () => void;
  onCapture: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onReset: () => void;
}

export default function CaptureControls({
  state,
  captureMode,
  isOffline,
  onStartCamera,
  onCapture,
  onStartRecording,
  onStopRecording,
  onReset,
}: CaptureControlsProps) {
  return (
    <div className="flex gap-4">
      {/* Idle: Start camera button */}
      {state === "idle" && (
        <Button
          variant={isOffline ? "outline" : "outline"}
          size="lg"
          onClick={onStartCamera}
          className={`rounded-full px-6 active:scale-[0.97] transition-all ${
            isOffline
              ? "border-warning/30 text-warning hover:bg-warning/10"
              : ""
          }`}
        >
          {isOffline ? (
            <CloudOff className="w-5 h-5" />
          ) : captureMode === "photo" ? (
            <Camera className="w-5 h-5" />
          ) : (
            <Video className="w-5 h-5 text-destructive" />
          )}
          <span>{isOffline ? "Capturer hors-ligne" : "Demarrer la camera"}</span>
        </Button>
      )}

      {/* Photo mode: Capture button */}
      {state === "streaming" && captureMode === "photo" && (
        <button
          onClick={onCapture}
          aria-label={isOffline ? "Sauvegarder la capture" : "Sceller la photo"}
          className={`relative flex items-center justify-center w-20 h-20 rounded-full font-semibold transition-all active:scale-[0.95] ${
            isOffline
              ? "bg-warning text-black hover:bg-warning/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
          style={{
            boxShadow: isOffline
              ? "0 0 20px var(--warning)"
              : "0 0 20px var(--quantum-glow)",
          }}
        >
          <span className="text-lg">{isOffline ? "SAVE" : "SCELLER"}</span>
          <span
            className={`absolute inset-0 rounded-full border-2 animate-ping opacity-30 ${
              isOffline ? "border-warning" : "border-primary"
            }`}
          />
        </button>
      )}

      {/* Video mode: Start recording button */}
      {state === "streaming" && captureMode === "video" && (
        <button
          onClick={onStartRecording}
          aria-label="Commencer l'enregistrement video"
          className="relative flex items-center justify-center w-20 h-20 rounded-full bg-destructive text-white font-semibold transition-all active:scale-[0.95] hover:bg-destructive/90"
          style={{ boxShadow: "0 0 20px var(--destructive)" }}
        >
          <Circle className="w-8 h-8 fill-current" />
          <span className="absolute inset-0 rounded-full border-2 border-destructive animate-ping opacity-30" />
        </button>
      )}

      {/* Video mode: Stop recording button */}
      {state === "recording" && (
        <button
          onClick={onStopRecording}
          aria-label="Arreter l'enregistrement video"
          className="relative flex items-center justify-center w-20 h-20 rounded-full bg-destructive text-white font-semibold transition-all active:scale-[0.95] hover:bg-destructive/80"
          style={{ boxShadow: "0 0 30px var(--destructive)" }}
        >
          <Square className="w-8 h-8 fill-current" />
          <span className="absolute inset-0 rounded-full border-2 border-destructive/50 animate-[glow-pulse_1s_infinite]" />
        </button>
      )}

      {/* Reset button after success, error, or pending sync */}
      {(state === "success" || state === "error" || state === "pending_sync") && (
        <Button
          variant="outline"
          size="lg"
          onClick={onReset}
          className="rounded-full px-6 active:scale-[0.97] transition-all"
        >
          <RotateCcw className="w-5 h-5" />
          <span>Nouvelle capture</span>
        </Button>
      )}
    </div>
  );
}
