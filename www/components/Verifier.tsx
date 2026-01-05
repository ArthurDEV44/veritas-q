"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Shield,
  ShieldCheck,
  ShieldX,
  Loader2,
  FileImage,
  X,
  AlertCircle,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type VerifyState = "idle" | "dropped" | "verifying" | "verified" | "failed" | "error";

interface VerifyResponse {
  authentic: boolean;
  details: string;
}

interface DroppedFile {
  file: File;
  preview?: string;
}

export default function Verifier() {
  const [state, setState] = useState<VerifyState>("idle");
  const [isDragOver, setIsDragOver] = useState(false);
  const [mediaFile, setMediaFile] = useState<DroppedFile | null>(null);
  const [sealFile, setSealFile] = useState<DroppedFile | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      processFiles(files);
    },
    []
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = Array.from(e.target.files);
        processFiles(files);
      }
    },
    []
  );

  const processFiles = (files: File[]) => {
    for (const file of files) {
      if (file.name.endsWith(".veritas")) {
        // This is a seal file
        setSealFile({ file });
      } else if (file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/")) {
        // This is a media file
        const preview = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
        setMediaFile({ file, preview });
      }
    }
    setState("dropped");
  };

  const verify = useCallback(async () => {
    if (!mediaFile || !sealFile) return;

    setState("verifying");
    setErrorMessage("");

    try {
      // Read seal file as text (base64 encoded CBOR)
      const sealText = await sealFile.file.text();

      const formData = new FormData();
      formData.append("file", mediaFile.file);
      formData.append("seal_data", sealText);

      const response = await fetch(`${API_URL}/verify`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || `HTTP ${response.status}`);
      }

      const data: VerifyResponse = await response.json();
      setVerifyResult(data);
      setState(data.authentic ? "verified" : "failed");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Verification failed"
      );
      setState("error");
    }
  }, [mediaFile, sealFile]);

  const reset = useCallback(() => {
    if (mediaFile?.preview) {
      URL.revokeObjectURL(mediaFile.preview);
    }
    setMediaFile(null);
    setSealFile(null);
    setVerifyResult(null);
    setErrorMessage("");
    setState("idle");
  }, [mediaFile]);

  const canVerify = mediaFile && sealFile;

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Result Shield */}
      <AnimatePresence mode="wait">
        {(state === "verified" || state === "failed") && (
          <motion.div
            key="shield"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className={`flex flex-col items-center gap-4 p-8 rounded-2xl ${
              state === "verified"
                ? "bg-green-500/10 shield-verified"
                : "bg-red-500/10 shield-failed"
            }`}
          >
            {state === "verified" ? (
              <>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="quantum-glow"
                  style={{
                    boxShadow: "0 0 40px rgba(34, 197, 94, 0.4)",
                    borderRadius: "999px"
                  }}
                >
                  <ShieldCheck className="w-24 h-24 text-green-500" />
                </motion.div>
                <h2 className="text-2xl font-bold text-green-500">AUTHENTIC</h2>
                <p className="text-foreground/60 text-center max-w-sm">
                  {verifyResult?.details}
                </p>
              </>
            ) : (
              <>
                <motion.div
                  animate={{ x: [0, -5, 5, -5, 5, 0] }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <ShieldX className="w-24 h-24 text-red-500" />
                </motion.div>
                <h2 className="text-2xl font-bold text-red-500">INVALID</h2>
                <p className="text-foreground/60 text-center max-w-sm">
                  {verifyResult?.details || "The seal does not match the content"}
                </p>
              </>
            )}
            <button
              onClick={reset}
              className="mt-4 px-6 py-2 bg-surface-elevated hover:bg-surface-elevated/80 rounded-full border border-border transition-colors text-sm"
            >
              Verify Another
            </button>
          </motion.div>
        )}

        {state === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 p-6 bg-red-500/10 rounded-2xl"
          >
            <AlertCircle className="w-16 h-16 text-red-500" />
            <h3 className="text-lg font-semibold text-red-500">Error</h3>
            <p className="text-foreground/60 text-center max-w-sm">{errorMessage}</p>
            <button
              onClick={reset}
              className="mt-2 px-6 py-2 bg-surface-elevated hover:bg-surface-elevated/80 rounded-full border border-border transition-colors text-sm"
            >
              Try Again
            </button>
          </motion.div>
        )}

        {state !== "verified" && state !== "failed" && state !== "error" && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full"
          >
            {/* Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative w-full aspect-[4/3] sm:aspect-video rounded-2xl border-2 border-dashed transition-all duration-200 ${
                isDragOver
                  ? "border-quantum bg-quantum/10"
                  : "border-border bg-surface hover:border-foreground/30"
              }`}
            >
              <input
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.veritas"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              {state === "verifying" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="w-12 h-12 text-quantum animate-spin" />
                  <p className="text-quantum font-medium">Verifying...</p>
                  <p className="text-foreground/60 text-sm">
                    Checking quantum signature
                  </p>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                      isDragOver
                        ? "bg-quantum/20"
                        : "bg-surface-elevated"
                    }`}
                  >
                    {isDragOver ? (
                      <Shield className="w-8 h-8 text-quantum" />
                    ) : (
                      <Upload className="w-8 h-8 text-foreground/60" />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground">
                      {isDragOver ? "Drop files here" : "Drop files to verify"}
                    </p>
                    <p className="text-sm text-foreground/60 mt-1">
                      or click to browse
                    </p>
                  </div>
                  <p className="text-xs text-foreground/40 mt-2">
                    Drop both the media file and its .veritas seal
                  </p>
                </div>
              )}
            </div>

            {/* File indicators */}
            {(mediaFile || sealFile) && state !== "verifying" && (
              <div className="mt-4 space-y-2">
                {mediaFile && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 p-3 bg-surface-elevated rounded-lg"
                  >
                    {mediaFile.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaFile.preview}
                        alt="Preview"
                        className="w-10 h-10 rounded object-cover"
                      />
                    ) : (
                      <FileImage className="w-10 h-10 text-foreground/60 p-2 bg-surface rounded" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {mediaFile.file.name}
                      </p>
                      <p className="text-xs text-foreground/60">
                        {(mediaFile.file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => setMediaFile(null)}
                      className="p-1 hover:bg-surface rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-foreground/60" />
                    </button>
                  </motion.div>
                )}

                {sealFile && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 p-3 bg-surface-elevated rounded-lg"
                  >
                    <Shield className="w-10 h-10 text-quantum p-2 bg-quantum/10 rounded" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {sealFile.file.name}
                      </p>
                      <p className="text-xs text-quantum">Veritas Seal</p>
                    </div>
                    <button
                      onClick={() => setSealFile(null)}
                      className="p-1 hover:bg-surface rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-foreground/60" />
                    </button>
                  </motion.div>
                )}
              </div>
            )}

            {/* Verify button */}
            {canVerify && state === "dropped" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 flex justify-center"
              >
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={verify}
                  className="flex items-center gap-2 px-8 py-3 bg-quantum text-black font-semibold rounded-full hover:bg-quantum-dim transition-colors quantum-glow-sm"
                >
                  <Shield className="w-5 h-5" />
                  <span>Verify Seal</span>
                </motion.button>
              </motion.div>
            )}

            {/* Missing file hint */}
            {state === "dropped" && !canVerify && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 text-center text-sm text-foreground/60"
              >
                {!mediaFile
                  ? "Add a media file to verify"
                  : "Add a .veritas seal file"}
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
