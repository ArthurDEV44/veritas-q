import { currentUser } from "@clerk/nextjs/server";
import { User, Shield, Bell, Key, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Parametres | Veritas Q",
  description: "Gerez vos parametres de compte Veritas Q",
};

export default async function SettingsPage() {
  const user = await currentUser();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold">Parametres</h1>
        <p className="text-foreground/60">
          Gerez votre compte et vos preferences
        </p>
      </div>

      {/* User summary card */}
      <div className="rounded-xl border border-border bg-surface/50 p-6">
        <div className="flex items-center gap-4">
          {user?.imageUrl ? (
            <Image
              src={user.imageUrl}
              alt={user.fullName || "Avatar"}
              width={64}
              height={64}
              className="w-16 h-16 rounded-full border-2 border-quantum/20"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-quantum/20 flex items-center justify-center">
              <User className="w-8 h-8 text-quantum" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-lg truncate">
              {user?.fullName || user?.firstName || "Utilisateur"}
            </h2>
            <p className="text-sm text-foreground/60 truncate">
              {user?.primaryEmailAddress?.emailAddress}
            </p>
            <span className="inline-flex items-center gap-1 mt-1 text-xs px-2 py-0.5 rounded-full bg-quantum/10 text-quantum">
              Tier 1
            </span>
          </div>
          <Link
            href="/dashboard/settings/profile"
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-surface-hover transition-colors"
          >
            Modifier
          </Link>
        </div>
      </div>

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
      <div className="space-y-4 pt-4 border-t border-border">
        <h2 className="text-lg font-semibold text-red-500">Zone de danger</h2>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-red-500/10">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-medium text-red-500">
                  Supprimer mon compte
                </h3>
                <p className="text-sm text-foreground/60">
                  Supprimez definitivement votre compte et vos donnees
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/settings/delete-account"
              className="px-4 py-2 text-sm rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors whitespace-nowrap"
            >
              Supprimer
            </Link>
          </div>
        </div>
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
  const content = (
    <>
      <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-foreground/60" />
      </div>
      <h3 className="font-medium mb-1">{title}</h3>
      <p className="text-sm text-foreground/60">{description}</p>
      {disabled && (
        <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-foreground/10 text-foreground/40">
          Bientot disponible
        </span>
      )}
    </>
  );

  if (disabled) {
    return (
      <div className="rounded-xl border border-border bg-surface/30 p-6 opacity-60 cursor-not-allowed">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-surface/50 p-6 hover:bg-surface transition-colors group"
    >
      {content}
    </Link>
  );
}
