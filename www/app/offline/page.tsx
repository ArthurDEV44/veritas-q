"use client";

import { WifiOff, RefreshCw, Shield } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 p-6 text-center">
      <div className="w-24 h-24 rounded-full bg-surface-elevated flex items-center justify-center animate-[scaleIn_0.3s_ease-out]">
        <WifiOff className="w-12 h-12 text-foreground/40" />
      </div>

      <div className="space-y-3 animate-[slideUp_0.3s_ease-out]">
        <h1 className="text-2xl font-semibold">Hors connexion</h1>
        <p className="text-foreground/60 max-w-sm">
          La connexion internet est requise pour accéder aux sources
          d&apos;entropie quantique et créer des sceaux authentifiés.
        </p>
      </div>

      <div className="bg-surface-elevated rounded-2xl p-5 max-w-sm w-full animate-[slideUp_0.3s_ease-out]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-quantum/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-quantum" />
          </div>
          <h2 className="font-medium text-left">Pourquoi cette limitation ?</h2>
        </div>
        <p className="text-sm text-foreground/60 text-left">
          Les sceaux Veritas Q utilisent l&apos;entropie de générateurs
          quantiques (QRNG) pour garantir l&apos;authenticité. Cette source
          d&apos;aléatoire quantique nécessite une connexion aux serveurs QRNG.
        </p>
      </div>

      <div className="bg-surface rounded-xl p-4 max-w-sm w-full border border-border animate-[slideUp_0.3s_ease-out]">
        <h3 className="font-medium mb-3 text-sm">Disponible hors ligne :</h3>
        <ul className="text-sm text-foreground/60 space-y-2 text-left">
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Consulter l&apos;interface
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Voir les sceaux en cache
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/20" />
            Créer de nouveaux sceaux
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/20" />
            Vérifier des médias
          </li>
        </ul>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 px-6 py-3 bg-quantum text-black rounded-full font-medium hover:bg-quantum-dim transition-colors animate-[slideUp_0.3s_ease-out] transition-transform active:scale-95"
      >
        <RefreshCw className="w-5 h-5" />
        Réessayer la connexion
      </button>
    </div>
  );
}
