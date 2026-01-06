"use client";

import { useEffect, useState, useCallback } from "react";
import {
  subscribeUser,
  unsubscribeUser,
  getVapidPublicKey,
  type PushSubscriptionJSON,
} from "@/app/actions/push";

interface PushNotificationState {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission | "default";
  isLoading: boolean;
  error: string | null;
}

// Generate a simple user ID (in production, use actual user authentication)
function getUserId(): string {
  if (typeof window === "undefined") return "";

  let userId = localStorage.getItem("veritas-user-id");
  if (!userId) {
    userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("veritas-user-id", userId);
  }
  return userId;
}

// Convert base64 URL to Uint8Array for applicationServerKey
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(): PushNotificationState & {
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  requestPermission: () => Promise<NotificationPermission>;
} {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isSubscribed: false,
    permission: "default",
    isLoading: true,
    error: null,
  });

  // Check support and current subscription on mount
  useEffect(() => {
    async function checkStatus() {
      if (typeof window === "undefined") return;

      // Check if Push API is supported
      const isSupported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!isSupported) {
        setState({
          isSupported: false,
          isSubscribed: false,
          permission: "default",
          isLoading: false,
          error: null,
        });
        return;
      }

      // Get current permission
      const permission = Notification.permission;

      // Check if already subscribed
      let isSubscribed = false;
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        isSubscribed = !!subscription;
      } catch {
        // Ignore errors
      }

      setState({
        isSupported: true,
        isSubscribed,
        permission,
        isLoading: false,
        error: null,
      });
    }

    checkStatus();
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!state.isSupported) return "denied";

    try {
      const permission = await Notification.requestPermission();
      setState((s) => ({ ...s, permission }));
      return permission;
    } catch {
      return "denied";
    }
  }, [state.isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) return false;

    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      // Request permission if not granted
      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
        setState((s) => ({ ...s, permission }));
      }

      if (permission !== "granted") {
        setState((s) => ({
          ...s,
          isLoading: false,
          error: "Permission refusée",
        }));
        return false;
      }

      // Get VAPID public key
      const vapidKey = await getVapidPublicKey();
      if (!vapidKey) {
        setState((s) => ({
          ...s,
          isLoading: false,
          error: "Notifications non configurées sur le serveur",
        }));
        return false;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // Send subscription to server
      const subscriptionJSON = subscription.toJSON() as PushSubscriptionJSON;
      const userId = getUserId();
      const result = await subscribeUser(userId, subscriptionJSON);

      if (!result.success) {
        throw new Error(result.error || "Erreur lors de l'inscription");
      }

      setState((s) => ({
        ...s,
        isSubscribed: true,
        isLoading: false,
        error: null,
      }));

      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erreur inconnue";
      setState((s) => ({
        ...s,
        isLoading: false,
        error: message,
      }));
      return false;
    }
  }, [state.isSupported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) return false;

    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      // Get current subscription
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from push
        await subscription.unsubscribe();
      }

      // Remove from server
      const userId = getUserId();
      await unsubscribeUser(userId);

      setState((s) => ({
        ...s,
        isSubscribed: false,
        isLoading: false,
        error: null,
      }));

      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erreur inconnue";
      setState((s) => ({
        ...s,
        isLoading: false,
        error: message,
      }));
      return false;
    }
  }, [state.isSupported]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    requestPermission,
  };
}
