import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
  description: "Quantum-authenticated media verification",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Veritas Q",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <div className="flex flex-col min-h-screen">
          {/* Header - Mobile app style on small screens, Dashboard style on desktop */}
          <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-lg border-b border-border">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-14 sm:h-16">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-quantum/20 flex items-center justify-center">
                    <span className="text-quantum font-bold text-lg">V</span>
                  </div>
                  <span className="font-semibold text-lg tracking-tight">
                    Veritas Q
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-sm text-foreground/60">
                  <span className="w-2 h-2 rounded-full bg-quantum animate-pulse" />
                  <span>Quantum Secure</span>
                </div>
              </div>
            </div>
          </header>

          {/* Main content area */}
          <main className="flex-1 flex flex-col">
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
      </body>
    </html>
  );
}
