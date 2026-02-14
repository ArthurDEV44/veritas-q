import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false },
};

/**
 * Auth route group layout — Quantum Noir auth background.
 *
 * Provides a full-height centered container with a subtle quantum
 * glow effect (CSS-only radial gradient + dot grid).
 * The root layout's Header remains visible above.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center relative min-h-[60vh] -mt-4 sm:-mt-6 lg:-mt-8 py-8 sm:py-12">
      {/* Ambient quantum glow — radial gradient behind the form */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[36rem] h-[36rem] rounded-full opacity-[0.06]"
        style={{
          background:
            "radial-gradient(circle, var(--primary) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Subtle dot grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-[26rem] mx-auto">{children}</div>
    </div>
  );
}
