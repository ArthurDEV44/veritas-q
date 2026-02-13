"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Camera, Shield } from "lucide-react";

// Debug console - only in development
const DebugConsole =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("@/components/DebugConsole"), {
        ssr: false,
      })
    : null;

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

interface TabSwitcherProps {
  scanContent: ReactNode;
  checkContent: ReactNode;
}

export default function TabSwitcher({ scanContent, checkContent }: TabSwitcherProps) {
  const [activeTab, setActiveTab] = useState<TabId>("scan");

  return (
    <>
      {/* Debug console - only in development */}
      {DebugConsole && <DebugConsole />}

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
                    ? "text-quantum bg-surface-elevated"
                    : "text-foreground/60 hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
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
                    isActive ? "text-quantum" : "text-foreground/50"
                  }`}
                >
                  {isActive && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-quantum rounded-full" />
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
        <div
          className="h-full transition-opacity duration-200"
          style={{ opacity: 1 }}
        >
          {activeTab === "scan" ? scanContent : checkContent}
        </div>
      </div>
    </div>
    </>
  );
}
