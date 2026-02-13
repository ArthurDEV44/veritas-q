"use client";

import { useEffect, useState } from "react";
import { Camera, AlertTriangle, Settings, ExternalLink } from "lucide-react";
import { isIOS, getBrowser } from "@/lib/device";

type PermissionState = "prompt" | "granted" | "denied" | "unsupported" | "loading";

interface CameraPermissionGuardProps {
  children: React.ReactNode;
}

export default function CameraPermissionGuard({
  children,
}: CameraPermissionGuardProps) {
  const [permission, setPermission] = useState<PermissionState>("loading");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));

    async function checkPermission() {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermission("unsupported");
        return;
      }

      try {
        // Try using the Permissions API first (not supported on all browsers)
        if ("permissions" in navigator) {
          try {
            const result = await navigator.permissions.query({
              name: "camera" as PermissionName,
            });
            setPermission(result.state as PermissionState);

            // Listen for permission changes
            result.addEventListener("change", () => {
              setPermission(result.state as PermissionState);
            });
            return;
          } catch {
            // Permissions API not available for camera, fall through
          }
        }

        // Fallback: Try to enumerate devices to check if we have labels
        // (labels are only available if permission was granted before)
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");

        if (videoDevices.length === 0) {
          setPermission("unsupported");
          return;
        }

        // If we have labels, permission was granted before
        const hasLabels = videoDevices.some((d) => d.label !== "");
        setPermission(hasLabels ? "granted" : "prompt");
      } catch {
        setPermission("prompt");
      }
    }

    if (typeof navigator !== "undefined") {
      checkPermission();
    }
  }, []);

  // Don't render anything on server
  if (!mounted) return null;

  // Show children if permission is granted or prompt (let CameraCapture handle it)
  if (permission === "loading" || permission === "granted" || permission === "prompt") {
    return <>{children}</>;
  }

  // Show unsupported message
  if (permission === "unsupported") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Camera non disponible</h2>
          <p className="text-foreground/60 max-w-sm">
            Votre navigateur ne supporte pas l&apos;acces a la camera ou aucune
            camera n&apos;est connectee a cet appareil.
          </p>
        </div>
        <div className="bg-surface-elevated rounded-xl p-4 text-left text-sm max-w-sm">
          <p className="font-medium mb-2">Solutions possibles :</p>
          <ul className="text-foreground/60 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-quantum mt-0.5">*</span>
              Utilisez un navigateur moderne (Chrome, Safari, Firefox)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-quantum mt-0.5">*</span>
              Verifiez que votre appareil possede une camera
            </li>
            <li className="flex items-start gap-2">
              <span className="text-quantum mt-0.5">*</span>
              Assurez-vous d&apos;acceder au site en HTTPS
            </li>
          </ul>
        </div>
      </div>
    );
  }

  // Show denied message with instructions
  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
        <Camera className="w-10 h-10 text-red-500" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Acces camera bloque</h2>
        <p className="text-foreground/60 max-w-sm">
          Veritas Q necessite l&apos;acces a votre camera pour capturer et
          sceller des medias authentifies.
        </p>
      </div>

      <div className="bg-surface-elevated rounded-xl p-5 text-left max-w-sm w-full">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-5 h-5 text-quantum" />
          <p className="font-medium">
            Activer l&apos;acces dans {getBrowser()}
          </p>
        </div>

        {isIOS() ? (
          <ol className="text-sm text-foreground/60 space-y-2">
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground/80">1.</span>
              Ouvrez <span className="font-medium">Reglages</span> sur votre
              appareil
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground/80">2.</span>
              Faites defiler jusqu&apos;a <span className="font-medium">Safari</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground/80">3.</span>
              Appuyez sur{" "}
              <span className="font-medium">Camera</span> et selectionnez{" "}
              <span className="font-medium">Autoriser</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground/80">4.</span>
              Retournez ici et rechargez la page
            </li>
          </ol>
        ) : (
          <ol className="text-sm text-foreground/60 space-y-2">
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground/80">1.</span>
              Cliquez sur l&apos;icone de cadenas dans la barre d&apos;adresse
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground/80">2.</span>
              Trouvez <span className="font-medium">Camera</span> dans les
              parametres du site
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground/80">3.</span>
              Changez de <span className="font-medium">Bloquer</span> a{" "}
              <span className="font-medium">Autoriser</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground/80">4.</span>
              Rechargez la page
            </li>
          </ol>
        )}
      </div>

      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 px-6 py-3 bg-quantum text-black rounded-full font-medium hover:bg-quantum-dim transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        Recharger la page
      </button>
    </div>
  );
}
