"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share, Smartphone } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

export default function InstallBanner() {
  const { isInstallable, isInstalled, isIOS, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render on server or before hydration
  if (!mounted) return null;

  // Don't show if installed, dismissed, or not installable
  if (isInstalled || dismissed || !isInstallable) {
    return null;
  }

  const handleInstall = async () => {
    const success = await promptInstall();
    if (!success) {
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    // Also mark as dismissed in localStorage via promptInstall
    promptInstall();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50"
      >
        <div className="bg-surface-elevated border border-border rounded-2xl p-4 shadow-xl backdrop-blur-lg">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-quantum/20 flex items-center justify-center shrink-0">
              {isIOS ? (
                <Share className="w-6 h-6 text-quantum" />
              ) : (
                <Smartphone className="w-6 h-6 text-quantum" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">Installer Veritas Q</h3>
              {isIOS ? (
                <p className="text-xs text-foreground/60 mt-1 leading-relaxed">
                  Appuyez sur{" "}
                  <span className="inline-flex items-center gap-0.5 bg-surface px-1 py-0.5 rounded text-foreground/80">
                    <Share className="w-3 h-3" />
                  </span>{" "}
                  puis <span className="font-medium">&quot;Sur l&apos;écran d&apos;accueil&quot;</span>
                </p>
              ) : (
                <p className="text-xs text-foreground/60 mt-1">
                  Accès instantané depuis votre écran d&apos;accueil
                </p>
              )}
            </div>

            <button
              onClick={handleDismiss}
              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
              aria-label="Fermer"
            >
              <X className="w-4 h-4 text-foreground/40" />
            </button>
          </div>

          {!isIOS && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleInstall}
              className="w-full mt-3 py-2.5 bg-quantum text-black rounded-xl font-medium text-sm hover:bg-quantum-dim transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Installer
            </motion.button>
          )}

          {isIOS && (
            <div className="mt-3 flex items-center gap-2 text-xs text-foreground/40">
              <div className="flex-1 h-px bg-border" />
              <span>Safari uniquement</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
