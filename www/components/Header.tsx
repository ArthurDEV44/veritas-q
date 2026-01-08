"use client";

import Link from "next/link";
import {
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-lg border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-quantum/20 flex items-center justify-center">
              <span className="text-quantum font-bold text-lg">V</span>
            </div>
            <span className="font-semibold text-lg tracking-tight">
              Veritas Q
            </span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-4">
            {/* Quantum indicator - hidden on mobile */}
            <div className="hidden sm:flex items-center gap-2 text-sm text-foreground/60">
              <span className="w-2 h-2 rounded-full bg-quantum animate-pulse" />
              <span>Quantum Secure</span>
            </div>

            {/* Auth buttons */}
            <SignedOut>
              <div className="flex items-center gap-2">
                <Link
                  href="/sign-in"
                  className="text-sm text-foreground/60 hover:text-foreground transition-colors"
                >
                  Connexion
                </Link>
                <Link
                  href="/sign-up"
                  className="text-sm px-4 py-2 rounded-lg bg-quantum text-background hover:bg-quantum/90 transition-colors"
                >
                  Créer un compte
                </Link>
              </div>
            </SignedOut>

            <SignedIn>
              <div className="flex items-center gap-4">
                <Link
                  href="/dashboard"
                  className="text-sm text-foreground/60 hover:text-foreground transition-colors"
                >
                  Dashboard
                </Link>
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "w-8 h-8",
                      userButtonPopoverCard:
                        "bg-surface border border-border shadow-lg",
                      userButtonPopoverActionButton:
                        "text-foreground hover:bg-surface-hover",
                      userButtonPopoverActionButtonText: "text-foreground",
                      userButtonPopoverFooter: "hidden",
                    },
                  }}
                  afterSignOutUrl="/"
                />
              </div>
            </SignedIn>
          </div>
        </div>
      </div>
    </header>
  );
}
