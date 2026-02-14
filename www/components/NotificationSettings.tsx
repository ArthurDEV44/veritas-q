"use client";

import {
  Bell,
  BellOff,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

import { Card, CardPanel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

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
      <Card>
        <CardPanel className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <BellOff className="size-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">Notifications</h3>
            <p className="text-sm text-muted-foreground">
              Non disponible sur ce navigateur
            </p>
          </div>
          <Badge variant="secondary" size="sm" className="ml-auto">
            Non supporte
          </Badge>
        </CardPanel>
      </Card>
    );
  }

  // Permission denied
  if (permission === "denied") {
    return (
      <Card>
        <CardPanel className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <AlertCircle className="size-5 text-destructive-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground">
                Notifications bloquees
              </h3>
              <p className="text-sm text-muted-foreground">
                Autorisez les notifications dans les parametres de votre
                navigateur
              </p>
            </div>
            <Badge variant="error" size="sm">
              Bloque
            </Badge>
          </div>
        </CardPanel>
      </Card>
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
    <Card>
      <CardPanel className="space-y-3">
        <Label
          className="flex items-center gap-3 cursor-pointer"
          onClick={(e) => {
            // Prevent double-toggle from label click propagating to switch
            if ((e.target as HTMLElement).closest('[data-slot="switch"]'))
              return;
            if (!isLoading) handleToggle();
          }}
        >
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
              isSubscribed ? "bg-success/10" : "bg-muted"
            }`}
          >
            {isSubscribed ? (
              <Bell className="size-5 text-success-foreground" />
            ) : (
              <BellOff className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <p className="font-medium text-foreground">Notifications push</p>
            <p className="text-sm text-muted-foreground font-normal">
              {isSubscribed
                ? "Vous recevrez des alertes"
                : "Activez pour etre notifie"}
            </p>
          </div>
          {isLoading ? (
            <Spinner className="size-4" />
          ) : (
            <Switch
              checked={isSubscribed}
              onCheckedChange={handleToggle}
              disabled={isLoading}
            />
          )}
        </Label>

        {/* Error message */}
        {error && (
          <Alert variant="error">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success message */}
        {isSubscribed && !error && !isLoading && (
          <Alert variant="success">
            <CheckCircle />
            <AlertDescription>Notifications activees</AlertDescription>
          </Alert>
        )}
      </CardPanel>
    </Card>
  );
}
