"use client";

import { useState } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { ArrowLeft, AlertTriangle, Trash2, Shield } from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const CONFIRMATION_TEXT = "SUPPRIMER";

export default function DeleteAccountPage() {
  const { user } = useUser();
  const { signOut } = useClerk();

  const [confirmationInput, setConfirmationInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"warning" | "confirm">("warning");

  const isConfirmed = confirmationInput === CONFIRMATION_TEXT;

  const handleDelete = async () => {
    if (!isConfirmed || !user) return;

    setIsDeleting(true);
    setError(null);

    try {
      // Step 1: Delete from our database first
      const response = await fetch(`${API_URL}/api/v1/users/me`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": user.id,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to delete account from database");
      }

      // Step 2: Delete from Clerk
      await user.delete();

      // Step 3: Sign out and redirect
      await signOut({ redirectUrl: "/" });
    } catch (err) {
      console.error("Delete account error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue lors de la suppression du compte"
      );
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Back navigation */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          aria-label="Retour aux parametres"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-red-500">
            Supprimer mon compte
          </h1>
          <p className="text-sm text-foreground/60">
            Cette action est irreversible
          </p>
        </div>
      </div>

      {step === "warning" && (
        <div className="space-y-6">
          {/* Warning card */}
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-red-500/10">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div className="space-y-2">
                <h2 className="font-semibold text-red-500">
                  Attention : Cette action est definitive
                </h2>
                <p className="text-sm text-foreground/80">
                  La suppression de votre compte entrainera :
                </p>
              </div>
            </div>
          </div>

          {/* Consequences list */}
          <div className="space-y-4">
            <ConsequenceItem
              icon={Trash2}
              title="Suppression de vos donnees personnelles"
              description="Votre profil, email et informations de compte seront supprimes de notre base de donnees."
              destructive
            />
            <ConsequenceItem
              icon={Trash2}
              title="Suppression de vos medias"
              description="Toutes les photos et videos que vous avez scellees seront supprimees de nos serveurs."
              destructive
            />
            <ConsequenceItem
              icon={Shield}
              title="Conservation des preuves cryptographiques"
              description="Les hashs cryptographiques (seals) sont conserves pour maintenir l'integrite du systeme de verification. Cela permet de verifier l'authenticite des medias deja partages."
              preserved
            />
          </div>

          {/* GDPR note */}
          <div className="rounded-lg border border-border bg-surface/30 p-4 text-sm text-foreground/60">
            <p>
              Cette action est conforme au RGPD (Article 17 - Droit a
              l&apos;effacement). Les seals cryptographiques sont conserves car
              ils ne contiennent pas de donnees personnelles et sont necessaires
              a l&apos;integrite du systeme de verification.
            </p>
          </div>

          {/* Continue button */}
          <button
            onClick={() => setStep("confirm")}
            className="w-full py-3 px-4 rounded-lg border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors font-medium"
          >
            Je comprends, continuer
          </button>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-6">
          {/* Confirmation card */}
          <div className="rounded-xl border border-border bg-surface/50 p-6 space-y-4">
            <h2 className="font-semibold">Confirmer la suppression</h2>
            <p className="text-sm text-foreground/60">
              Pour confirmer la suppression de votre compte, tapez{" "}
              <code className="px-2 py-1 rounded bg-red-500/10 text-red-500 font-mono">
                {CONFIRMATION_TEXT}
              </code>{" "}
              dans le champ ci-dessous.
            </p>

            <input
              type="text"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value.toUpperCase())}
              placeholder={`Tapez ${CONFIRMATION_TEXT} pour confirmer`}
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-foreground/40 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
              disabled={isDeleting}
            />

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep("warning");
                  setConfirmationInput("");
                  setError(null);
                }}
                className="flex-1 py-3 px-4 rounded-lg border border-border text-foreground/60 hover:bg-surface-hover transition-colors"
                disabled={isDeleting}
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={!isConfirmed || isDeleting}
                className="flex-1 py-3 px-4 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Suppression...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Supprimer mon compte
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Account info */}
          <div className="rounded-lg border border-border bg-surface/30 p-4">
            <p className="text-sm text-foreground/60">
              Compte a supprimer :{" "}
              <span className="text-foreground font-medium">
                {user?.primaryEmailAddress?.emailAddress}
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsequenceItem({
  icon: Icon,
  title,
  description,
  destructive = false,
  preserved = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  destructive?: boolean;
  preserved?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        destructive
          ? "border-red-500/20 bg-red-500/5"
          : preserved
          ? "border-quantum/20 bg-quantum/5"
          : "border-border bg-surface/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={`w-5 h-5 mt-0.5 ${
            destructive
              ? "text-red-500"
              : preserved
              ? "text-quantum"
              : "text-foreground/60"
          }`}
        />
        <div>
          <h3
            className={`font-medium text-sm ${
              destructive
                ? "text-red-500"
                : preserved
                ? "text-quantum"
                : "text-foreground"
            }`}
          >
            {title}
          </h3>
          <p className="text-sm text-foreground/60 mt-1">{description}</p>
        </div>
      </div>
    </div>
  );
}
