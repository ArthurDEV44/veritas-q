"use client";

import dynamic from "next/dynamic";
import { Camera, ShieldCheck } from "lucide-react";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

// Debug console - only in development
const DebugConsole =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("@/components/DebugConsole"), { ssr: false })
    : null;

function CameraSkeleton() {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 py-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-6 w-24" />
      </div>
      <Skeleton className="w-full aspect-[4/3] sm:aspect-video rounded-2xl" />
      <div className="flex justify-center">
        <Skeleton className="h-14 w-14 rounded-full" />
      </div>
    </div>
  );
}

function VerifierSkeleton() {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 py-6">
      <Skeleton className="w-full aspect-[4/3] sm:aspect-video rounded-2xl" />
      <div className="flex justify-center">
        <Skeleton className="h-10 w-48 rounded-full" />
      </div>
    </div>
  );
}

const CameraCapture = dynamic(() => import("@/components/CameraCapture"), {
  ssr: false,
  loading: () => <CameraSkeleton />,
});

const CameraPermissionGuard = dynamic(
  () => import("@/components/CameraPermissionGuard"),
  { ssr: false, loading: () => <CameraSkeleton /> }
);

const Verifier = dynamic(() => import("@/components/Verifier"), {
  ssr: false,
  loading: () => <VerifierSkeleton />,
});

export default function HomeTabs() {
  return (
    <>
      {DebugConsole && <DebugConsole />}

      <Tabs defaultValue="capture">
        <TabsList variant="underline" className="mx-auto mb-6">
          <TabsTab value="capture">
            <Camera className="size-4" />
            Capturer
          </TabsTab>
          <TabsTab value="verify">
            <ShieldCheck className="size-4" />
            Vérifier
          </TabsTab>
        </TabsList>

        <TabsPanel value="capture">
          <div className="flex justify-center">
            <div className="w-full max-w-2xl">
              <CameraPermissionGuard>
                <CameraCapture />
              </CameraPermissionGuard>
            </div>
          </div>
        </TabsPanel>

        <TabsPanel value="verify">
          <div className="flex justify-center">
            <div className="w-full max-w-2xl">
              <Verifier />
            </div>
          </div>
        </TabsPanel>
      </Tabs>
    </>
  );
}
