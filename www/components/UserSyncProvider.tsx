"use client";

import { useEffect } from "react";
import { useUserSync } from "@/hooks/useUserSync";

interface UserSyncProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that automatically syncs the authenticated user
 * with the backend database when mounted.
 *
 * This component should wrap any authenticated content that requires
 * the user to exist in the database.
 */
export default function UserSyncProvider({ children }: UserSyncProviderProps) {
  const { syncedUser, isLoading, error, syncUser } = useUserSync();

  // Log sync status for debugging
  useEffect(() => {
    if (error) {
      console.warn("[UserSyncProvider] Sync error:", error);
    }
  }, [error]);

  // Show loading state while syncing
  // This is intentionally minimal - we don't block the UI
  if (isLoading && !syncedUser) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="flex items-center gap-2 text-foreground/60">
          <div className="w-4 h-4 border-2 border-quantum border-t-transparent rounded-full animate-spin" />
          <span>Synchronisation...</span>
        </div>
      </div>
    );
  }

  // If sync failed, show error but still render children
  // User can still use the app, some features may be limited
  if (error && !syncedUser) {
    return (
      <>
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-500">
          Synchronisation du profil en cours. Certaines fonctionnalités peuvent
          être limitées.
          <button
            onClick={() => syncUser()}
            className="ml-2 underline hover:no-underline"
          >
            Réessayer
          </button>
        </div>
        {children}
      </>
    );
  }

  return <>{children}</>;
}
