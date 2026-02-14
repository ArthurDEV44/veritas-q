"use client";

import {
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Search,
  Clock,
  Hash,
  Cpu,
  Link2,
  Info,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import type {
  UnifiedVerificationResult,
  C2paVerifyResponse,
  ResolveResponse,
  VerifyResponse,
} from "@/lib/verification";
import {
  formatTimestamp,
  formatQrngSource,
  truncateHash,
  getConfidenceLevel,
} from "@/lib/verification";
import SealBadge from "@/components/SealBadge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardPanel,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionPanel,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
} from "@/components/ui/progress";
import {
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
} from "@/components/ui/tooltip";

interface VerificationResultProps {
  result: UnifiedVerificationResult;
  onReset: () => void;
}

export default function VerificationResult({
  result,
  onReset,
}: VerificationResultProps) {
  return (
    <div className="w-full max-w-lg mx-auto flex flex-col gap-4">
      {result.method === "classic" && result.classic && (
        <ClassicResult result={result.classic} success={result.success} />
      )}
      {result.method === "c2pa" && result.c2pa && (
        <C2paResult result={result.c2pa} />
      )}
      {result.method === "soft_binding" && result.resolution && (
        <SoftBindingResult result={result.resolution} />
      )}
      {result.error && !result.success && (
        <ErrorResult message={result.error} />
      )}

      <div className="flex justify-center pt-2 animate-fade-in">
        <Button variant="outline" onClick={onReset}>
          <RotateCcw />
          Vérifier une autre image
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Classic Verification Result
// ═══════════════════════════════════════════════════════════════

function ClassicResult({
  result,
  success,
}: {
  result: VerifyResponse;
  success: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      {/* Hero section */}
      <CardPanel
        className={`flex flex-col items-center gap-4 py-8 ${
          success
            ? "bg-success/4 border-b border-success/16"
            : "bg-destructive/4 border-b border-destructive/16"
        }`}
      >
        <div
          className={`animate-scale-in ${
            success ? "shield-verified" : "shield-failed"
          }`}
        >
          {success ? (
            <div className="quantum-glow rounded-full p-1">
              <ShieldCheck className="size-20 text-success" />
            </div>
          ) : (
            <ShieldX className="size-20 text-destructive" />
          )}
        </div>
        <h2
          className={`text-2xl font-bold ${
            success ? "text-success" : "text-destructive"
          }`}
        >
          {success ? "AUTHENTIQUE" : "INVALIDE"}
        </h2>
        <SealBadge
          status={success ? "valid" : "invalid"}
          size="large"
          clickable={false}
          trustTier="tier1"
        />
        <CardDescription className="text-center max-w-sm">
          {result.details}
        </CardDescription>
      </CardPanel>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// C2PA Verification Result
// ═══════════════════════════════════════════════════════════════

function C2paResult({ result }: { result: C2paVerifyResponse }) {
  const { quantum_seal, c2pa_valid, claim_generator, validation_errors } =
    result;

  return (
    <div className="flex flex-col gap-4">
      {/* Hero Card */}
      <Card className="overflow-hidden">
        <CardPanel
          className={`flex flex-col items-center gap-4 py-8 ${
            c2pa_valid
              ? "bg-success/4 border-b border-success/16"
              : "bg-destructive/4 border-b border-destructive/16"
          }`}
        >
          <div
            className={`animate-scale-in ${
              c2pa_valid ? "shield-verified" : "shield-failed"
            }`}
          >
            {c2pa_valid ? (
              <div className="quantum-glow rounded-full p-1">
                <ShieldCheck className="size-16 text-success" />
              </div>
            ) : (
              <ShieldX className="size-16 text-destructive" />
            )}
          </div>
          <div className="text-center space-y-2">
            <h2
              className={`text-xl font-bold ${
                c2pa_valid ? "text-success" : "text-destructive"
              }`}
            >
              {c2pa_valid ? "AUTHENTIQUE" : "INVALIDE"}
            </h2>
            <SealBadge
              status={c2pa_valid ? "valid" : "invalid"}
              size="medium"
              clickable={false}
              trustTier="tier1"
            />
            <p className="text-muted-foreground text-sm">
              Manifest C2PA {c2pa_valid ? "valide" : "invalide"}
            </p>
          </div>
        </CardPanel>
      </Card>

      {/* Details Accordion */}
      <Card>
        <Accordion multiple>
          {/* Quantum Seal Details */}
          {quantum_seal && (
            <AccordionItem value="quantum-seal">
              <AccordionTrigger className="px-6">
                <span className="flex items-center gap-2">
                  <Info className="size-4 text-primary" />
                  Détails du Sceau Quantum
                </span>
              </AccordionTrigger>
              <AccordionPanel className="px-6">
                <div className="grid grid-cols-2 gap-4">
                  <DetailItem
                    icon={<Cpu className="size-4" />}
                    label="Source QRNG"
                    value={formatQrngSource(quantum_seal.qrng_source)}
                    tooltip="Générateur de nombres aléatoires quantiques utilisé pour l'entropie"
                  />
                  <DetailItem
                    icon={<Clock className="size-4" />}
                    label="Horodatage"
                    value={formatTimestamp(quantum_seal.capture_timestamp)}
                  />
                  <DetailItem
                    icon={<Hash className="size-4" />}
                    label="Hash contenu"
                    value={truncateHash(quantum_seal.content_hash)}
                    mono
                  />
                  <DetailItem
                    icon={<ShieldCheck className="size-4" />}
                    label="Signature"
                    value={`ML-DSA — ${quantum_seal.signature_size} octets`}
                    tooltip="ML-DSA-65 (FIPS 204) — Signature post-quantique"
                  />
                </div>

                {/* Blockchain Anchor */}
                {quantum_seal.blockchain_anchor && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <DetailItem
                        icon={<Link2 className="size-4 text-primary" />}
                        label="Ancrage Blockchain"
                        value={`${quantum_seal.blockchain_anchor.chain} (${quantum_seal.blockchain_anchor.network})`}
                        highlight
                      />
                      <p className="text-xs text-muted-foreground font-mono break-all pl-6">
                        TX:{" "}
                        {truncateHash(
                          quantum_seal.blockchain_anchor.transaction_id,
                          24,
                        )}
                      </p>
                    </div>
                  </>
                )}
              </AccordionPanel>
            </AccordionItem>
          )}

          {/* Claim Generator */}
          {claim_generator && (
            <AccordionItem value="generator">
              <AccordionTrigger className="px-6">
                <span className="flex items-center gap-2">
                  <Cpu className="size-4 text-muted-foreground" />
                  Générateur
                </span>
              </AccordionTrigger>
              <AccordionPanel className="px-6">
                <Badge variant="outline" size="lg">
                  {claim_generator}
                </Badge>
              </AccordionPanel>
            </AccordionItem>
          )}

          {/* Validation Errors */}
          {validation_errors.length > 0 && (
            <AccordionItem value="errors">
              <AccordionTrigger className="px-6">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-destructive" />
                  Erreurs de validation
                  <Badge variant="error" size="sm">
                    {validation_errors.length}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionPanel className="px-6">
                <ul className="space-y-2">
                  {validation_errors.map((error, i) => (
                    <li key={i}>
                      <Alert variant="error">
                        <AlertTriangle />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    </li>
                  ))}
                </ul>
              </AccordionPanel>
            </AccordionItem>
          )}
        </Accordion>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Soft Binding Resolution Result
// ═══════════════════════════════════════════════════════════════

function SoftBindingResult({ result }: { result: ResolveResponse }) {
  const { found, count, matches } = result;
  const bestMatch = matches[0];

  if (!found || count === 0) {
    return (
      <Card className="overflow-hidden">
        <CardPanel className="flex flex-col items-center gap-4 py-8">
          <Search className="size-16 text-muted-foreground animate-scale-in" />
          <CardTitle className="text-muted-foreground">
            AUCUN SCEAU TROUVÉ
          </CardTitle>
          <CardDescription className="text-center max-w-sm">
            Cette image ne correspond à aucun sceau enregistré dans notre base de
            données.
          </CardDescription>
        </CardPanel>
      </Card>
    );
  }

  const confidence = getConfidenceLevel(bestMatch.hamming_distance);

  return (
    <div className="flex flex-col gap-4">
      {/* Hero Card */}
      <Card className="overflow-hidden">
        <CardPanel className="flex flex-col items-center gap-4 py-8 bg-warning/4 border-b border-warning/16">
          <div className="animate-scale-in">
            <Search className="size-16 text-warning" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-warning">SCEAU RETROUVÉ</h2>
            <SealBadge
              sealId={bestMatch.seal_id}
              status={bestMatch.hamming_distance > 0 ? "tampered" : "valid"}
              size="medium"
              clickable={true}
              showExternalIcon={true}
              trustTier="tier1"
            />
            <p className="text-muted-foreground text-sm">
              via hash perceptuel
            </p>
          </div>
        </CardPanel>
      </Card>

      {/* Match Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle className="size-4 text-warning" />
            Meilleure correspondance
          </CardTitle>
        </CardHeader>
        <CardPanel>
          <div className="space-y-4">
            {/* Confidence Indicator */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Confiance</span>
              <div className="flex items-center gap-3">
                <ConfidenceProgress distance={bestMatch.hamming_distance} />
                <Badge
                  variant={
                    confidence.level === "exact" || confidence.level === "high"
                      ? "success"
                      : confidence.level === "medium"
                        ? "warning"
                        : "error"
                  }
                  size="sm"
                >
                  {confidence.label}
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <DetailItem
                icon={<Hash className="size-4" />}
                label="Distance Hamming"
                value={`${bestMatch.hamming_distance} bits`}
              />
              <DetailItem
                icon={<Clock className="size-4" />}
                label="Créé le"
                value={new Date(bestMatch.created_at).toLocaleDateString(
                  "fr-FR",
                )}
              />
              <DetailItem
                icon={<ShieldCheck className="size-4" />}
                label="ID du sceau"
                value={truncateHash(bestMatch.seal_id, 12)}
                mono
              />
              <DetailItem
                icon={<Info className="size-4" />}
                label="Type de média"
                value={bestMatch.media_type}
              />
            </div>

            {/* Modification warning */}
            {bestMatch.hamming_distance > 0 && (
              <>
                <Separator />
                <Alert variant="warning">
                  <ShieldAlert />
                  <AlertTitle>Image modifiée</AlertTitle>
                  <AlertDescription>
                    Compression, redimensionnement ou recadrage détecté. Le sceau
                    original a été retrouvé.
                  </AlertDescription>
                </Alert>
              </>
            )}
          </div>
        </CardPanel>

        {/* Other matches */}
        {count > 1 && (
          <CardFooter className="border-t">
            <Badge variant="outline" size="sm">
              {count - 1} autre(s) correspondance(s) trouvée(s)
            </Badge>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Error Display
// ═══════════════════════════════════════════════════════════════

function ErrorResult({ message }: { message: string }) {
  return (
    <Alert variant="error">
      <AlertTriangle />
      <AlertTitle>Erreur</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

// ═══════════════════════════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════════════════════════

function DetailItem({
  icon,
  label,
  value,
  mono = false,
  highlight = false,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  tooltip?: string;
}) {
  const content = (
    <div className="flex items-start gap-2">
      <span
        className={`mt-0.5 ${highlight ? "text-primary" : "text-muted-foreground"}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={`text-foreground truncate text-sm ${mono ? "font-mono text-xs" : ""}`}
        >
          {value}
        </p>
      </div>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger className="text-left cursor-help">
          {content}
        </TooltipTrigger>
        <TooltipPopup>{tooltip}</TooltipPopup>
      </Tooltip>
    );
  }

  return content;
}

function ConfidenceProgress({ distance }: { distance: number }) {
  const percentage = Math.max(0, Math.min(100, (1 - distance / 10) * 100));

  return (
    <Progress value={percentage} className="w-20">
      <ProgressTrack className="h-2">
        <ProgressIndicator
          className={`transition-all duration-500 ${
            distance === 0
              ? "bg-success"
              : distance <= 5
                ? "bg-success"
                : distance <= 8
                  ? "bg-warning"
                  : "bg-destructive"
          }`}
        />
      </ProgressTrack>
    </Progress>
  );
}
