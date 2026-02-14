"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Camera,
  History,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type NavLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const mainLinks: NavLink[] = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/seals", label: "Mes Seals", icon: History },
  { href: "/", label: "Capturer", icon: Camera },
  { href: "/verify", label: "Vérifier", icon: ShieldCheck },
];

const bottomNavLinks: NavLink[] = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/seals", label: "Seals", icon: History },
  { href: "/", label: "Capturer", icon: Camera },
  { href: "/verify", label: "Vérifier", icon: ShieldCheck },
  { href: "/dashboard/settings", label: "Réglages", icon: Settings },
];

function isActiveRoute(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname.startsWith(href);
}

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-border bg-card/50">
      <div className="flex flex-col gap-1 p-3 flex-1">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Navigation
        </p>
        {mainLinks.map((link) => {
          const active = isActiveRoute(pathname, link.href, link.exact);
          return (
            <Button
              key={link.href}
              variant="ghost"
              size="sm"
              render={<Link href={link.href} />}
              className={`w-full justify-start gap-2.5 ${
                active
                  ? "text-primary bg-primary/8 font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <link.icon className="size-4 shrink-0" />
              {link.label}
            </Button>
          );
        })}

        <Separator className="my-2" />

        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Compte
        </p>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/dashboard/settings" />}
          className={`w-full justify-start gap-2.5 ${
            isActiveRoute(pathname, "/dashboard/settings")
              ? "text-primary bg-primary/8 font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings className="size-4 shrink-0" />
          Paramètres
        </Button>
      </div>

      {/* Sidebar footer — quantum status */}
      <div className="p-3 border-t border-border">
        <Badge variant="success" size="sm" className="w-full justify-center">
          <span className="relative flex size-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
          </span>
          <Zap className="size-3" />
          Quantum Secure
        </Badge>
      </div>
    </aside>
  );
}

export function DashboardBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-background/90 backdrop-blur-xl border-t border-border">
      <div className="flex items-center justify-around h-14 px-1" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {bottomNavLinks.map((link) => {
          const active = isActiveRoute(pathname, link.href, link.exact);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center gap-0.5 min-w-[48px] py-1.5 px-2 rounded-lg transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <link.icon className="size-5" />
              <span className="text-[10px] font-medium leading-none">
                {link.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
