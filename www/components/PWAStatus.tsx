"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, RefreshCw } from "lucide-react";
import { useServiceWorker } from "@/hooks/useServiceWorker";

export default function PWAStatus() {
  const { isOffline, updateAvailable, applyUpdate } = useServiceWorker();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {/* Offline Banner */}
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[100] bg-amber-500/90 backdrop-blur-sm"
          >
            <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-sm text-black font-medium">
              <WifiOff className="w-4 h-4" />
              <span>Hors connexion - Fonctionnalités limitées</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Update Available Banner */}
      <AnimatePresence>
        {updateAvailable && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[100] bg-quantum/90 backdrop-blur-sm"
          >
            <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-3 text-sm text-black font-medium">
              <span>Nouvelle version disponible</span>
              <button
                onClick={applyUpdate}
                className="flex items-center gap-1.5 px-3 py-1 bg-black/20 hover:bg-black/30 rounded-full transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Mettre à jour
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
