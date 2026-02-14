import { UserProfile } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { InfoIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Profil | Veritas Q",
  description: "Modifiez vos informations de profil Veritas Q",
};

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      {/* Breadcrumb + back navigation */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/dashboard/settings" />}
          aria-label="Retour aux parametres"
        >
          <ArrowLeft />
        </Button>
        <div className="space-y-1">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/dashboard" />}>
                  Dashboard
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/dashboard/settings" />}>
                  Parametres
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Profil</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="text-xl sm:text-2xl font-bold">Mon Profil</h1>
        </div>
      </div>

      {/* Clerk UserProfile component */}
      <Card className="max-w-3xl mx-auto">
        <CardPanel className="p-0">
          <UserProfile
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "bg-transparent border-0 shadow-none rounded-xl",
                navbar: "hidden",
                navbarMobileMenuRow: "hidden",
                headerTitle: "text-foreground",
                headerSubtitle: "text-muted-foreground",
                profileSectionTitle: "text-foreground",
                profileSectionTitleText: "text-foreground font-medium",
                profileSectionContent: "text-foreground",
                profileSectionPrimaryButton:
                  "text-primary hover:text-primary/80",
                formFieldLabel: "text-foreground",
                formFieldInput:
                  "bg-background border border-input text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-ring",
                formFieldInputShowPasswordButton: "text-muted-foreground",
                formButtonPrimary:
                  "bg-primary hover:bg-primary/90 text-primary-foreground",
                formButtonReset: "text-muted-foreground hover:text-foreground",
                avatarBox: "border-2 border-primary/20",
                avatarImageActionsUpload: "text-primary hover:text-primary/80",
                avatarImageActionsRemove:
                  "text-destructive-foreground hover:text-destructive-foreground/80",
                pageScrollBox: "p-0",
                page: "gap-6",
                badge: "bg-primary/10 text-primary border-primary/20",
                alertText: "text-foreground",
                accordionTriggerButton:
                  "text-foreground hover:bg-accent/50",
                accordionContent: "text-muted-foreground",
                menuButton: "text-foreground hover:bg-accent/50",
                menuItem: "text-foreground hover:bg-accent/50",
                breadcrumbs: "hidden",
                footer: "hidden",
              },
              layout: {
                shimmer: false,
              },
            }}
            routing="hash"
          />
        </CardPanel>
      </Card>

      {/* Info note */}
      <div className="max-w-3xl mx-auto">
        <Alert variant="info">
          <InfoIcon />
          <AlertDescription>
            Les modifications de votre profil sont automatiquement synchronisees
            avec votre compte Veritas Q. Les changements d&apos;email necessitent
            une verification.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
