import { currentUser } from "@clerk/nextjs/server";
import {
  Camera,
  History,
  Settings,
  Shield,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
  Zap,
} from "lucide-react";
import Link from "next/link";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardPanel,
  CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
} from "@/components/ui/progress";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";

const quickActions = [
  {
    href: "/",
    icon: Camera,
    title: "Capturer",
    description: "Sceller une nouvelle photo ou vidéo",
    iconBg: "bg-quantum-500/10 text-quantum-500",
  },
  {
    href: "/dashboard/seals",
    icon: History,
    title: "Mes Seals",
    description: "Consulter l'historique des seals",
    iconBg: "bg-success/10 text-success-foreground",
  },
  {
    href: "/verify",
    icon: ShieldCheck,
    title: "Vérifier",
    description: "Vérifier l'authenticité d'un média",
    iconBg: "bg-info/10 text-info-foreground",
  },
  {
    href: "/dashboard/settings",
    icon: Settings,
    title: "Paramètres",
    description: "Gérer votre compte et préférences",
    iconBg: "bg-muted text-muted-foreground",
  },
];

export default async function DashboardPage() {
  const user = await currentUser();

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Welcome section */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-[var(--letter-spacing-display)]">
          Bienvenue, {user?.firstName || "Utilisateur"}
        </h1>
        <p className="text-muted-foreground">
          Gérez vos médias authentifiés et créez de nouvelles preuves
          cryptographiques.
        </p>
      </div>

      {/* Quick actions grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickActions.map((action, index) => (
          <Card
            key={action.href}
            render={<Link href={action.href} />}
            className="group stagger-item hover:border-primary/20 cursor-pointer"
            style={{ animationDelay: `${index * 75}ms` }}
          >
            <CardPanel>
              <div className="flex flex-col gap-3">
                <div
                  className={`size-10 rounded-xl flex items-center justify-center ${action.iconBg} group-hover:scale-105 transition-transform`}
                >
                  <action.icon className="size-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-card-foreground">
                    {action.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {action.description}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors inline-flex items-center gap-1">
                  Accéder
                  <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </CardPanel>
          </Card>
        ))}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Seals créés</CardDescription>
            <CardTitle className="text-3xl tabular-nums">0</CardTitle>
            <CardAction>
              <Badge variant="outline" size="sm">
                <TrendingUp className="size-3" />
                ce mois
              </Badge>
            </CardAction>
          </CardHeader>
          <CardPanel>
            <Progress value={0}>
              <ProgressTrack>
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
          </CardPanel>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Vérifications</CardDescription>
            <CardTitle className="text-3xl tabular-nums">0</CardTitle>
            <CardAction>
              <Badge variant="outline" size="sm">total</Badge>
            </CardAction>
          </CardHeader>
          <CardPanel>
            <Progress value={0}>
              <ProgressTrack>
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
          </CardPanel>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Niveau de confiance</CardDescription>
            <CardTitle className="text-3xl">Tier 1</CardTitle>
            <CardAction>
              <Badge variant="success" size="sm">
                <Shield className="size-3" />
                Capture
              </Badge>
            </CardAction>
          </CardHeader>
          <CardPanel>
            <Progress value={33}>
              <ProgressTrack>
                <ProgressIndicator className="bg-quantum-500" />
              </ProgressTrack>
            </Progress>
          </CardPanel>
        </Card>
      </div>

      {/* Recent activity */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Activité récente</h2>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/dashboard/seals" />}
            className="text-muted-foreground"
          >
            Voir tout
            <ArrowRight className="size-4" />
          </Button>
        </div>

        {/* Empty state — will be replaced when user has seals */}
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Zap className="size-5 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle>Aucune activité récente</EmptyTitle>
              <EmptyDescription>
                Commencez par capturer votre premier média authentifié pour le
                retrouver ici.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" render={<Link href="/" />}>
                <Camera className="size-4" />
                Capturer un média
              </Button>
            </EmptyContent>
          </Empty>
        </Card>
      </div>
    </div>
  );
}
