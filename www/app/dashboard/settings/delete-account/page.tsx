"use client";

import { useState } from "react";
import { useUser, useClerk, useAuth } from "@clerk/nextjs";
import { ArrowLeft, AlertTriangle, Trash2, Shield } from "lucide-react";
import Link from "next/link";
import { API_URL, getAuthHeaders } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardPanel } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const CONFIRMATION_TEXT = "SUPPRIMER";

export default function DeleteAccountPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();

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
      const authHeaders = await getAuthHeaders(getToken);
      const response = await fetch(`${API_URL}/api/v1/users/me`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.detail || "Failed to delete account from database"
        );
      }

      await user.delete();
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
      {/* Breadcrumb + back navigation */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/dashboard/settings" />}
          aria-label="Retour aux parametres"
        >
          <ArrowLeft />
        </Button>
        <div className="space-y-1">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/dashboard" />}>
                  Dashboard
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/dashboard/settings" />}>
                  Parametres
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Supprimer le compte</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="text-xl sm:text-2xl font-bold text-destructive-foreground">
            Supprimer mon compte
          </h1>
        </div>
      </div>

      {step === "warning" && (
        <div className="space-y-6">
          {/* Warning alert */}
          <Alert variant="error">
            <AlertTriangle />
            <AlertTitle>Attention : Cette action est definitive</AlertTitle>
            <AlertDescription>
              La suppression de votre compte entrainera la perte irreversible de
              vos donnees.
            </AlertDescription>
          </Alert>

          {/* Consequences list */}
          <div className="space-y-3">
            <ConsequenceCard
              icon={Trash2}
              title="Suppression de vos donnees personnelles"
              description="Votre profil, email et informations de compte seront supprimes de notre base de donnees."
              variant="destructive"
            />
            <ConsequenceCard
              icon={Trash2}
              title="Suppression de vos medias"
              description="Toutes les photos et videos que vous avez scellees seront supprimees de nos serveurs."
              variant="destructive"
            />
            <ConsequenceCard
              icon={Shield}
              title="Conservation des preuves cryptographiques"
              description="Les hashs cryptographiques (seals) sont conserves pour maintenir l'integrite du systeme de verification. Cela permet de verifier l'authenticite des medias deja partages."
              variant="preserved"
            />
          </div>

          {/* GDPR note */}
          <Alert variant="info">
            <AlertDescription>
              Cette action est conforme au RGPD (Article 17 - Droit a
              l&apos;effacement). Les seals cryptographiques sont conserves car
              ils ne contiennent pas de donnees personnelles et sont necessaires
              a l&apos;integrite du systeme de verification.
            </AlertDescription>
          </Alert>

          {/* Continue button */}
          <Button
            variant="destructive-outline"
            className="w-full"
            onClick={() => setStep("confirm")}
          >
            Je comprends, continuer
          </Button>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-6">
          {/* Confirmation card */}
          <Card>
            <CardHeader>
              <CardTitle>Confirmer la suppression</CardTitle>
            </CardHeader>
            <CardPanel className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pour confirmer la suppression de votre compte, tapez{" "}
                <Badge variant="error" size="sm" className="font-mono">
                  {CONFIRMATION_TEXT}
                </Badge>{" "}
                dans le champ ci-dessous.
              </p>

              <Field>
                <FieldLabel>Code de confirmation</FieldLabel>
                <Input
                  value={confirmationInput}
                  onChange={(e) =>
                    setConfirmationInput(
                      (e.target as HTMLInputElement).value.toUpperCase()
                    )
                  }
                  placeholder={`Tapez ${CONFIRMATION_TEXT} pour confirmer`}
                  disabled={isDeleting}
                  size="lg"
                />
                <FieldDescription>
                  Cette action est irreversible
                </FieldDescription>
                {error && <FieldError>{error}</FieldError>}
              </Field>

              <Separator />

              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setStep("warning");
                    setConfirmationInput("");
                    setError(null);
                  }}
                  disabled={isDeleting}
                >
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDelete}
                  disabled={!isConfirmed || isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Spinner className="size-4" />
                      Suppression...
                    </>
                  ) : (
                    <>
                      <Trash2 />
                      Supprimer mon compte
                    </>
                  )}
                </Button>
              </div>
            </CardPanel>
          </Card>

          {/* Account info */}
          <Alert>
            <AlertDescription>
              Compte a supprimer :{" "}
              <span className="text-foreground font-medium">
                {user?.primaryEmailAddress?.emailAddress}
              </span>
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}

function ConsequenceCard({
  icon: Icon,
  title,
  description,
  variant,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  variant: "destructive" | "preserved";
}) {
  return (
    <Card
      className={
        variant === "destructive"
          ? "border-destructive/20 bg-destructive/4"
          : "border-success/20 bg-success/4"
      }
    >
      <CardPanel className="flex items-start gap-3">
        <Icon
          className={`size-5 mt-0.5 shrink-0 ${
            variant === "destructive"
              ? "text-destructive-foreground"
              : "text-success-foreground"
          }`}
        />
        <div>
          <h3
            className={`font-medium text-sm ${
              variant === "destructive"
                ? "text-destructive-foreground"
                : "text-success-foreground"
            }`}
          >
            {title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </CardPanel>
    </Card>
  );
}
