import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

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

// Mock useOfflineSync (used by ConnectivityIndicator, not by ConnectivityStatus)
vi.mock("@/hooks/useOfflineSync", () => ({
  useOfflineSync: () => ({
    pendingCount: 0,
    isSyncing: false,
    isOffline: false,
    lastSyncAt: null,
    lastSyncError: null,
    syncAll: vi.fn(),
    retryCapture: vi.fn(),
    clearAll: vi.fn(),
  }),
}));

// Import after mocks
import ConnectivityStatus from "@/components/ConnectivityStatus";

describe("ConnectivityStatus", () => {
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
    render(<ConnectivityStatus />);
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.queryByText(/Hors connexion/)).not.toBeInTheDocument();
  });

  it("should show offline alert when offline", async () => {
    mockState.isOffline = true;
    render(<ConnectivityStatus />);
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.getByText("Hors connexion")).toBeInTheDocument();
  });

  it("should show update alert when update available", async () => {
    mockState.updateAvailable = true;
    render(<ConnectivityStatus />);
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.getByText(/Nouvelle version disponible/)).toBeInTheDocument();
    expect(screen.getByText("Mettre a jour")).toBeInTheDocument();
  });

  it("should call applyUpdate when update button clicked", async () => {
    mockState.updateAvailable = true;
    render(<ConnectivityStatus />);
    await act(async () => {
      vi.runAllTimers();
    });

    const updateButton = screen.getByText("Mettre a jour");
    fireEvent.click(updateButton);

    expect(mockState.applyUpdate).toHaveBeenCalled();
  });

  it("should show offline alert when offline and update available", async () => {
    mockState.isOffline = true;
    mockState.updateAvailable = true;
    render(<ConnectivityStatus />);
    await act(async () => {
      vi.runAllTimers();
    });

    // Offline takes priority, update is hidden when offline
    expect(screen.getByText("Hors connexion")).toBeInTheDocument();
    expect(screen.queryByText(/Nouvelle version disponible/)).not.toBeInTheDocument();
  });
});
