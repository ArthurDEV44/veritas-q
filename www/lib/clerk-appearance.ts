import type { Appearance } from "@clerk/types";

/**
 * Shared Clerk appearance configuration — Quantum Noir theme.
 *
 * Uses CSS custom properties from the design token system (globals.css)
 * so Clerk components stay in sync with the CossUI-based UI.
 *
 * `variables` handles Clerk-internal element theming.
 * `elements` provides targeted className overrides for finer control.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "#00ff88",
    colorBackground: "#0c0c12",
    colorInputBackground: "#06060a",
    colorInputText: "#e8e8ef",
    colorText: "#e8e8ef",
    colorTextSecondary: "#6b6b80",
    colorDanger: "#ef4444",
    colorSuccess: "#22c55e",
    colorWarning: "#f59e0b",
    colorTextOnPrimaryBackground: "#06060a",
    colorNeutral: "#6b6b80",
    borderRadius: "0.625rem",
    fontFamily: "var(--font-geist-sans), 'Geist', system-ui, sans-serif",
  },
  elements: {
    rootBox: "mx-auto w-full",
    card: "!bg-[var(--card)] !border-[var(--border)] shadow-xl shadow-black/20",
    headerTitle: "!text-[var(--foreground)] font-semibold",
    headerSubtitle: "!text-[var(--muted-foreground)]",
    socialButtonsBlockButton:
      "!border-[var(--border)] !bg-[var(--surface-2)] hover:!bg-[var(--surface-3)] transition-colors duration-150",
    socialButtonsBlockButtonText: "!text-[var(--foreground)]",
    socialButtonsBlockButtonArrow: "!text-[var(--muted-foreground)]",
    dividerLine: "!bg-[var(--border)]",
    dividerText: "!text-[var(--muted-foreground)]",
    formFieldLabel: "!text-[var(--foreground)]",
    formFieldInput:
      "!bg-[var(--background)] !border-[var(--border)] !text-[var(--foreground)] !placeholder-[var(--muted-foreground)] focus:!border-[var(--primary)] focus:!ring-1 focus:!ring-[var(--ring)] transition-colors duration-150",
    formFieldHintText: "!text-[var(--muted-foreground)]",
    formFieldSuccessText: "!text-[var(--success)]",
    formFieldErrorText: "!text-[var(--destructive-foreground)]",
    formButtonPrimary:
      "!bg-[var(--primary)] !text-[var(--primary-foreground)] hover:!brightness-90 font-medium shadow-sm transition-all duration-150",
    formButtonReset: "!text-[var(--primary)]",
    footerActionLink:
      "!text-[var(--primary)] hover:!brightness-90 transition-colors duration-150",
    footerActionText: "!text-[var(--muted-foreground)]",
    identityPreviewText: "!text-[var(--foreground)]",
    identityPreviewEditButton: "!text-[var(--primary)]",
    identityPreviewEditButtonIcon: "!text-[var(--primary)]",
    formFieldAction: "!text-[var(--primary)]",
    otpCodeFieldInput:
      "!border-[var(--border)] !bg-[var(--background)] !text-[var(--foreground)]",
    alert: "!bg-[var(--surface-2)] !border-[var(--border)]",
    alertText: "!text-[var(--foreground)]",
    formResendCodeLink: "!text-[var(--primary)]",
    footer: "!bg-transparent",
    headerBackRow: "!text-[var(--muted-foreground)]",
    headerBackLink:
      "!text-[var(--muted-foreground)] hover:!text-[var(--foreground)]",
    headerBackIcon: "!text-[var(--muted-foreground)]",
    selectButton:
      "!bg-[var(--background)] !border-[var(--border)] !text-[var(--foreground)]",
    selectOptionsContainer:
      "!bg-[var(--popover)] !border-[var(--border)]",
    selectOption:
      "!text-[var(--foreground)] hover:!bg-[var(--surface-3)]",
    badge: "!bg-[var(--surface-2)] !text-[var(--foreground)]",
    tagInputContainer:
      "!bg-[var(--background)] !border-[var(--border)]",
    tagPillContainer: "!bg-[var(--surface-3)] !text-[var(--foreground)]",
  },
};
