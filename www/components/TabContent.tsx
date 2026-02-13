"use client";

import dynamic from "next/dynamic";

// Skeleton components for loading states
function CameraSkeleton() {
  return (
    <div className="w-full aspect-video bg-surface-elevated rounded-xl animate-pulse flex items-center justify-center">
      <div className="text-foreground/40">Chargement de la caméra...</div>
    </div>
  );
}

function VerifierSkeleton() {
  return (
    <div className="w-full p-8 bg-surface-elevated rounded-xl animate-pulse flex items-center justify-center">
      <div className="text-foreground/40">Chargement du vérificateur...</div>
    </div>
  );
}

// Lazy-load components
const CameraCapture = dynamic(() => import("@/components/CameraCapture"), {
  ssr: false,
  loading: () => <CameraSkeleton />,
});

const CameraPermissionGuard = dynamic(
  () => import("@/components/CameraPermissionGuard"),
  {
    ssr: false,
    loading: () => <CameraSkeleton />,
  }
);

const Verifier = dynamic(() => import("@/components/Verifier"), {
  ssr: false,
  loading: () => <VerifierSkeleton />,
});

interface TabContentProps {
  type: "scan" | "check";
}

export default function TabContent({ type }: TabContentProps) {
  if (type === "scan") {
    return (
      <div className="space-y-6">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-bold">Sceau Quantique</h1>
          <p className="text-foreground/60 mt-2">
            Capturez et scellez vos médias avec l&apos;entropie quantique
          </p>
        </div>
        <CameraPermissionGuard>
          <CameraCapture />
        </CameraPermissionGuard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center sm:text-left">
        <h1 className="text-2xl sm:text-3xl font-bold">
          Vérifier l&apos;authenticité
        </h1>
        <p className="text-foreground/60 mt-2">
          Vérifiez si un média possède un sceau Veritas valide
        </p>
      </div>
      <Verifier />
    </div>
  );
}
