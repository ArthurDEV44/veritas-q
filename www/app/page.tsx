"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Camera, Shield } from "lucide-react";
import CameraCapture from "@/components/CameraCapture";
import CameraPermissionGuard from "@/components/CameraPermissionGuard";
import Verifier from "@/components/Verifier";

type TabId = "scan" | "check";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: Tab[] = [
  { id: "scan", label: "Scan", icon: Camera },
  { id: "check", label: "Check", icon: Shield },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("scan");

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Tab navigation - Fixed at bottom on mobile, top on desktop */}
      <div className="order-last sm:order-first">
        {/* Desktop tabs */}
        <div className="hidden sm:flex gap-2 p-1 bg-surface rounded-xl max-w-xs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-colors ${
                  isActive
                    ? "text-quantum"
                    : "text-foreground/60 hover:text-foreground"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-surface-elevated rounded-lg"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Mobile bottom navigation */}
        <div className="fixed bottom-0 left-0 right-0 sm:hidden bg-surface/95 backdrop-blur-lg border-t border-border safe-area-inset-bottom">
          <div className="flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                    isActive
                      ? "text-quantum"
                      : "text-foreground/50"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="mobileActiveTab"
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-quantum rounded-full"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                  <Icon className="w-6 h-6" />
                  <span className="text-xs font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 pb-20 sm:pb-0">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: activeTab === "scan" ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          {activeTab === "scan" ? (
            <div className="space-y-6">
              <div className="text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-bold">
                  Sceau Quantique
                </h1>
                <p className="text-foreground/60 mt-2">
                  Capturez et scellez vos médias avec l&apos;entropie quantique
                </p>
              </div>
              <CameraPermissionGuard>
                <CameraCapture />
              </CameraPermissionGuard>
            </div>
          ) : (
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
          )}
        </motion.div>
      </div>
    </div>
  );
}
