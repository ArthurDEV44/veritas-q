"use client";

import { Bell, BellOff, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function NotificationSettings() {
  const {
    isSupported,
    isSubscribed,
    permission,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  // Not supported
  if (!isSupported) {
    return (
      <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-700 rounded-lg">
            <BellOff className="w-5 h-5 text-zinc-400" />
          </div>
          <div>
            <h3 className="font-medium text-zinc-300">Notifications</h3>
            <p className="text-sm text-zinc-500">
              Non disponible sur ce navigateur
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Permission denied
  if (permission === "denied") {
    return (
      <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-zinc-300">Notifications bloquées</h3>
            <p className="text-sm text-zinc-500">
              Autorisez les notifications dans les paramètres de votre navigateur
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  return (
    <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              isSubscribed
                ? "bg-green-500/20"
                : "bg-zinc-700"
            }`}
          >
            {isSubscribed ? (
              <Bell className="w-5 h-5 text-green-400" />
            ) : (
              <BellOff className="w-5 h-5 text-zinc-400" />
            )}
          </div>
          <div>
            <h3 className="font-medium text-zinc-300">Notifications push</h3>
            <p className="text-sm text-zinc-500">
              {isSubscribed
                ? "Vous recevrez des alertes"
                : "Activez pour être notifié"}
            </p>
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={isLoading}
          className={`relative px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            isSubscribed
              ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
              : "bg-green-600 hover:bg-green-500 text-white"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isSubscribed ? (
            "Désactiver"
          ) : (
            "Activer"
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success message */}
      {isSubscribed && !error && !isLoading && (
        <div className="mt-3 flex items-center gap-2 text-sm text-green-400">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>Notifications activées</span>
        </div>
      )}
    </div>
  );
}
