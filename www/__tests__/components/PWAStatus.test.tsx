import { describe, it, expect, vi, beforeEach } from "vitest";
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
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Mutable state object
const mockState = {
  isSupported: true,
  isRegistered: true,
  isOffline: false,
  registration: null,
  updateAvailable: false,
  applyUpdate: vi.fn(),
};

// Mock useServiceWorker
vi.mock("@/hooks/useServiceWorker", () => ({
  useServiceWorker: () => mockState,
}));

// Import after mocks
import PWAStatus from "@/components/PWAStatus";

describe("PWAStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockState.isSupported = true;
    mockState.isRegistered = true;
    mockState.isOffline = false;
    mockState.registration = null;
    mockState.updateAvailable = false;
    mockState.applyUpdate = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should not render when online and no update", async () => {
    render(<PWAStatus />);
    await act(async () => {
      vi.runAllTimers();
    });
    // After mount, still shouldn't show anything
    expect(screen.queryByText(/Hors connexion/)).not.toBeInTheDocument();
  });

  it("should show offline banner when offline", async () => {
    mockState.isOffline = true;
    render(<PWAStatus />);
    await act(async () => {
      vi.runAllTimers();
    });
    expect(
      screen.getByText(/Hors connexion - Fonctionnalités limitées/)
    ).toBeInTheDocument();
  });

  it("should show update banner when update available", async () => {
    mockState.updateAvailable = true;
    render(<PWAStatus />);
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.getByText(/Nouvelle version disponible/)).toBeInTheDocument();
    expect(screen.getByText("Mettre à jour")).toBeInTheDocument();
  });

  it("should call applyUpdate when update button clicked", async () => {
    mockState.updateAvailable = true;
    render(<PWAStatus />);
    await act(async () => {
      vi.runAllTimers();
    });

    const updateButton = screen.getByText("Mettre à jour");
    fireEvent.click(updateButton);

    expect(mockState.applyUpdate).toHaveBeenCalled();
  });

  it("should show both banners when offline and update available", async () => {
    mockState.isOffline = true;
    mockState.updateAvailable = true;
    render(<PWAStatus />);
    await act(async () => {
      vi.runAllTimers();
    });

    expect(
      screen.getByText(/Hors connexion - Fonctionnalités limitées/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Nouvelle version disponible/)).toBeInTheDocument();
  });
});
