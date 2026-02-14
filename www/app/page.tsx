import {
  Camera,
  Shield,
  ShieldCheck,
  Fingerprint,
  Waves,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardPanel,
} from "@/components/ui/card";
import HomeTabs from "@/components/HomeTabs";

const steps = [
  {
    step: 1,
    icon: Camera,
    title: "Capturer",
    description:
      "Prenez une photo ou une vidéo. L\u2019entropie quantique est récupérée en temps réel depuis un QRNG certifié.",
  },
  {
    step: 2,
    icon: Fingerprint,
    title: "Sceller",
    description:
      "Le contenu est hashé et signé avec ML-DSA-65, une signature post-quantique, créant un Sceau Veritas infalsifiable.",
  },
  {
    step: 3,
    icon: ShieldCheck,
    title: "Vérifier",
    description:
      "N\u2019importe qui peut vérifier l\u2019authenticité : signature cryptographique, horodatage quantique et manifeste C2PA.",
  },
] as const;

const trustIndicators = [
  { label: "ML-DSA-65", icon: Lock },
  { label: "QRNG Entropy", icon: Waves },
  { label: "C2PA Compatible", icon: Shield },
] as const;

export default function Home() {
  return (
    <div className="flex flex-col gap-12 sm:gap-16 pb-8">
      {/* ── Hero Section ─────────────────────────────────── */}
      <section className="text-center pt-6 sm:pt-12 lg:pt-16 space-y-4">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold tracking-[var(--letter-spacing-display)] leading-tight">
          Authenticité{" "}
          <span className="text-primary quantum-glow-text">Quantique</span>
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Capturez, scellez et vérifiez vos médias avec la cryptographie
          post-quantique. Chaque capture est signée avec de l&apos;entropie
          quantique véritablement aléatoire.
        </p>
      </section>

      {/* ── Tab Section (Client Boundary) ────────────────── */}
      <section>
        <HomeTabs />
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section className="space-y-8">
        <h2 className="text-2xl sm:text-3xl font-display font-semibold tracking-[var(--letter-spacing-display)] text-center">
          Comment ça marche
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map(({ step, icon: Icon, title, description }) => (
            <Card
              key={step}
              className="group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-border-emphasis"
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Badge
                    variant="default"
                    className="size-8 rounded-full p-0 text-sm font-bold"
                  >
                    {step}
                  </Badge>
                  <CardTitle className="flex items-center gap-2">
                    <Icon className="size-5 text-primary" />
                    {title}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardPanel>
                <CardDescription className="text-sm leading-relaxed">
                  {description}
                </CardDescription>
              </CardPanel>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Trust Indicators ─────────────────────────────── */}
      <section className="flex flex-wrap items-center justify-center gap-3">
        {trustIndicators.map(({ label, icon: Icon }) => (
          <Badge
            key={label}
            variant="outline"
            size="lg"
            className="gap-1.5 font-mono text-muted-foreground"
          >
            <Icon className="size-3.5 text-primary" />
            {label}
          </Badge>
        ))}
      </section>
    </div>
  );
}
