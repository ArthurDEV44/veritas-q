"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Loader2, CheckCircle, XCircle, RotateCcw } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type CaptureState = "idle" | "streaming" | "capturing" | "sealing" | "success" | "error";

interface SealResponse {
  seal_id: string;
  seal_data: string;
  timestamp: number;
}

export default function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<CaptureState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [sealData, setSealData] = useState<SealResponse | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setState("streaming");
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to access camera"
      );
      setState("error");
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

  const captureAndSeal = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setState("capturing");

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      setErrorMessage("Canvas context not available");
      setState("error");
      return;
    }

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame
    ctx.drawImage(video, 0, 0);

    setState("sealing");

    try {
      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to create image blob"));
          },
          "image/jpeg",
          0.92
        );
      });

      // Create form data
      const formData = new FormData();
      formData.append("file", blob, `capture_${Date.now()}.jpg`);
      formData.append("media_type", "image");

      // Send to API
      const response = await fetch(`${API_URL}/seal`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || `HTTP ${response.status}`);
      }

      const data: SealResponse = await response.json();
      setSealData(data);
      setState("success");
      stopCamera();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to create seal"
      );
      setState("error");
    }
  }, [stopCamera]);

  const reset = useCallback(() => {
    stopCamera();
    setSealData(null);
    setErrorMessage("");
    setState("idle");
  }, [stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="flex flex-col items-center gap-6 w-full">
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
                <Camera className="w-10 h-10 text-foreground/60" />
              </div>
              <p className="text-foreground/60 text-sm">
                Tap to enable camera
              </p>
            </motion.div>
          )}

          {(state === "streaming" || state === "capturing" || state === "sealing") && (
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

              {/* Capture frame overlay */}
              <div className="absolute inset-4 border-2 border-quantum/30 rounded-lg pointer-events-none" />

              {/* Corner markers */}
              <div className="absolute top-4 left-4 w-6 h-6 border-l-2 border-t-2 border-quantum" />
              <div className="absolute top-4 right-4 w-6 h-6 border-r-2 border-t-2 border-quantum" />
              <div className="absolute bottom-4 left-4 w-6 h-6 border-l-2 border-b-2 border-quantum" />
              <div className="absolute bottom-4 right-4 w-6 h-6 border-r-2 border-b-2 border-quantum" />
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
              <p className="text-quantum font-medium">
                Quantum Sealing...
              </p>
              <p className="text-foreground/60 text-sm">
                Binding entropy to content
              </p>
            </motion.div>
          )}

          {state === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-surface flex flex-col items-center justify-center gap-4 p-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center quantum-glow"
                style={{ boxShadow: "0 0 30px rgba(34, 197, 94, 0.3)" }}
              >
                <CheckCircle className="w-10 h-10 text-green-500" />
              </motion.div>
              <h3 className="text-xl font-semibold text-green-500">
                Sealed!
              </h3>
              {sealData && (
                <div className="w-full max-w-sm space-y-2">
                  <div className="bg-surface-elevated rounded-lg p-3">
                    <p className="text-xs text-foreground/40 mb-1">Seal ID</p>
                    <p className="font-mono text-sm text-foreground/80 break-all">
                      {sealData.seal_id}
                    </p>
                  </div>
                  <div className="bg-surface-elevated rounded-lg p-3">
                    <p className="text-xs text-foreground/40 mb-1">Timestamp</p>
                    <p className="font-mono text-sm text-foreground/80">
                      {new Date(sealData.timestamp).toISOString()}
                    </p>
                  </div>
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
              <h3 className="text-xl font-semibold text-red-500">
                Error
              </h3>
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
            className="flex items-center gap-2 px-6 py-3 bg-surface-elevated hover:bg-surface-elevated/80 rounded-full border border-border transition-colors"
          >
            <Camera className="w-5 h-5" />
            <span>Start Camera</span>
          </motion.button>
        )}

        {state === "streaming" && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={captureAndSeal}
            className="relative flex items-center justify-center w-20 h-20 rounded-full bg-quantum text-black font-semibold transition-all hover:bg-quantum-dim quantum-glow"
          >
            <span className="text-lg">SEAL</span>
            {/* Outer ring animation */}
            <span className="absolute inset-0 rounded-full border-2 border-quantum animate-ping opacity-30" />
          </motion.button>
        )}

        {(state === "success" || state === "error") && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={reset}
            className="flex items-center gap-2 px-6 py-3 bg-surface-elevated hover:bg-surface-elevated/80 rounded-full border border-border transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
            <span>New Capture</span>
          </motion.button>
        )}
      </div>

      {/* Status indicator for streaming */}
      {state === "streaming" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-foreground/60"
        >
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>Recording ready</span>
        </motion.div>
      )}
    </div>
  );
}
