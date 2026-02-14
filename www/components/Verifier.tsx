"use client";

import { useState, useCallback } from "react";
import {
  Upload,
  Shield,
  FileImage,
  X,
  FileCheck,
  Search,
} from "lucide-react";
import VerificationResult from "./VerificationResult";
import {
  verifyUnified,
  isImageFile,
  isSealFile,
  type UnifiedVerificationResult,
} from "@/lib/verification";
import { Card, CardPanel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertAction,
} from "@/components/ui/alert";
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
} from "@/components/ui/progress";
import { AlertCircle, ShieldX } from "lucide-react";

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

const STEP_PROGRESS: Record<string, number> = {
  verifying: 40,
  checking_c2pa: 60,
  resolving: 80,
};

export default function Verifier() {
  const [state, setState] = useState<VerifyState>("idle");
  const [isDragOver, setIsDragOver] = useState(false);
  const [mediaFile, setMediaFile] = useState<DroppedFile | null>(null);
  const [sealFile, setSealFile] = useState<DroppedFile | null>(null);
  const [result, setResult] = useState<UnifiedVerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const processFiles = useCallback((files: File[]) => {
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
  }, []);

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
    [processFiles],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = Array.from(e.target.files);
        processFiles(files);
      }
    },
    [processFiles],
  );

  const verify = useCallback(async () => {
    if (!mediaFile) return;

    setErrorMessage("");
    setResult(null);

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
        sealFile?.file,
      );

      if (verificationResult.method === "soft_binding") {
        setState("resolving");
        await new Promise((r) => setTimeout(r, 300));
      }

      setResult(verificationResult);
      setState("complete");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Erreur de vérification",
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

  const canVerify = mediaFile !== null;

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

  const isProcessing = ["verifying", "checking_c2pa", "resolving"].includes(
    state,
  );

  // ── Result Display ──────────────────────────────────────────
  if (state === "complete" && result) {
    return (
      <div className="w-full animate-slide-up">
        <VerificationResult result={result} onReset={reset} />
      </div>
    );
  }

  // ── Error Display ───────────────────────────────────────────
  if (state === "error") {
    return (
      <Card className="animate-slide-up">
        <CardPanel className="flex flex-col items-center gap-4 py-8">
          <div className="shield-failed">
            <ShieldX className="size-16 text-destructive" />
          </div>
          <Alert variant="error" className="max-w-sm">
            <AlertCircle />
            <AlertTitle>Erreur de vérification</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
            <AlertAction>
              <Button variant="outline" size="sm" onClick={reset}>
                Réessayer
              </Button>
            </AlertAction>
          </Alert>
        </CardPanel>
      </Card>
    );
  }

  // ── Processing State ────────────────────────────────────────
  if (isProcessing) {
    const status = getStatusMessage();
    const progressValue = STEP_PROGRESS[state] ?? 20;

    return (
      <Card className="animate-fade-in">
        <CardPanel className="flex flex-col items-center gap-6 py-10">
          <div className="relative">
            <Spinner className="size-12 text-primary" />
            <div className="absolute inset-0 rounded-full animate-glow-pulse" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-primary font-medium">{status.title}</p>
            <p className="text-muted-foreground text-sm">{status.subtitle}</p>
          </div>
          <Progress value={progressValue} className="max-w-xs">
            <ProgressLabel className="sr-only">
              Progression de la vérification
            </ProgressLabel>
            <ProgressTrack className="h-2">
              <ProgressIndicator className="bg-primary transition-all duration-700" />
            </ProgressTrack>
          </Progress>
          <div className="flex gap-2">
            {["Signature", "Hash", "Horodatage", "QRNG"].map((step, i) => (
              <Badge
                key={step}
                variant={progressValue > i * 25 ? "default" : "outline"}
                size="sm"
              >
                {step}
              </Badge>
            ))}
          </div>
        </CardPanel>
      </Card>
    );
  }

  // ── Upload / Drop Zone ──────────────────────────────────────
  return (
    <div className="w-full flex flex-col gap-4 animate-fade-in">
      {/* Drop Zone Card */}
      <Card
        className={`transition-all duration-200 ${
          isDragOver
            ? "border-primary shadow-[0_0_20px_var(--quantum-glow)]"
            : "hover:border-border-emphasis"
        }`}
      >
        <CardPanel className="p-0">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="relative w-full aspect-[4/3] sm:aspect-video"
          >
            <input
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.veritas"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              disabled={isProcessing}
              aria-label="Sélectionner des fichiers à vérifier"
            />

            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
              <div
                className={`size-16 rounded-full flex items-center justify-center transition-colors ${
                  isDragOver
                    ? "bg-primary/20 quantum-glow-sm"
                    : "bg-surface-2"
                }`}
              >
                {isDragOver ? (
                  <Shield className="size-8 text-primary" />
                ) : (
                  <Upload className="size-8 text-muted-foreground" />
                )}
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">
                  {isDragOver
                    ? "Déposez les fichiers"
                    : "Déposez des fichiers à vérifier"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  ou cliquez pour parcourir
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                <Badge variant="outline" size="sm">
                  Image seule → C2PA / résolution
                </Badge>
                <Badge variant="outline" size="sm">
                  Image + .veritas → vérification classique
                </Badge>
              </div>
            </div>
          </div>
        </CardPanel>
      </Card>

      {/* File indicators */}
      {(mediaFile || sealFile) && (
        <div className="space-y-2 animate-slide-up">
          {mediaFile && (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                {mediaFile.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaFile.preview}
                    alt="Aperçu du fichier média"
                    className="size-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="size-10 rounded-lg bg-surface-2 flex items-center justify-center">
                    <FileImage className="size-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {mediaFile.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(mediaFile.file.size / 1024).toFixed(1)} Ko
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setMediaFile(null)}
                  aria-label="Retirer le fichier média"
                >
                  <X />
                </Button>
              </div>
            </Card>
          )}

          {sealFile && (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Shield className="size-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {sealFile.file.name}
                  </p>
                  <Badge variant="success" size="sm">
                    Sceau Veritas
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setSealFile(null)}
                  aria-label="Retirer le fichier sceau"
                >
                  <X />
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Verify button */}
      {canVerify && state === "dropped" && (
        <div className="flex flex-col items-center gap-3 animate-slide-up">
          <Button size="xl" onClick={verify} className="quantum-glow-sm">
            {sealFile ? (
              <>
                <FileCheck />
                <span>Vérifier le sceau</span>
              </>
            ) : (
              <>
                <Search />
                <span>Rechercher l&apos;authenticité</span>
              </>
            )}
          </Button>

          {/* Verification method hint */}
          {!sealFile && isImageFile(mediaFile.file) && (
            <p className="text-xs text-muted-foreground text-center">
              Recherche de manifest C2PA intégré ou résolution par hash
              perceptuel
            </p>
          )}
        </div>
      )}

      {/* Missing file hint */}
      {state === "dropped" && !canVerify && (
        <p className="text-center text-sm text-muted-foreground animate-fade-in">
          Ajoutez un fichier média à vérifier
        </p>
      )}
    </div>
  );
}
