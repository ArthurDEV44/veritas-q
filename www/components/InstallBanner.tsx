"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, X, Share, Smartphone } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Card, CardHeader, CardTitle, CardPanel } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const AUTO_DISMISS_MS = 10_000;

export default function InstallBanner() {
  const { isInstallable, isInstalled, isIOS, promptInstall } =
    useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [interacted, setInteracted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  // Auto-dismiss after 10 seconds if no interaction
  useEffect(() => {
    if (!mounted || dismissed || interacted || isInstalled || !isInstallable)
      return;

    const timer = setTimeout(() => {
      setDismissed(true);
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [mounted, dismissed, interacted, isInstalled, isInstallable]);

  const handleInteraction = useCallback(() => {
    setInteracted(true);
  }, []);

  const handleInstall = async () => {
    handleInteraction();
    const success = await promptInstall();
    if (!success) {
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    promptInstall();
  };

  // Don't render on server or before hydration
  if (!mounted) return null;

  // Don't show if installed, dismissed, or not installable
  if (isInstalled || dismissed || !isInstallable) {
    return null;
  }

  return (
    <div
      className="animate-slide-up fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-sm"
      onPointerDown={handleInteraction}
    >
      <Card className="backdrop-blur-lg">
        <CardHeader className="pb-0">
          <div className="flex items-start gap-3">
            <Avatar className="size-10 rounded-xl">
              <AvatarImage src="/icons/icon-96x96.png" alt="Veritas Q" />
              <AvatarFallback className="rounded-xl bg-primary/20 text-primary">
                <Smartphone className="size-5" />
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm">Installer Veritas Q</CardTitle>
              {!isIOS && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Acces instantane depuis votre ecran d&apos;accueil
                </p>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleDismiss}
              aria-label="Fermer"
            >
              <X className="size-4" />
            </Button>
          </div>
        </CardHeader>

        <CardPanel>
          {isIOS ? (
            <Alert variant="info" className="mt-1">
              <Share className="size-4" />
              <AlertDescription>
                Appuyez sur{" "}
                <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-foreground">
                  <Share className="size-3" />
                </span>{" "}
                puis{" "}
                <span className="font-medium">
                  &quot;Sur l&apos;ecran d&apos;accueil&quot;
                </span>
              </AlertDescription>
            </Alert>
          ) : (
            <Button
              variant="default"
              className="w-full"
              onClick={handleInstall}
            >
              <Download className="size-4" />
              Installer
            </Button>
          )}
        </CardPanel>
      </Card>
    </div>
  );
}
