"use client";

import {
  ShieldCheck,
  ShieldX,
  Search,
  Clock,
  Hash,
  Cpu,
  Link2,
  AlertTriangle,
  Info,
  CheckCircle,
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

interface VerificationResultProps {
  result: UnifiedVerificationResult;
  onReset: () => void;
}

export default function VerificationResult({
  result,
  onReset,
}: VerificationResultProps) {
  return (
    <div className="w-full max-w-lg animate-[scaleIn_0.3s_ease-out]">
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
        <ErrorDisplay message={result.error} />
      )}

      <div className="mt-6 flex justify-center animate-[fadeIn_0.3s_ease-out]">
        <button
          onClick={onReset}
          className="px-6 py-2 bg-surface-elevated hover:bg-surface-elevated/80 rounded-full border border-border transition-colors text-sm"
        >
          Vérifier une autre image
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Classic Verification Result
// ============================================================================

function ClassicResult({
  result,
  success,
}: {
  result: VerifyResponse;
  success: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-4 p-8 rounded-2xl ${
        success ? "bg-green-500/10" : "bg-red-500/10"
      }`}
    >
      <div
        className={success ? "quantum-glow animate-[scaleIn_0.3s_ease-out]" : "animate-[scaleIn_0.3s_ease-out]"}
        style={
          success
            ? { boxShadow: "0 0 40px rgba(34, 197, 94, 0.4)", borderRadius: "999px" }
            : {}
        }
      >
        {success ? (
          <ShieldCheck className="w-20 h-20 text-green-500" />
        ) : (
          <ShieldX className="w-20 h-20 text-red-500" />
        )}
      </div>
      <h2
        className={`text-2xl font-bold ${
          success ? "text-green-500" : "text-red-500"
        }`}
      >
        {success ? "AUTHENTIQUE" : "INVALIDE"}
      </h2>
      {/* SealBadge for valid verifications */}
      {success && (
        <SealBadge
          status="valid"
          size="large"
          clickable={false}
          trustTier="tier1"
        />
      )}
      {!success && (
        <SealBadge
          status="invalid"
          size="large"
          clickable={false}
        />
      )}
      <p className="text-foreground/60 text-center max-w-sm">{result.details}</p>
    </div>
  );
}

// ============================================================================
// C2PA Verification Result
// ============================================================================

function C2paResult({ result }: { result: C2paVerifyResponse }) {
  const { quantum_seal, c2pa_valid, claim_generator, validation_errors } = result;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div
        className={`flex flex-col items-center gap-4 p-6 rounded-2xl ${
          c2pa_valid ? "bg-green-500/10" : "bg-red-500/10"
        }`}
      >
        <div
          className={c2pa_valid ? "quantum-glow animate-[scaleIn_0.3s_ease-out]" : "animate-[scaleIn_0.3s_ease-out]"}
          style={
            c2pa_valid
              ? { boxShadow: "0 0 40px rgba(34, 197, 94, 0.4)", borderRadius: "999px" }
              : {}
          }
        >
          {c2pa_valid ? (
            <ShieldCheck className="w-16 h-16 text-green-500" />
          ) : (
            <ShieldX className="w-16 h-16 text-red-500" />
          )}
        </div>
        <div className="text-center">
          <h2
            className={`text-xl font-bold ${
              c2pa_valid ? "text-green-500" : "text-red-500"
            }`}
          >
            {c2pa_valid ? "AUTHENTIQUE" : "INVALIDE"}
          </h2>
          {/* SealBadge for C2PA verification */}
          <div className="mt-3">
            <SealBadge
              status={c2pa_valid ? "valid" : "invalid"}
              size="medium"
              clickable={false}
              trustTier="tier1"
            />
          </div>
          <p className="text-foreground/60 text-sm mt-2">
            Manifest C2PA {c2pa_valid ? "valide" : "invalide"}
          </p>
        </div>
      </div>

      {/* Quantum Seal Details */}
      {quantum_seal && (
        <div className="bg-surface-elevated rounded-xl p-4 space-y-3 animate-[fadeIn_0.3s_ease-out]">
          <h3 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
            <Info className="w-4 h-4 text-quantum" />
            Détails du Sceau Quantum
          </h3>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailRow
              icon={<Cpu className="w-4 h-4" />}
              label="Source QRNG"
              value={formatQrngSource(quantum_seal.qrng_source)}
            />
            <DetailRow
              icon={<Clock className="w-4 h-4" />}
              label="Horodatage"
              value={formatTimestamp(quantum_seal.capture_timestamp)}
            />
            <DetailRow
              icon={<Hash className="w-4 h-4" />}
              label="Hash contenu"
              value={truncateHash(quantum_seal.content_hash)}
              mono
            />
            <DetailRow
              icon={<ShieldCheck className="w-4 h-4" />}
              label="Signature ML-DSA"
              value={`${quantum_seal.signature_size} octets`}
            />
          </div>

          {/* Blockchain Anchor */}
          {quantum_seal.blockchain_anchor && (
            <div className="pt-3 border-t border-border">
              <DetailRow
                icon={<Link2 className="w-4 h-4 text-quantum" />}
                label="Ancrage Blockchain"
                value={`${quantum_seal.blockchain_anchor.chain} (${quantum_seal.blockchain_anchor.network})`}
                highlight
              />
              <p className="text-xs text-foreground/50 mt-1 font-mono break-all">
                TX: {truncateHash(quantum_seal.blockchain_anchor.transaction_id, 24)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Claim Generator */}
      {claim_generator && (
        <div className="bg-surface rounded-lg p-3 text-sm animate-[fadeIn_0.3s_ease-out]">
          <span className="text-foreground/50">Générateur: </span>
          <span className="text-foreground/80">{claim_generator}</span>
        </div>
      )}

      {/* Validation Errors */}
      {validation_errors.length > 0 && (
        <div className="bg-red-500/10 rounded-lg p-3 space-y-2 animate-[fadeIn_0.3s_ease-out]">
          <h4 className="text-sm font-semibold text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Erreurs de validation
          </h4>
          <ul className="text-sm text-red-300 space-y-1">
            {validation_errors.map((error, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-red-400">•</span>
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Soft Binding Resolution Result
// ============================================================================

function SoftBindingResult({ result }: { result: ResolveResponse }) {
  const { found, count, matches } = result;
  const bestMatch = matches[0];

  if (!found || count === 0) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-surface-elevated">
        <Search className="w-16 h-16 text-foreground/40" />
        <h2 className="text-xl font-bold text-foreground/60">
          AUCUN SCEAU TROUVÉ
        </h2>
        <p className="text-foreground/50 text-center max-w-sm">
          Cette image ne correspond à aucun sceau enregistré dans notre base de
          données.
        </p>
      </div>
    );
  }

  const confidence = getConfidenceLevel(bestMatch.hamming_distance);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-amber-500/10">
        <div className="animate-[scaleIn_0.3s_ease-out]">
          <Search className="w-16 h-16 text-amber-500" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-amber-500">SCEAU RETROUVE</h2>
          {/* SealBadge for found seals - show as tampered if distance > 0 */}
          <div className="mt-3">
            <SealBadge
              sealId={bestMatch.seal_id}
              status={bestMatch.hamming_distance > 0 ? "tampered" : "valid"}
              size="medium"
              clickable={true}
              showExternalIcon={true}
              trustTier="tier1"
            />
          </div>
          <p className="text-foreground/60 text-sm mt-2">
            via hash perceptuel
          </p>
        </div>
      </div>

      {/* Best Match Details */}
      <div className="bg-surface-elevated rounded-xl p-4 space-y-3 animate-[fadeIn_0.3s_ease-out]">
        <h3 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-amber-500" />
          Meilleure correspondance
        </h3>

        <div className="space-y-3">
          {/* Confidence Indicator */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground/60">Confiance</span>
            <div className="flex items-center gap-2">
              <ConfidenceBar distance={bestMatch.hamming_distance} />
              <span className={`text-sm font-medium ${confidence.color}`}>
                {confidence.label}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailRow
              icon={<Hash className="w-4 h-4" />}
              label="Distance Hamming"
              value={`${bestMatch.hamming_distance} bits`}
            />
            <DetailRow
              icon={<Clock className="w-4 h-4" />}
              label="Créé le"
              value={new Date(bestMatch.created_at).toLocaleDateString("fr-FR")}
            />
            <DetailRow
              icon={<ShieldCheck className="w-4 h-4" />}
              label="ID du sceau"
              value={truncateHash(bestMatch.seal_id, 12)}
              mono
            />
            <DetailRow
              icon={<Info className="w-4 h-4" />}
              label="Type de média"
              value={bestMatch.media_type}
            />
          </div>
        </div>

        {/* Warning about modification */}
        {bestMatch.hamming_distance > 0 && (
          <div className="pt-3 border-t border-border">
            <div className="flex items-start gap-2 text-amber-400 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                Image modifiée (compression, redimensionnement ou recadrage
                détecté). Le sceau original a été retrouvé.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Other matches */}
      {count > 1 && (
        <div className="bg-surface rounded-lg p-3 text-sm text-foreground/60 animate-[fadeIn_0.3s_ease-out]">
          <span>{count - 1} autre(s) correspondance(s) trouvée(s)</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Error Display
// ============================================================================

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-red-500/10">
      <AlertTriangle className="w-12 h-12 text-red-500" />
      <h3 className="text-lg font-semibold text-red-500">Erreur</h3>
      <p className="text-foreground/60 text-center max-w-sm">{message}</p>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function DetailRow({
  icon,
  label,
  value,
  mono = false,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={highlight ? "text-quantum" : "text-foreground/40"}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-foreground/50 text-xs">{label}</p>
        <p
          className={`text-foreground/80 truncate ${mono ? "font-mono text-xs" : ""}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function ConfidenceBar({ distance }: { distance: number }) {
  // 0 = 100% confidence, 10 = 0% confidence
  const percentage = Math.max(0, Math.min(100, (1 - distance / 10) * 100));

  let barColor = "bg-green-500";
  if (distance > 5) barColor = "bg-yellow-500";
  if (distance > 8) barColor = "bg-orange-500";

  return (
    <div className="w-16 h-2 bg-surface rounded-full overflow-hidden">
      <div
        className={`h-full ${barColor} transition-all duration-500 ease-out`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
