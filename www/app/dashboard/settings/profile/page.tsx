import { UserProfile } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profil | Veritas Q",
  description: "Modifiez vos informations de profil Veritas Q",
};

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          aria-label="Retour aux parametres"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Mon Profil</h1>
          <p className="text-sm text-foreground/60">
            Modifiez vos informations personnelles
          </p>
        </div>
      </div>

      {/* Clerk UserProfile component */}
      <div className="flex justify-center">
        <UserProfile
          appearance={{
            elements: {
              // Root container
              rootBox: "w-full max-w-3xl",
              card: "bg-surface border border-border shadow-none rounded-xl",
              navbar: "hidden",
              navbarMobileMenuRow: "hidden",

              // Header
              headerTitle: "text-foreground",
              headerSubtitle: "text-foreground/60",

              // Profile section
              profileSectionTitle: "text-foreground",
              profileSectionTitleText: "text-foreground font-medium",
              profileSectionContent: "text-foreground",
              profileSectionPrimaryButton: "text-quantum hover:text-quantum/80",

              // Form elements
              formFieldLabel: "text-foreground",
              formFieldInput:
                "bg-background border border-border text-foreground placeholder:text-foreground/40 focus:border-quantum focus:ring-quantum",
              formFieldInputShowPasswordButton: "text-foreground/60",
              formButtonPrimary:
                "bg-quantum hover:bg-quantum/90 text-background",
              formButtonReset: "text-foreground/60 hover:text-foreground",

              // Avatar
              avatarBox: "border-2 border-quantum/20",
              avatarImageActionsUpload: "text-quantum hover:text-quantum/80",
              avatarImageActionsRemove: "text-red-500 hover:text-red-400",

              // Page content
              pageScrollBox: "p-0",
              page: "gap-6",

              // Badges and alerts
              badge: "bg-quantum/10 text-quantum border-quantum/20",
              alertText: "text-foreground",

              // Accordion (for connected accounts, etc.)
              accordionTriggerButton: "text-foreground hover:bg-surface-hover",
              accordionContent: "text-foreground/80",

              // Menu items
              menuButton: "text-foreground hover:bg-surface-hover",
              menuItem: "text-foreground hover:bg-surface-hover",

              // Breadcrumbs
              breadcrumbs: "hidden",
              breadcrumbsItem: "text-foreground/60",
              breadcrumbsItemDivider: "text-foreground/40",

              // Footer
              footer: "hidden",
            },
            layout: {
              shimmer: false,
            },
          }}
          routing="hash"
        />
      </div>

      {/* Info note */}
      <div className="max-w-3xl mx-auto">
        <div className="rounded-lg border border-border bg-surface/30 p-4 text-sm text-foreground/60">
          <p>
            Les modifications de votre profil sont automatiquement synchronisees
            avec votre compte Veritas Q. Les changements d&apos;email necessitent
            une verification.
          </p>
        </div>
      </div>
    </div>
  );
}
