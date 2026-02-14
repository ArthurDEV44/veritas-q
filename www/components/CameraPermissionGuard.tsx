"use client";

import { useEffect, useState } from "react";
import { Camera, AlertTriangle, Settings, ExternalLink } from "lucide-react";
import { isIOS, getBrowser } from "@/lib/device";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";

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
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermission("unsupported");
        return;
      }

      try {
        if ("permissions" in navigator) {
          try {
            const result = await navigator.permissions.query({
              name: "camera" as PermissionName,
            });
            setPermission(result.state as PermissionState);

            result.addEventListener("change", () => {
              setPermission(result.state as PermissionState);
            });
            return;
          } catch {
            // Permissions API not available for camera, fall through
          }
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");

        if (videoDevices.length === 0) {
          setPermission("unsupported");
          return;
        }

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

  if (!mounted) return null;

  if (permission === "loading" || permission === "granted" || permission === "prompt") {
    return <>{children}</>;
  }

  // Unsupported: CossUI Empty state
  if (permission === "unsupported") {
    return (
      <Empty className="animate-[fadeIn_0.3s_var(--ease-out-expo)]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangle className="text-warning" />
          </EmptyMedia>
          <EmptyTitle>Camera non disponible</EmptyTitle>
          <EmptyDescription>
            Votre navigateur ne supporte pas l&apos;acces a la camera ou aucune
            camera n&apos;est connectee a cet appareil.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Solutions possibles</AlertTitle>
            <AlertDescription>
              <ul className="list-none space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">*</span>
                  Utilisez un navigateur moderne (Chrome, Safari, Firefox)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">*</span>
                  Verifiez que votre appareil possede une camera
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">*</span>
                  Assurez-vous d&apos;acceder au site en HTTPS
                </li>
              </ul>
            </AlertDescription>
          </Alert>
        </EmptyContent>
      </Empty>
    );
  }

  // Denied: CossUI Empty + Alert with instructions
  return (
    <Empty className="animate-[fadeIn_0.3s_var(--ease-out-expo)]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Camera className="text-destructive" />
        </EmptyMedia>
        <EmptyTitle>Acces camera bloque</EmptyTitle>
        <EmptyDescription>
          Veritas Q necessite l&apos;acces a votre camera pour capturer et
          sceller des medias authentifies.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Card className="w-full">
          <CardPanel>
            <div className="flex items-center gap-2 mb-3">
              <Settings className="w-5 h-5 text-primary" />
              <p className="font-medium">
                Activer l&apos;acces dans {getBrowser()}
              </p>
            </div>

            {isIOS() ? (
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground">1.</span>
                  Ouvrez <span className="font-medium">Reglages</span> sur votre
                  appareil
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground">2.</span>
                  Faites defiler jusqu&apos;a <span className="font-medium">Safari</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground">3.</span>
                  Appuyez sur{" "}
                  <span className="font-medium">Camera</span> et selectionnez{" "}
                  <span className="font-medium">Autoriser</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground">4.</span>
                  Retournez ici et rechargez la page
                </li>
              </ol>
            ) : (
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground">1.</span>
                  Cliquez sur l&apos;icone de cadenas dans la barre d&apos;adresse
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground">2.</span>
                  Trouvez <span className="font-medium">Camera</span> dans les
                  parametres du site
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground">3.</span>
                  Changez de <span className="font-medium">Bloquer</span> a{" "}
                  <span className="font-medium">Autoriser</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground">4.</span>
                  Rechargez la page
                </li>
              </ol>
            )}
          </CardPanel>
        </Card>

        <Button onClick={() => window.location.reload()}>
          <ExternalLink className="w-4 h-4" />
          Recharger la page
        </Button>
      </EmptyContent>
    </Empty>
  );
}
