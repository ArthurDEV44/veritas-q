"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser, useAuth } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

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
 * Hook to synchronize Clerk user with backend database
 *
 * This hook automatically syncs the authenticated user's profile
 * to our backend database on first render. It uses the Clerk session
 * to authenticate API requests.
 */
export function useUserSync(): UseUserSyncResult {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { getToken, isLoaded: isAuthLoaded } = useAuth();

  const [syncedUser, setSyncedUser] = useState<SyncedUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncUser = useCallback(async () => {
    if (!user || !isUserLoaded || !isAuthLoaded) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get Clerk session token
      const token = await getToken();
      if (!token) {
        throw new Error("No authentication token available");
      }

      // Prepare user data from Clerk
      const userData = {
        clerk_user_id: user.id,
        email: user.primaryEmailAddress?.emailAddress || "",
        name: user.fullName || user.firstName || null,
        avatar_url: user.imageUrl || null,
      };

      // Sync with backend
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

      // Log if new user was created
      if (data.created) {
        console.log("[useUserSync] New user created in database");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      setError(message);
      console.error("[useUserSync] Error:", message);
    } finally {
      setIsLoading(false);
    }
  }, [user, isUserLoaded, isAuthLoaded, getToken]);

  // Auto-sync on mount when user is authenticated
  useEffect(() => {
    if (user && isUserLoaded && isAuthLoaded && !syncedUser && !isLoading) {
      syncUser();
    }
  }, [user, isUserLoaded, isAuthLoaded, syncedUser, isLoading, syncUser]);

  return {
    syncedUser,
    isLoading,
    error,
    syncUser,
  };
}
