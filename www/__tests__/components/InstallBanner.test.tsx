import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div data-testid="motion-div" {...props}>
        {children}
      </div>
    ),
    button: ({
      children,
      onClick,
      ...props
    }: React.PropsWithChildren<{ onClick?: () => void }>) => (
      <button data-testid="motion-button" onClick={onClick} {...props}>
        {children}
      </button>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Mutable state object
const mockState = {
  isInstallable: true,
  isInstalled: false,
  isIOS: false,
  promptInstall: vi.fn(),
};

// Mock useInstallPrompt
vi.mock("@/hooks/useInstallPrompt", () => ({
  useInstallPrompt: () => mockState,
}));

// Import after mocks
import InstallBanner from "@/components/InstallBanner";

describe("InstallBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockState.promptInstall = vi.fn().mockResolvedValue(true);
    mockState.isInstallable = true;
    mockState.isInstalled = false;
    mockState.isIOS = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render install banner when installable", async () => {
    render(<InstallBanner />);
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.getByText("Installer Veritas Q")).toBeInTheDocument();
  });

  it("should show install button for non-iOS", async () => {
    render(<InstallBanner />);
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.getByText("Installer")).toBeInTheDocument();
  });

  it("should have close button", async () => {
    render(<InstallBanner />);
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.getByLabelText("Fermer")).toBeInTheDocument();
  });

  it("should call promptInstall when install button clicked", async () => {
    render(<InstallBanner />);
    await act(async () => {
      vi.runAllTimers();
    });

    const installButton = screen.getByText("Installer");
    await act(async () => {
      fireEvent.click(installButton);
    });

    expect(mockState.promptInstall).toHaveBeenCalled();
  });

  it("should not render when already installed", async () => {
    mockState.isInstalled = true;
    render(<InstallBanner />);
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.queryByText("Installer Veritas Q")).not.toBeInTheDocument();
  });

  it("should not render when not installable", async () => {
    mockState.isInstallable = false;
    mockState.isIOS = false;
    render(<InstallBanner />);
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.queryByText("Installer Veritas Q")).not.toBeInTheDocument();
  });

  it("should show iOS instructions on iOS", async () => {
    mockState.isInstallable = true;
    mockState.isIOS = true;
    render(<InstallBanner />);
    await act(async () => {
      vi.runAllTimers();
    });
    // The component uses HTML entities in JSX which render as proper quotes
    expect(screen.getByText(/Sur l'écran d'accueil/)).toBeInTheDocument();
    expect(screen.getByText("Safari uniquement")).toBeInTheDocument();
  });
});
