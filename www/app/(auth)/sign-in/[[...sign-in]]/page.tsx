import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { clerkAppearance } from "@/lib/clerk-appearance";

export const metadata: Metadata = {
  title: "Connexion | Veritas Q",
  description: "Connectez-vous a votre compte Veritas Q",
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

export default function SignInPage() {
  return (
    <div className="flex flex-col items-center">
      {/* Brand */}
      <div className="text-center mb-8 animate-fade-in">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
          <QuantumMark />
        </div>
        <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">
          Connexion
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Accedez a votre compte Veritas Q
        </p>
      </div>

      {/* Clerk Sign-In */}
      <SignIn
        appearance={clerkAppearance}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/dashboard"
      />

      {/* Footer link */}
      <p className="mt-6 text-sm text-muted-foreground animate-fade-in">
        Nouveau ici ?{" "}
        <Link
          href="/sign-up"
          className="text-primary hover:brightness-90 transition-colors font-medium"
        >
          Creer un compte
        </Link>
      </p>
    </div>
  );
}
