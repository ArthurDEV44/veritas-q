import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mot de passe oublie | Veritas Q",
  description: "Reinitialiser votre mot de passe Veritas Q",
};

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-quantum/20 mb-4">
            <span className="text-quantum font-bold text-3xl">V</span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Mot de passe oublie
          </h1>
          <p className="text-foreground/60 mt-2">
            Reinitialiser votre mot de passe
          </p>
        </div>
        <SignIn
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "bg-surface border border-border shadow-lg rounded-xl",
              headerTitle: "text-foreground",
              headerSubtitle: "text-foreground/60",
              socialButtonsBlockButton:
                "border border-border hover:bg-surface-hover",
              socialButtonsBlockButtonText: "text-foreground",
              dividerLine: "bg-border",
              dividerText: "text-foreground/40",
              formFieldLabel: "text-foreground",
              formFieldInput:
                "bg-background border border-border text-foreground placeholder:text-foreground/40 focus:border-quantum focus:ring-quantum",
              formButtonPrimary:
                "bg-quantum hover:bg-quantum/90 text-background",
              footerActionLink: "text-quantum hover:text-quantum/80",
              identityPreviewText: "text-foreground",
              identityPreviewEditButton: "text-quantum",
              alert: "bg-surface border border-border",
              alertText: "text-foreground",
            },
          }}
          routing="path"
          path="/forgot-password"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/dashboard"
        />
      </div>
    </div>
  );
}
