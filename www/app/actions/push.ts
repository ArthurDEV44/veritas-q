"use server";

import webpush from "web-push";

// Configure VAPID
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:contact@veritas-q.com";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

// In-memory storage for demo (use database in production)
const subscriptions = new Map<string, webpush.PushSubscription>();

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/**
 * Subscribe a user to push notifications
 */
export async function subscribeUser(
  userId: string,
  subscription: PushSubscriptionJSON
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!vapidPublicKey || !vapidPrivateKey) {
      return { success: false, error: "Push notifications not configured" };
    }

    // Store subscription (in production, save to database)
    subscriptions.set(userId, subscription as webpush.PushSubscription);

    return { success: true };
  } catch (error) {
    console.error("Failed to subscribe user:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Unsubscribe a user from push notifications
 */
export async function unsubscribeUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    subscriptions.delete(userId);
    return { success: true };
  } catch (error) {
    console.error("Failed to unsubscribe user:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send a push notification to a specific user
 */
export async function sendNotification(
  userId: string,
  payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!vapidPublicKey || !vapidPrivateKey) {
      return { success: false, error: "Push notifications not configured" };
    }

    const subscription = subscriptions.get(userId);
    if (!subscription) {
      return { success: false, error: "User not subscribed" };
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/icons/icon-192x192.png",
      badge: payload.badge || "/icons/icon-96x96.png",
      tag: payload.tag,
      data: payload.data,
    });

    await webpush.sendNotification(subscription, notificationPayload);

    return { success: true };
  } catch (error) {
    console.error("Failed to send notification:", error);

    // Handle expired subscriptions
    if (error instanceof webpush.WebPushError && error.statusCode === 410) {
      subscriptions.delete(userId);
      return { success: false, error: "Subscription expired" };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send a seal created notification
 */
export async function sendSealNotification(
  userId: string,
  sealId: string
): Promise<{ success: boolean; error?: string }> {
  return sendNotification(userId, {
    title: "Sceau Veritas Q créé",
    body: "Votre média a été scellé avec succès",
    tag: `seal-${sealId}`,
    data: {
      type: "seal_created",
      sealId,
      url: `/?seal=${sealId}`,
    },
  });
}

/**
 * Send a verification complete notification
 */
export async function sendVerificationNotification(
  userId: string,
  isAuthentic: boolean
): Promise<{ success: boolean; error?: string }> {
  return sendNotification(userId, {
    title: isAuthentic ? "Média authentique" : "Média non vérifié",
    body: isAuthentic
      ? "Le sceau Veritas Q est valide"
      : "Aucun sceau valide trouvé",
    tag: "verification",
    data: {
      type: "verification_complete",
      isAuthentic,
    },
  });
}

/**
 * Get the VAPID public key for client-side subscription
 */
export async function getVapidPublicKey(): Promise<string | null> {
  return vapidPublicKey || null;
}
