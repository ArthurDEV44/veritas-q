"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Shield,
  Loader2,
  FileImage,
  X,
  AlertCircle,
  Search,
  FileCheck,
} from "lucide-react";
import VerificationResult from "./VerificationResult";
import {
  verifyUnified,
  isImageFile,
  isSealFile,
  type UnifiedVerificationResult,
} from "@/lib/verification";

type VerifyState =
  | "idle"
  | "dropped"
  | "verifying"
  | "checking_c2pa"
  | "resolving"
  | "complete"
  | "error";

interface DroppedFile {
  file: File;
  preview?: string;
}

export default function Verifier() {
  const [state, setState] = useState<VerifyState>("idle");
  const [isDragOver, setIsDragOver] = useState(false);
  const [mediaFile, setMediaFile] = useState<DroppedFile | null>(null);
  const [sealFile, setSealFile] = useState<DroppedFile | null>(null);
  const [result, setResult] = useState<UnifiedVerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  }, []);

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
      if (isSealFile(file)) {
        setSealFile({ file });
      } else if (
        file.type.startsWith("image/") ||
        file.type.startsWith("video/") ||
        file.type.startsWith("audio/")
      ) {
        const preview = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
        setMediaFile({ file, preview });
      }
    }
    setState("dropped");
  };

  const verify = useCallback(async () => {
    if (!mediaFile) return;

    setErrorMessage("");
    setResult(null);

    // Update state based on verification path
    if (sealFile) {
      setState("verifying");
    } else if (isImageFile(mediaFile.file)) {
      setState("checking_c2pa");
    } else {
      setState("verifying");
    }

    try {
      const verificationResult = await verifyUnified(
        mediaFile.file,
        sealFile?.file
      );

      // Update state for soft binding if we went that route
      if (verificationResult.method === "soft_binding") {
        setState("resolving");
        // Small delay to show resolving state
        await new Promise((r) => setTimeout(r, 300));
      }

      setResult(verificationResult);
      setState("complete");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Erreur de vérification"
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
    setResult(null);
    setErrorMessage("");
    setState("idle");
  }, [mediaFile]);

  // Can verify with just media file (will try C2PA or soft binding)
  const canVerify = mediaFile !== null;

  // Get status message for verification in progress
  const getStatusMessage = () => {
    switch (state) {
      case "verifying":
        return {
          title: "Vérification en cours...",
          subtitle: "Validation de la signature quantique",
        };
      case "checking_c2pa":
        return {
          title: "Analyse C2PA...",
          subtitle: "Recherche d'un manifest intégré",
        };
      case "resolving":
        return {
          title: "Résolution en cours...",
          subtitle: "Recherche par hash perceptuel",
        };
      default:
        return { title: "", subtitle: "" };
    }
  };

  const isProcessing = ["verifying", "checking_c2pa", "resolving"].includes(state);

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <AnimatePresence mode="wait">
        {/* Result Display */}
        {state === "complete" && result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full flex justify-center"
          >
            <VerificationResult result={result} onReset={reset} />
          </motion.div>
        )}

        {/* Error Display */}
        {state === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 p-6 bg-red-500/10 rounded-2xl"
          >
            <AlertCircle className="w-16 h-16 text-red-500" />
            <h3 className="text-lg font-semibold text-red-500">Erreur</h3>
            <p className="text-foreground/60 text-center max-w-sm">
              {errorMessage}
            </p>
            <button
              onClick={reset}
              className="mt-2 px-6 py-2 bg-surface-elevated hover:bg-surface-elevated/80 rounded-full border border-border transition-colors text-sm"
            >
              Réessayer
            </button>
          </motion.div>
        )}

        {/* Drop Zone / Verification UI */}
        {state !== "complete" && state !== "error" && (
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
                disabled={isProcessing}
              />

              {isProcessing ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="w-12 h-12 text-quantum animate-spin" />
                  <p className="text-quantum font-medium">
                    {getStatusMessage().title}
                  </p>
                  <p className="text-foreground/60 text-sm">
                    {getStatusMessage().subtitle}
                  </p>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                      isDragOver ? "bg-quantum/20" : "bg-surface-elevated"
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
                      {isDragOver
                        ? "Déposez les fichiers"
                        : "Déposez des fichiers à vérifier"}
                    </p>
                    <p className="text-sm text-foreground/60 mt-1">
                      ou cliquez pour parcourir
                    </p>
                  </div>
                  <div className="text-xs text-foreground/40 mt-2 text-center space-y-1">
                    <p>Image seule : recherche C2PA ou résolution soft binding</p>
                    <p>Image + .veritas : vérification classique</p>
                  </div>
                </div>
              )}
            </div>

            {/* File indicators */}
            {(mediaFile || sealFile) && !isProcessing && (
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
                        alt="Aperçu"
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
                        {(mediaFile.file.size / 1024).toFixed(1)} Ko
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
                      <p className="text-xs text-quantum">Sceau Veritas</p>
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
                className="mt-6 flex flex-col items-center gap-3"
              >
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={verify}
                  className="flex items-center gap-2 px-8 py-3 bg-quantum text-black font-semibold rounded-full hover:bg-quantum-dim transition-colors quantum-glow-sm"
                >
                  {sealFile ? (
                    <>
                      <FileCheck className="w-5 h-5" />
                      <span>Vérifier le sceau</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      <span>Rechercher l&apos;authenticité</span>
                    </>
                  )}
                </motion.button>

                {/* Verification method hint */}
                {!sealFile && isImageFile(mediaFile.file) && (
                  <p className="text-xs text-foreground/50 text-center">
                    Recherche de manifest C2PA intégré ou résolution par hash perceptuel
                  </p>
                )}
              </motion.div>
            )}

            {/* Missing file hint */}
            {state === "dropped" && !canVerify && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 text-center text-sm text-foreground/60"
              >
                Ajoutez un fichier média à vérifier
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
