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
  runtimeCaching: defaultCache,
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

// Push notification event handler
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || "Veritas Q";
    const options: NotificationOptions = {
      body: data.body || "",
      icon: data.icon || "/icons/icon-192x192.png",
      badge: data.badge || "/icons/icon-96x96.png",
      tag: data.tag,
      data: data.data,
      requireInteraction: false,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Fallback for non-JSON payloads
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("Veritas Q", {
        body: text,
        icon: "/icons/icon-192x192.png",
      })
    );
  }
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data;
  let url = "/";

  // Navigate to specific URL if provided
  if (data?.url) {
    url = data.url;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Open new window if no existing window
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// Background sync handler for offline captures
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pending-captures") {
    event.waitUntil(syncPendingCaptures());
  }
});

// Sync pending captures by notifying the client
async function syncPendingCaptures() {
  try {
    const clientList = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    // Send message to all clients to trigger sync
    for (const client of clientList) {
      client.postMessage({
        type: "SYNC_PENDING_CAPTURES",
        timestamp: Date.now(),
      });
    }

    // Show notification that sync is starting
    await self.registration.showNotification("Veritas Q", {
      body: "Synchronisation des captures en cours...",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-96x96.png",
      tag: "sync-pending",
      silent: true,
    });

    return true;
  } catch (error) {
    console.error("Background sync failed:", error);
    throw error;
  }
}

// Message handler for client communication
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "SYNC_COMPLETE") {
    // Update notification when sync is complete
    self.registration.showNotification("Veritas Q", {
      body: `${event.data.count || "Tous les"} media(s) synchronise(s) avec succes!`,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-96x96.png",
      tag: "sync-complete",
      silent: true,
    });
  }
});
