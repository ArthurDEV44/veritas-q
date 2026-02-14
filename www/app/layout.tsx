import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { frFR } from "@clerk/localizations";
import "./globals.css";
import InstallBanner from "@/components/InstallBanner";
import ConnectivityStatus from "@/components/ConnectivityStatus";
import CommandPalette from "@/components/CommandPalette";
import Header from "@/components/Header";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ToastProvider } from "@/components/ui/toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Veritas Q",
  description: "Quantum-authenticated media verification - Reality Authentication",
  applicationName: "Veritas Q",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Veritas Q",
    startupImage: [
      {
        url: "/icons/icon-512x512.png",
        media: "(device-width: 390px) and (device-height: 844px)",
      },
    ],
  },
  icons: {
    icon: [
      { url: "/icons/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
  themeColor: "#06060a",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider localization={frFR}>
      <html lang="fr" className="dark">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen relative`}
        >
          <QueryProvider>
          <ToastProvider position="bottom-right">
          {/* Skip-to-content link for screen readers */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium focus:outline-none"
          >
            Aller au contenu principal
          </a>
          <div className="flex flex-col min-h-screen isolate">
            <Header />

            {/* Main content area */}
            <main id="main-content" className="flex-1 flex flex-col">
              <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
                {children}
              </div>
            </main>

            {/* Footer - Hidden on mobile for app-like feel */}
            <footer className="hidden sm:block border-t border-border bg-surface/50">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                <p className="text-center text-sm text-foreground/40">
                  Powered by ML-DSA-65 Post-Quantum Signatures
                </p>
              </div>
            </footer>
          </div>

          {/* PWA Components */}
          <ConnectivityStatus />
          <InstallBanner />
          <CommandPalette />
          </ToastProvider>
          </QueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
