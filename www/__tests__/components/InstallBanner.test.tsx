import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

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
    expect(screen.getByText(/Sur l'ecran d'accueil/)).toBeInTheDocument();
  });

  it("should auto-dismiss after 10 seconds without interaction", async () => {
    render(<InstallBanner />);
    // Mount the component
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByText("Installer Veritas Q")).toBeInTheDocument();

    // Advance past auto-dismiss timeout
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.queryByText("Installer Veritas Q")).not.toBeInTheDocument();
  });

  it("should not auto-dismiss if user interacts", async () => {
    render(<InstallBanner />);
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    const banner = screen.getByText("Installer Veritas Q").closest("[class*='fixed']")!;
    await act(async () => {
      fireEvent.pointerDown(banner);
    });

    // Advance past auto-dismiss timeout
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    // Should still be visible because user interacted
    expect(screen.getByText("Installer Veritas Q")).toBeInTheDocument();
  });

  it("should dismiss when close button is clicked", async () => {
    render(<InstallBanner />);
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    const closeButton = screen.getByLabelText("Fermer");
    await act(async () => {
      fireEvent.click(closeButton);
    });

    expect(screen.queryByText("Installer Veritas Q")).not.toBeInTheDocument();
    expect(mockState.promptInstall).toHaveBeenCalled();
  });
});
