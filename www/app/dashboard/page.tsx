import { currentUser } from "@clerk/nextjs/server";
import { Camera, History, Settings, Shield } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await currentUser();

  return (
    <div className="space-y-8">
      {/* Welcome section */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold">
          Bienvenue, {user?.firstName || "Utilisateur"}
        </h1>
        <p className="text-foreground/60">
          Gérez vos médias authentifiés et créez de nouvelles preuves
          cryptographiques.
        </p>
      </div>

      {/* Quick actions grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickActionCard
          href="/dashboard/capture"
          icon={Camera}
          title="Capturer"
          description="Sceller une nouvelle photo ou vidéo"
          color="quantum"
        />
        <QuickActionCard
          href="/dashboard/seals"
          icon={History}
          title="Mes Seals"
          description="Consulter l'historique des seals"
          color="green"
        />
        <QuickActionCard
          href="/verify"
          icon={Shield}
          title="Vérifier"
          description="Vérifier l'authenticité d'un média"
          color="blue"
        />
        <QuickActionCard
          href="/dashboard/settings"
          icon={Settings}
          title="Paramètres"
          description="Gérer votre compte et préférences"
          color="gray"
        />
      </div>

      {/* Stats placeholder */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Seals créés" value="0" subtitle="ce mois" />
        <StatCard title="Vérifications" value="0" subtitle="total" />
        <StatCard title="Niveau" value="Tier 1" subtitle="Capture in-app" />
      </div>

      {/* Recent activity placeholder */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Activité récente</h2>
        <div className="rounded-xl border border-border bg-surface/50 p-8 text-center">
          <Shield className="w-12 h-12 mx-auto text-foreground/20 mb-4" />
          <p className="text-foreground/60">
            Aucune activité récente. Commencez par capturer votre premier média
            authentifié.
          </p>
          <Link
            href="/dashboard/capture"
            className="inline-block mt-4 px-6 py-2 rounded-lg bg-quantum text-background hover:bg-quantum/90 transition-colors"
          >
            Capturer un média
          </Link>
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({
  href,
  icon: Icon,
  title,
  description,
  color,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: "quantum" | "green" | "blue" | "gray";
}) {
  const colorClasses = {
    quantum: "bg-quantum/10 text-quantum group-hover:bg-quantum/20",
    green: "bg-green-500/10 text-green-500 group-hover:bg-green-500/20",
    blue: "bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20",
    gray: "bg-foreground/10 text-foreground/60 group-hover:bg-foreground/20",
  };

  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-surface/50 p-6 hover:bg-surface transition-colors"
    >
      <div
        className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-colors ${colorClasses[color]}`}
      >
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-foreground/60">{description}</p>
    </Link>
  );
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-6">
      <p className="text-sm text-foreground/60 mb-1">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-foreground/40">{subtitle}</p>
    </div>
  );
}
