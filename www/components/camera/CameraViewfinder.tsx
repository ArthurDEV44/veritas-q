"use client";

import { RefObject } from "react";
import { motion } from "motion/react";
import {
  Camera,
  Video,
  Loader2,
  SwitchCamera,
  CloudOff,
} from "lucide-react";
import { isIOS } from "@/lib/device";
import type { CaptureState, CaptureMode } from "./CaptureControls";

interface CameraViewfinderProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  state: CaptureState;
  captureMode: CaptureMode;
  facingMode: "environment" | "user";
  hasMultipleCameras: boolean;
  recordingDuration: number;
  isOffline: boolean;
  onSwitchCamera: () => void;
}

const MAX_VIDEO_DURATION_SECONDS = 60;

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function CameraViewfinder({
  videoRef,
  state,
  captureMode,
  facingMode,
  hasMultipleCameras,
  recordingDuration,
  isOffline,
  onSwitchCamera,
}: CameraViewfinderProps) {
  // Idle state
  if (state === "idle") {
    return (
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
    );
  }

  // Video stream state
  if (
    state === "requesting" ||
    state === "streaming" ||
    state === "recording" ||
    state === "capturing" ||
    state === "sealing"
  ) {
    return (
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
        <div
          className={`absolute inset-4 border-2 rounded-lg pointer-events-none ${
            state === "recording" ? "border-red-500/50" : "border-quantum/30"
          }`}
        />

        {/* Corner markers - red when recording */}
        <div
          className={`absolute top-4 left-4 w-6 h-6 border-l-2 border-t-2 ${
            state === "recording" ? "border-red-500" : "border-quantum"
          }`}
        />
        <div
          className={`absolute top-4 right-4 w-6 h-6 border-r-2 border-t-2 ${
            state === "recording" ? "border-red-500" : "border-quantum"
          }`}
        />
        <div
          className={`absolute bottom-4 left-4 w-6 h-6 border-l-2 border-b-2 ${
            state === "recording" ? "border-red-500" : "border-quantum"
          }`}
        />
        <div
          className={`absolute bottom-4 right-4 w-6 h-6 border-r-2 border-b-2 ${
            state === "recording" ? "border-red-500" : "border-quantum"
          }`}
        />

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
            <span className="text-white/70">
              / {formatDuration(MAX_VIDEO_DURATION_SECONDS)}
            </span>
          </motion.div>
        )}

        {/* Camera switch button */}
        {hasMultipleCameras && (state === "streaming" || state === "recording") && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onSwitchCamera}
            disabled={state === "recording"}
            className={`absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white transition-colors ${
              state === "recording"
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-black/70"
            }`}
            aria-label="Changer de camera"
          >
            <SwitchCamera className="w-5 h-5" />
          </motion.button>
        )}

        {/* Facing mode indicator */}
        <div
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full backdrop-blur-sm text-white text-xs ${
            state === "recording" ? "bg-red-500/50" : "bg-black/50"
          }`}
        >
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
    );
  }

  return null;
}
