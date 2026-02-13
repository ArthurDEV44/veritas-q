"use client";

import { motion } from "motion/react";
import { Camera, Video, RotateCcw, Circle, Square, CloudOff } from "lucide-react";

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
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onStartCamera}
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
          onClick={onCapture}
          className={`relative flex items-center justify-center w-20 h-20 rounded-full font-semibold transition-all ${
            isOffline
              ? "bg-amber-500 text-black hover:bg-amber-400"
              : "bg-quantum text-black hover:bg-quantum-dim"
          }`}
          style={{
            boxShadow: isOffline
              ? "0 0 20px rgba(245, 158, 11, 0.4)"
              : "0 0 20px rgba(0, 255, 209, 0.4)",
          }}
        >
          <span className="text-lg">{isOffline ? "SAVE" : "SCELLER"}</span>
          {/* Outer ring animation */}
          <span
            className={`absolute inset-0 rounded-full border-2 animate-ping opacity-30 ${
              isOffline ? "border-amber-500" : "border-quantum"
            }`}
          />
        </motion.button>
      )}

      {/* Video mode: Start recording button */}
      {state === "streaming" && captureMode === "video" && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onStartRecording}
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
          onClick={onStopRecording}
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

      {/* Reset button after success, error, or pending sync */}
      {(state === "success" || state === "error" || state === "pending_sync") && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onReset}
          className="flex items-center gap-2 px-6 py-3 bg-surface-elevated hover:bg-surface-elevated/80 rounded-full border border-border transition-colors"
        >
          <RotateCcw className="w-5 h-5" />
          <span>Nouvelle capture</span>
        </motion.button>
      )}
    </div>
  );
}
