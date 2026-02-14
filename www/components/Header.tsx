"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import {
  Camera,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Settings,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Sheet,
  SheetTrigger,
  SheetPopup,
  SheetHeader,
  SheetTitle,
  SheetPanel,
  SheetClose,
} from "@/components/ui/sheet";

const navLinks = [
  { href: "/", label: "Capturer", icon: Camera },
  { href: "/verify", label: "Vérifier", icon: ShieldCheck },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
] as const;

function QuantumLogo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      {/* Geometric quantum mark */}
      <div className="relative w-8 h-8 flex items-center justify-center">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          className="w-8 h-8"
          aria-hidden="true"
        >
          {/* Outer ring */}
          <circle
            cx="16"
            cy="16"
            r="14"
            stroke="var(--primary)"
            strokeWidth="1.5"
            opacity="0.3"
          />
          {/* Inner quantum orbit */}
          <ellipse
            cx="16"
            cy="16"
            rx="10"
            ry="6"
            stroke="var(--primary)"
            strokeWidth="1.5"
            transform="rotate(-30 16 16)"
            opacity="0.5"
          />
          <ellipse
            cx="16"
            cy="16"
            rx="10"
            ry="6"
            stroke="var(--primary)"
            strokeWidth="1.5"
            transform="rotate(30 16 16)"
            opacity="0.5"
          />
          {/* Center V mark */}
          <path
            d="M12 11L16 21L20 11"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Quantum dot */}
          <circle
            cx="16"
            cy="21"
            r="2"
            fill="var(--primary)"
            className="animate-glow-pulse"
          />
        </svg>
      </div>
      <span className="font-display font-semibold text-lg tracking-tight text-foreground group-hover:text-primary transition-colors duration-200">
        Veritas Q
      </span>
    </Link>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      render={<Link href={href} />}
      className={
        isActive
          ? "text-primary bg-primary/8"
          : "text-muted-foreground hover:text-foreground"
      }
    >
      <Icon className="size-4" />
      {label}
    </Button>
  );
}

function MobileNavLink({
  href,
  label,
  icon: Icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
}) {
  return (
    <SheetClose
      render={
        <Button
          variant="ghost"
          size="lg"
          render={<Link href={href} />}
          className={`w-full justify-start gap-3 ${
            isActive
              ? "text-primary bg-primary/8"
              : "text-muted-foreground hover:text-foreground"
          }`}
        />
      }
    >
      <Icon className="size-5" />
      {label}
    </SheetClose>
  );
}

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      {/* Top gradient border accent */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--primary) 30%, var(--primary) 70%, transparent)",
          opacity: 0.15,
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Left: Mobile hamburger + Logo */}
          <div className="flex items-center gap-3">
            {/* Mobile menu */}
            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="sm:hidden"
                    aria-label="Menu de navigation"
                  />
                }
              >
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetPopup side="left" showCloseButton>
                <SheetHeader>
                  <SheetTitle>
                    <QuantumLogo />
                  </SheetTitle>
                </SheetHeader>
                <SheetPanel>
                  <nav className="flex flex-col gap-1">
                    {navLinks.map((link) => (
                      <MobileNavLink
                        key={link.href}
                        href={link.href}
                        label={link.label}
                        icon={link.icon}
                        isActive={
                          link.href === "/"
                            ? pathname === "/"
                            : pathname.startsWith(link.href)
                        }
                      />
                    ))}
                    <SignedIn>
                      <div className="my-2 h-px bg-border" />
                      <MobileNavLink
                        href="/dashboard/settings"
                        label="Paramètres"
                        icon={Settings}
                        isActive={pathname.startsWith("/dashboard/settings")}
                      />
                    </SignedIn>
                  </nav>

                  {/* Mobile quantum status */}
                  <div className="mt-6 pt-4 border-t border-border">
                    <Badge variant="success" size="sm">
                      <Zap className="size-3" />
                      Quantum Secure
                    </Badge>
                  </div>
                </SheetPanel>
              </SheetPopup>
            </Sheet>

            <QuantumLogo />
          </div>

          {/* Center: Desktop navigation */}
          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                icon={link.icon}
                isActive={
                  link.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(link.href)
                }
              />
            ))}
          </nav>

          {/* Right: Status + Cmd+K + Auth */}
          <div className="flex items-center gap-3">
            {/* Quantum status indicator */}
            <Badge
              variant="success"
              size="sm"
              className="hidden md:inline-flex"
            >
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              Quantum
            </Badge>

            {/* Cmd+K keyboard shortcut hint */}
            <button
              onClick={() =>
                document.dispatchEvent(new Event("toggle-command-palette"))
              }
              className="hidden lg:inline-flex cursor-pointer rounded-md px-1.5 py-1 -my-1 transition-colors hover:bg-accent/50"
              aria-label="Ouvrir la palette de commandes (⌘K)"
            >
              <KbdGroup>
                <Kbd>&#8984;</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
            </button>

            {/* Auth section */}
            <SignedOut>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/sign-in" />}
                >
                  Connexion
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  render={<Link href="/sign-up" />}
                >
                  Créer un compte
                </Button>
              </div>
            </SignedOut>

            <SignedIn>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "w-8 h-8 ring-1 ring-border",
                    userButtonPopoverCard:
                      "bg-popover border border-border shadow-lg",
                    userButtonPopoverActionButton:
                      "text-foreground hover:bg-accent",
                    userButtonPopoverActionButtonText: "text-foreground",
                    userButtonPopoverFooter: "hidden",
                  },
                }}
                afterSignOutUrl="/"
              />
            </SignedIn>
          </div>
        </div>
      </div>
    </header>
  );
}
