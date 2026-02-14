"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useUser, useAuth } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

export interface SyncedUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  tier: "tier1" | "tier2" | "tier3";
  created_at: string;
}

interface SyncUserResponse {
  created: boolean;
  user: SyncedUser;
}

interface UseUserSyncResult {
  syncedUser: SyncedUser | null;
  isLoading: boolean;
  error: string | null;
  syncUser: () => Promise<void>;
}

/**
 * Hook to synchronize Clerk user with backend database.
 *
 * Automatically syncs the authenticated user's profile to the backend
 * on first render. Silently retries on transient network failures.
 * The dashboard remains fully usable even if sync fails.
 */
export function useUserSync(): UseUserSyncResult {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { getToken, isLoaded: isAuthLoaded } = useAuth();

  const [syncedUser, setSyncedUser] = useState<SyncedUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();

  const syncUser = useCallback(async () => {
    if (!user || !isUserLoaded || !isAuthLoaded) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("No authentication token available");
      }

      const userData = {
        clerk_user_id: user.id,
        email: user.primaryEmailAddress?.emailAddress || "",
        name: user.fullName || user.firstName || null,
        avatar_url: user.imageUrl || null,
      };

      const response = await fetch(`${API_URL}/api/v1/users/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Sync failed: ${response.statusText}`
        );
      }

      const data: SyncUserResponse = await response.json();
      setSyncedUser(data.user);
      retryCount.current = 0;

      if (data.created) {
        console.log("[useUserSync] New user created in database");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      const isNetworkError =
        message === "Failed to fetch" || message === "Load failed";

      // Only log as warning for expected transient errors
      if (isNetworkError) {
        console.warn("[useUserSync] Backend unreachable, will retry");
      } else {
        console.warn("[useUserSync] Sync failed:", message);
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [user, isUserLoaded, isAuthLoaded, getToken]);

  // Auto-sync on mount when user is authenticated, with retry
  useEffect(() => {
    if (user && isUserLoaded && isAuthLoaded && !syncedUser && !isLoading) {
      syncUser();
    }
  }, [user, isUserLoaded, isAuthLoaded, syncedUser, isLoading, syncUser]);

  // Retry on transient errors
  useEffect(() => {
    if (error && !syncedUser && retryCount.current < MAX_RETRIES) {
      retryTimer.current = setTimeout(() => {
        retryCount.current += 1;
        syncUser();
      }, RETRY_DELAY_MS);
    }
    return () => clearTimeout(retryTimer.current);
  }, [error, syncedUser, syncUser]);

  return {
    syncedUser,
    isLoading,
    error,
    syncUser,
  };
}
