# Plan d'Implémentation PWA - Veritas Q

**Objectif** : Transformer l'application Next.js existante en PWA mobile-first complète, offrant une expérience native sans App Store.

**Stack actuelle** :
- Next.js 16.1.1 (App Router)
- React 19.2.3
- TypeScript
- Tailwind CSS 4

---

## Phase 1 : Fondations PWA

### 1.1 Migration du Manifest vers TypeScript

**Fichier** : `www/app/manifest.ts` (nouveau)

Migrer de `public/manifest.json` vers `app/manifest.ts` pour bénéficier du typage et de la génération dynamique.

```typescript
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Veritas Q',
    short_name: 'Veritas Q',
    description: 'Quantum-authenticated media verification - Reality Authentication',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    orientation: 'portrait-primary',
    categories: ['utilities', 'security', 'photography'],
    icons: [
      {
        src: '/icons/icon-72x72.png',
        sizes: '72x72',
        type: 'image/png',
      },
      {
        src: '/icons/icon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
      },
      {
        src: '/icons/icon-128x128.png',
        sizes: '128x128',
        type: 'image/png',
      },
      {
        src: '/icons/icon-144x144.png',
        sizes: '144x144',
        type: 'image/png',
      },
      {
        src: '/icons/icon-152x152.png',
        sizes: '152x152',
        type: 'image/png',
      },
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-384x384.png',
        sizes: '384x384',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    screenshots: [
      {
        src: '/screenshots/capture-mobile.png',
        sizes: '390x844',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Capture and seal media with quantum authentication',
      },
      {
        src: '/screenshots/verify-mobile.png',
        sizes: '390x844',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Verify sealed media authenticity',
      },
    ],
    shortcuts: [
      {
        name: 'Capture',
        short_name: 'Capture',
        description: 'Capture and seal new media',
        url: '/?action=capture',
        icons: [{ src: '/icons/shortcut-capture.png', sizes: '96x96' }],
      },
      {
        name: 'Verify',
        short_name: 'Verify',
        description: 'Verify sealed media',
        url: '/?action=verify',
        icons: [{ src: '/icons/shortcut-verify.png', sizes: '96x96' }],
      },
    ],
    related_applications: [],
    prefer_related_applications: false,
  }
}
```

**Action** : Supprimer `www/public/manifest.json` après migration.

---

### 1.2 Génération des Icônes PWA

**Dossier** : `www/public/icons/` (nouveau)

**Outil recommandé** : https://realfavicongenerator.net/ ou `pwa-asset-generator`

```bash
# Installation
npm install -g pwa-asset-generator

# Génération depuis un logo source (à créer : www/src-icon.png 1024x1024)
pwa-asset-generator ./src-icon.png ./www/public/icons \
  --background "#000000" \
  --splash-only false \
  --icon-only false \
  --maskable true \
  --padding "10%"
```

**Icônes requises** :
| Fichier | Taille | Usage |
|---------|--------|-------|
| `icon-72x72.png` | 72x72 | Android legacy |
| `icon-96x96.png` | 96x96 | Android/shortcuts |
| `icon-128x128.png` | 128x128 | Chrome Web Store |
| `icon-144x144.png` | 144x144 | iOS/Android |
| `icon-152x152.png` | 152x152 | iOS |
| `icon-192x192.png` | 192x192 | Android standard |
| `icon-384x384.png` | 384x384 | Android high-res |
| `icon-512x512.png` | 512x512 | PWA splash/install |
| `maskable-512x512.png` | 512x512 | Android adaptive icon |
| `apple-touch-icon.png` | 180x180 | iOS home screen |
| `favicon.ico` | 32x32 | Browser tab |

---

### 1.3 Headers de Sécurité

**Fichier** : `www/next.config.ts` (modifier)

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(self)',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

---

## Phase 2 : Service Worker & Offline

### 2.1 Installation de Serwist

**Pourquoi Serwist** : Fork actif de Workbox, recommandé par Next.js, meilleur support App Router.

```bash
cd www
bun add @serwist/next serwist
```

### 2.2 Configuration Serwist

**Fichier** : `www/next.config.ts` (modifier)

```typescript
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: false, // Important: évite perte de données formulaire
});

const nextConfig: NextConfig = {
  async headers() {
    // ... headers de la Phase 1.3
  },
};

export default withSerwist(nextConfig);
```

### 2.3 Service Worker Principal

**Fichier** : `www/app/sw.ts` (nouveau)

```typescript
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Cache API responses (seal/verify)
    {
      urlPattern: /^https?:\/\/.*\/seal$/,
      handler: "NetworkOnly", // Toujours réseau pour sealing (QRNG requis)
    },
    {
      urlPattern: /^https?:\/\/.*\/verify$/,
      handler: "NetworkFirst",
      options: {
        cacheName: "api-verify-cache",
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60, // 1 heure
        },
        networkTimeoutSeconds: 10,
      },
    },
    // Cache images statiques
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "image-cache",
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 jours
        },
      },
    },
    // Cache fonts
    {
      urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "font-cache",
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1 an
        },
      },
    },
    // Cache JS/CSS
    {
      urlPattern: /\.(?:js|css)$/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-resources",
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 7 jours
        },
      },
    },
    // Default cache
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
```

### 2.4 Page Offline

**Fichier** : `www/app/offline/page.tsx` (nouveau)

```tsx
import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6 text-center">
      <div className="w-24 h-24 rounded-full bg-surface-elevated flex items-center justify-center">
        <WifiOff className="w-12 h-12 text-foreground/40" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Hors connexion</h1>
        <p className="text-foreground/60 max-w-sm">
          La création de sceaux quantiques nécessite une connexion internet
          pour accéder aux sources d&apos;entropie QRNG.
        </p>
      </div>

      <div className="bg-surface-elevated rounded-xl p-4 max-w-sm">
        <h2 className="font-medium mb-2">Fonctionnalités disponibles hors ligne :</h2>
        <ul className="text-sm text-foreground/60 space-y-1 text-left">
          <li>• Consulter les sceaux déjà créés</li>
          <li>• Préparer des captures (synchronisation au retour)</li>
        </ul>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 px-6 py-3 bg-quantum text-black rounded-full font-medium"
      >
        <RefreshCw className="w-5 h-5" />
        Réessayer
      </button>
    </div>
  );
}
```

---

## Phase 3 : Enregistrement Service Worker & Install Prompt

### 3.1 Hook d'Enregistrement SW

**Fichier** : `www/hooks/useServiceWorker.ts` (nouveau)

```typescript
"use client";

import { useEffect, useState } from "react";

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  isOffline: boolean;
  registration: ServiceWorkerRegistration | null;
  updateAvailable: boolean;
}

export function useServiceWorker(): ServiceWorkerState {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: false,
    isRegistered: false,
    isOffline: false,
    registration: null,
    updateAvailable: false,
  });

  useEffect(() => {
    const isSupported = "serviceWorker" in navigator;
    setState((s) => ({ ...s, isSupported }));

    if (!isSupported) return;

    // Register SW
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        setState((s) => ({
          ...s,
          isRegistered: true,
          registration,
        }));

        // Check for updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          newWorker?.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setState((s) => ({ ...s, updateAvailable: true }));
            }
          });
        });
      })
      .catch((error) => {
        console.error("SW registration failed:", error);
      });

    // Online/offline detection
    const handleOnline = () => setState((s) => ({ ...s, isOffline: false }));
    const handleOffline = () => setState((s) => ({ ...s, isOffline: true }));

    setState((s) => ({ ...s, isOffline: !navigator.onLine }));

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return state;
}
```

### 3.2 Hook Install Prompt (A2HS)

**Fichier** : `www/hooks/useInstallPrompt.ts` (nouveau)

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallPromptState {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  promptInstall: () => Promise<boolean>;
}

export function useInstallPrompt(): InstallPromptState {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Detect if already installed (standalone mode)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // Listen for install prompt (Chrome/Edge/Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setDeferredPrompt(null);
      return true;
    }

    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    promptInstall,
  };
}
```

### 3.3 Composant Install Banner

**Fichier** : `www/components/InstallBanner.tsx` (nouveau)

```tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

export default function InstallBanner() {
  const { isInstallable, isInstalled, isIOS, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  // Don't show if installed, dismissed, or not installable (except iOS)
  if (isInstalled || dismissed || (!isInstallable && !isIOS)) {
    return null;
  }

  const handleInstall = async () => {
    const success = await promptInstall();
    if (!success && !isIOS) {
      setDismissed(true);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50"
      >
        <div className="bg-surface-elevated border border-border rounded-2xl p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-quantum/20 flex items-center justify-center flex-shrink-0">
              {isIOS ? (
                <Share className="w-6 h-6 text-quantum" />
              ) : (
                <Download className="w-6 h-6 text-quantum" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">Installer Veritas Q</h3>
              {isIOS ? (
                <p className="text-xs text-foreground/60 mt-1">
                  Appuyez sur{" "}
                  <Share className="w-3 h-3 inline-block mx-0.5" /> puis
                  &quot;Sur l&apos;écran d&apos;accueil&quot;
                </p>
              ) : (
                <p className="text-xs text-foreground/60 mt-1">
                  Accès rapide depuis votre écran d&apos;accueil
                </p>
              )}
            </div>

            <button
              onClick={() => setDismissed(true)}
              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
              aria-label="Fermer"
            >
              <X className="w-4 h-4 text-foreground/40" />
            </button>
          </div>

          {!isIOS && (
            <button
              onClick={handleInstall}
              className="w-full mt-3 py-2.5 bg-quantum text-black rounded-xl font-medium text-sm hover:bg-quantum-dim transition-colors"
            >
              Installer l&apos;application
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
```

### 3.4 Intégration dans Layout

**Fichier** : `www/app/layout.tsx` (modifier)

Ajouter après le `</footer>` :

```tsx
import InstallBanner from "@/components/InstallBanner";

// Dans le return, après </footer> :
<InstallBanner />
```

---

## Phase 4 : Optimisations Caméra Mobile

### 4.1 Amélioration CameraCapture pour iOS

**Fichier** : `www/components/CameraCapture.tsx` (modifier)

Ajouts recommandés au composant existant :

```typescript
// Ajouter après les imports existants
import { useServiceWorker } from "@/hooks/useServiceWorker";

// Dans le composant, ajouter :
const { isOffline } = useServiceWorker();

// Modifier startCamera pour supporter iOS mieux :
const startCamera = useCallback(async () => {
  if (isOffline) {
    setErrorMessage("Connexion requise pour le scellement quantique");
    setState("error");
    return;
  }

  try {
    // Demander les permissions explicitement pour iOS
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasCamera = devices.some((d) => d.kind === "videoinput");

    if (!hasCamera) {
      throw new Error("Aucune caméra détectée");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }, // 'ideal' plus compatible iOS
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
        aspectRatio: { ideal: 16 / 9 },
      },
      audio: false,
    });

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      // Attendre que la vidéo soit prête (important iOS)
      await videoRef.current.play();
      streamRef.current = stream;
      setState("streaming");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Accès caméra refusé";
    // Messages d'erreur localisés
    if (message.includes("NotAllowed") || message.includes("Permission")) {
      setErrorMessage(
        "Accès caméra refusé. Autorisez l'accès dans les paramètres."
      );
    } else if (message.includes("NotFound")) {
      setErrorMessage("Aucune caméra disponible sur cet appareil.");
    } else {
      setErrorMessage(message);
    }
    setState("error");
  }
}, [isOffline]);

// Ajouter un switch caméra front/back
const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

const switchCamera = useCallback(async () => {
  stopCamera();
  setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  // startCamera sera rappelé via useEffect
}, [stopCamera]);
```

### 4.2 Gestion Permissions iOS

**Fichier** : `www/components/CameraPermissionGuard.tsx` (nouveau)

```tsx
"use client";

import { useEffect, useState } from "react";
import { Camera, AlertTriangle, Settings } from "lucide-react";

type PermissionState = "prompt" | "granted" | "denied" | "unknown";

export default function CameraPermissionGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [permission, setPermission] = useState<PermissionState>("unknown");

  useEffect(() => {
    async function checkPermission() {
      try {
        // Check via Permissions API (not supported on all browsers)
        if ("permissions" in navigator) {
          const result = await navigator.permissions.query({
            name: "camera" as PermissionName,
          });
          setPermission(result.state as PermissionState);
          result.addEventListener("change", () => {
            setPermission(result.state as PermissionState);
          });
        } else {
          // Fallback: try to enumerate devices
          const devices = await navigator.mediaDevices.enumerateDevices();
          const hasLabels = devices.some((d) => d.label !== "");
          setPermission(hasLabels ? "granted" : "prompt");
        }
      } catch {
        setPermission("unknown");
      }
    }

    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      checkPermission();
    }
  }, []);

  if (permission === "denied") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold">Accès caméra bloqué</h2>
        <p className="text-foreground/60 max-w-sm">
          Veritas Q a besoin d&apos;accéder à votre caméra pour capturer et
          sceller des médias.
        </p>
        <div className="bg-surface-elevated rounded-xl p-4 text-left text-sm">
          <p className="font-medium mb-2 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Pour activer l&apos;accès :
          </p>
          <ol className="list-decimal list-inside text-foreground/60 space-y-1">
            <li>Ouvrez les Paramètres de votre appareil</li>
            <li>Trouvez Safari / Chrome / votre navigateur</li>
            <li>Activez l&apos;accès à la Caméra</li>
            <li>Rechargez cette page</li>
          </ol>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

---

## Phase 5 : Push Notifications (Optionnel)

### 5.1 Génération Clés VAPID

```bash
# Installation
npm install -g web-push

# Génération
web-push generate-vapid-keys
```

### 5.2 Variables d'Environnement

**Fichier** : `www/.env.local` (nouveau)

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BL...votre_clé_publique
VAPID_PRIVATE_KEY=votre_clé_privée
VAPID_SUBJECT=mailto:contact@veritas-q.com
```

### 5.3 Server Actions Push

**Fichier** : `www/app/actions/push.ts` (nouveau)

```typescript
"use server";

import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// En production: stocker dans une base de données
const subscriptions = new Map<string, PushSubscription>();

export async function subscribeUser(
  subscription: PushSubscription,
  userId: string
) {
  subscriptions.set(userId, subscription);
  return { success: true };
}

export async function unsubscribeUser(userId: string) {
  subscriptions.delete(userId);
  return { success: true };
}

export async function sendSealNotification(
  userId: string,
  sealId: string
) {
  const subscription = subscriptions.get(userId);
  if (!subscription) return { success: false, error: "No subscription" };

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: "Sceau Veritas Q créé",
        body: `Votre média a été scellé avec succès`,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/badge-72x72.png",
        data: { sealId, url: `/seal/${sealId}` },
      })
    );
    return { success: true };
  } catch (error) {
    console.error("Push failed:", error);
    return { success: false, error: "Push failed" };
  }
}
```

---

## Phase 6 : Tests & Déploiement

### 6.1 Script de Test PWA Local

**Fichier** : `www/package.json` (modifier scripts)

```json
{
  "scripts": {
    "dev": "next dev --port 3001",
    "dev:https": "next dev --port 3001 --experimental-https",
    "build": "next build",
    "start": "next start --port 3001",
    "lint": "eslint",
    "test:pwa": "npx lighthouse http://localhost:3001 --view --preset=desktop"
  }
}
```

### 6.2 Checklist Pré-Déploiement

```markdown
## PWA Checklist

### Manifest
- [ ] `app/manifest.ts` créé avec toutes les métadonnées
- [ ] Icônes générées (72 à 512px + maskable)
- [ ] Screenshots pour install prompt
- [ ] Shortcuts configurés

### Service Worker
- [ ] Serwist installé et configuré
- [ ] `app/sw.ts` avec stratégies de cache
- [ ] Page `/offline` créée
- [ ] Test offline fonctionne

### Installation
- [ ] Install banner affiché sur mobile
- [ ] Instructions iOS affichées
- [ ] `beforeinstallprompt` capturé (Android/Chrome)

### Caméra
- [ ] getUserMedia fonctionne iOS Safari
- [ ] getUserMedia fonctionne Android Chrome
- [ ] Gestion erreurs permissions
- [ ] Switch caméra front/back

### Performance
- [ ] Lighthouse PWA score > 90
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3s

### Sécurité
- [ ] HTTPS actif en production
- [ ] Headers de sécurité configurés
- [ ] CSP pour Service Worker
```

### 6.3 Configuration Vercel (si applicable)

**Fichier** : `www/vercel.json` (nouveau, optionnel)

```json
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        },
        {
          "key": "Service-Worker-Allowed",
          "value": "/"
        }
      ]
    }
  ]
}
```

---

## Résumé des Fichiers à Créer/Modifier

### Nouveaux fichiers (9)
| Fichier | Description |
|---------|-------------|
| `www/app/manifest.ts` | Manifest PWA typé |
| `www/app/sw.ts` | Service Worker Serwist |
| `www/app/offline/page.tsx` | Page offline |
| `www/hooks/useServiceWorker.ts` | Hook SW |
| `www/hooks/useInstallPrompt.ts` | Hook A2HS |
| `www/components/InstallBanner.tsx` | Banner installation |
| `www/components/CameraPermissionGuard.tsx` | Garde permissions |
| `www/app/actions/push.ts` | Server actions push (optionnel) |
| `www/.env.local` | Variables VAPID (optionnel) |

### Fichiers à modifier (3)
| Fichier | Modifications |
|---------|---------------|
| `www/next.config.ts` | Headers sécurité + Serwist |
| `www/app/layout.tsx` | Import InstallBanner |
| `www/components/CameraCapture.tsx` | Optimisations iOS |

### Fichiers à supprimer (1)
| Fichier | Raison |
|---------|--------|
| `www/public/manifest.json` | Remplacé par `app/manifest.ts` |

### Assets à générer
| Dossier | Contenu |
|---------|---------|
| `www/public/icons/` | 10+ icônes PWA |
| `www/public/screenshots/` | 2+ screenshots pour install |

---

## Dépendances à Installer

```bash
cd www
bun add @serwist/next serwist
bun add -D web-push  # Si push notifications
```

---

## Ordre d'Implémentation Recommandé

1. **Phase 1** : Manifest + Icônes + Headers (~1-2h)
2. **Phase 2** : Service Worker + Offline (~2-3h)
3. **Phase 3** : Install Prompt + Hooks (~1-2h)
4. **Phase 4** : Optimisations Caméra (~1h)
5. **Phase 5** : Push Notifications (~2h, optionnel)
6. **Phase 6** : Tests + Déploiement (~1h)

**Total estimé** : 8-12h de développement

---

## Sources

- [Next.js PWA Guide](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Serwist Documentation](https://serwist.pages.dev/)
- [PWA Camera Access Guide 2025](https://simicart.com/blog/pwa-camera-access/)
- [Building Offline Apps with Serwist](https://locallytools.com/blog/build-offline-app-with-nextjs-and-serwist)
- [iOS PWA Limitations](https://brainhub.eu/library/pwa-on-ios)
