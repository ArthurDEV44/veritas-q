"use client";

import { RefObject } from "react";
import {
  Camera,
  Video,
  SwitchCamera,
  CloudOff,
} from "lucide-react";
import { isIOS } from "@/lib/device";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
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
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 animate-[fadeIn_0.3s_var(--ease-out-expo)]">
        <div className="w-20 h-20 rounded-full bg-surface-elevated flex items-center justify-center">
          {isOffline ? (
            <CloudOff className="w-10 h-10 text-warning" />
          ) : (
            <Camera className="w-10 h-10 text-muted-foreground" />
          )}
        </div>
        <p className="text-muted-foreground text-sm text-center px-4">
          {isOffline
            ? "Mode hors-ligne actif"
            : "Appuyez pour activer la camera"}
        </p>
        {isOffline && (
          <p className="text-warning text-xs text-center px-4">
            Les captures seront synchronisees au retour de la connexion
          </p>
        )}
        {isIOS() && !isOffline && (
          <p className="text-muted-foreground/60 text-xs text-center px-4">
            Safari recommande sur iOS
          </p>
        )}
      </div>
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
      <div className="absolute inset-0 animate-[fadeIn_0.2s_var(--ease-out-expo)]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Flux de la camera"
          className="w-full h-full object-cover"
        />

        {/* Loading overlay during camera request */}
        {state === "requesting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <Spinner className="w-10 h-10 text-primary" />
            <p className="text-muted-foreground text-sm mt-4">
              Acces a la camera...
            </p>
          </div>
        )}

        {/* Viewfinder corner brackets */}
        <div className="absolute inset-4 pointer-events-none">
          {/* Corner markers */}
          <div
            className={`absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 ${
              state === "recording" ? "border-destructive" : "border-primary"
            }`}
          />
          <div
            className={`absolute top-0 right-0 w-6 h-6 border-r-2 border-t-2 ${
              state === "recording" ? "border-destructive" : "border-primary"
            }`}
          />
          <div
            className={`absolute bottom-0 left-0 w-6 h-6 border-l-2 border-b-2 ${
              state === "recording" ? "border-destructive" : "border-primary"
            }`}
          />
          <div
            className={`absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 ${
              state === "recording" ? "border-destructive" : "border-primary"
            }`}
          />
        </div>

        {/* Recording indicator */}
        {state === "recording" && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 animate-[slideDown_0.2s_var(--ease-out-expo)]">
            <Badge variant="error" size="lg" className="gap-1.5 px-3 py-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              <span>{formatDuration(recordingDuration)}</span>
              <span className="opacity-70">
                / {formatDuration(MAX_VIDEO_DURATION_SECONDS)}
              </span>
            </Badge>
          </div>
        )}

        {/* Camera switch button */}
        {hasMultipleCameras && (state === "streaming" || state === "recording") && (
          <div className="absolute top-4 right-4 animate-[fadeIn_0.2s_var(--ease-out-expo)]">
            <Button
              size="icon"
              variant="ghost"
              onClick={onSwitchCamera}
              disabled={state === "recording"}
              className="rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 disabled:opacity-50"
              aria-label="Changer de camera"
            >
              <SwitchCamera className="w-5 h-5" />
            </Button>
          </div>
        )}

        {/* Facing mode indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <Badge
            variant={state === "recording" ? "error" : "outline"}
            size="sm"
            className="backdrop-blur-sm"
          >
            {facingMode === "environment" ? "Arriere" : "Avant"}
          </Badge>
        </div>

        {/* Mode indicator when streaming */}
        {state === "streaming" && (
          <div className="absolute top-4 left-4">
            <Badge variant="outline" size="sm" className="gap-1 backdrop-blur-sm">
              {captureMode === "photo" ? (
                <>
                  <Camera className="w-3 h-3" />
                  <span>Photo</span>
                </>
              ) : (
                <>
                  <Video className="w-3 h-3 text-destructive" />
                  <span>Video</span>
                </>
              )}
            </Badge>
          </div>
        )}
      </div>
    );
  }

  return null;
}
