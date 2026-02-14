import { currentUser } from "@clerk/nextjs/server";
import { User, Shield, Bell, Key, Trash2, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardPanel,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Parametres | Veritas Q",
  description: "Gerez vos parametres de compte Veritas Q",
};

export default async function SettingsPage() {
  const user = await currentUser();

  const initials = user?.firstName?.[0]
    ? `${user.firstName[0]}${user.lastName?.[0] || ""}`
    : "U";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold">Parametres</h1>
        <p className="text-muted-foreground">
          Gerez votre compte et vos preferences
        </p>
      </div>

      {/* User summary card */}
      <Card>
        <CardPanel className="flex items-center gap-4">
          <Avatar className="size-14 border-2 border-primary/20">
            {user?.imageUrl ? (
              <AvatarImage src={user.imageUrl} alt={user.fullName || "Avatar"} />
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-lg truncate">
              {user?.fullName || user?.firstName || "Utilisateur"}
            </h2>
            <p className="text-sm text-muted-foreground truncate">
              {user?.primaryEmailAddress?.emailAddress}
            </p>
            <Badge variant="success" size="sm" className="mt-1.5">
              Tier 1
            </Badge>
          </div>
          <Button variant="outline" size="sm" render={<Link href="/dashboard/settings/profile" />}>
            Modifier
          </Button>
        </CardPanel>
      </Card>

      {/* Settings sections */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsCard
          href="/dashboard/settings/profile"
          icon={User}
          title="Profil"
          description="Modifiez votre nom, email et photo de profil"
        />
        <SettingsCard
          href="/dashboard/settings/security"
          icon={Shield}
          title="Securite"
          description="Mot de passe, authentification a deux facteurs"
          disabled
        />
        <SettingsCard
          href="/dashboard/settings/notifications"
          icon={Bell}
          title="Notifications"
          description="Gerez vos preferences de notifications"
          disabled
        />
        <SettingsCard
          href="/dashboard/settings/api-keys"
          icon={Key}
          title="Cles API"
          description="Gerez vos cles d'acces API"
          disabled
        />
      </div>

      {/* Danger zone */}
      <Separator />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-destructive-foreground">
          Zone de danger
        </h2>
        <Alert variant="error">
          <Trash2 />
          <AlertTitle>Supprimer mon compte</AlertTitle>
          <AlertDescription>
            Supprimez definitivement votre compte et vos donnees
          </AlertDescription>
          <div className="col-span-full mt-2">
            <Button
              variant="destructive-outline"
              size="sm"
              render={<Link href="/dashboard/settings/delete-account" />}
            >
              Supprimer
            </Button>
          </div>
        </Alert>
      </div>
    </div>
  );
}

function SettingsCard({
  href,
  icon: Icon,
  title,
  description,
  disabled = false,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <Card className="opacity-60 cursor-not-allowed">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
              <Badge variant="secondary" size="sm" className="mt-2">
                Bientot disponible
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <Button
        variant="ghost"
        render={<Link href={href} />}
        className="h-auto w-full justify-start p-0 rounded-2xl"
      >
        <CardHeader className="w-full">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="font-normal">{description}</CardDescription>
            </div>
            <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1" />
          </div>
        </CardHeader>
      </Button>
    </Card>
  );
}
