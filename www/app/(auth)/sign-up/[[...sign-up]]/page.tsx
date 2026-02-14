import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Shield, Atom, FileCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { clerkAppearance } from "@/lib/clerk-appearance";

export const metadata: Metadata = {
  title: "Creer un compte | Veritas Q",
  description:
    "Rejoignez Veritas Q et authentifiez vos medias avec la cryptographie quantique",
};

function QuantumMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className="w-10 h-10"
      aria-hidden="true"
    >
      <circle
        cx="16"
        cy="16"
        r="14"
        stroke="var(--primary)"
        strokeWidth="1.5"
        opacity="0.3"
      />
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
      <path
        d="M12 11L16 21L20 11"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="21" r="2" fill="var(--primary)" />
    </svg>
  );
}

export default function SignUpPage() {
  return (
    <div className="flex flex-col items-center">
      {/* Brand */}
      <div className="text-center mb-8 animate-fade-in">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
          <QuantumMark />
        </div>
        <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">
          Creer un compte
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Rejoignez Veritas Q et authentifiez vos medias
        </p>
      </div>

      {/* Clerk Sign-Up */}
      <SignUp
        appearance={clerkAppearance}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/dashboard"
      />

      {/* Trust indicators */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2 animate-fade-in">
        <Badge variant="outline" size="sm">
          <Shield className="size-3" />
          ML-DSA-65
        </Badge>
        <Badge variant="outline" size="sm">
          <Atom className="size-3" />
          QRNG Entropy
        </Badge>
        <Badge variant="outline" size="sm">
          <FileCheck className="size-3" />
          C2PA Compatible
        </Badge>
      </div>
      <p className="mt-3 text-xs text-muted-foreground text-center max-w-xs animate-fade-in">
        Vos medias sont proteges par des signatures post-quantiques ML-DSA-65
      </p>

      {/* Footer link */}
      <p className="mt-6 text-sm text-muted-foreground animate-fade-in">
        Deja un compte ?{" "}
        <Link
          href="/sign-in"
          className="text-primary hover:brightness-90 transition-colors font-medium"
        >
          Se connecter
        </Link>
      </p>
    </div>
  );
}
