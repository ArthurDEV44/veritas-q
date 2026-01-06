import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mutable state object
const mockState = {
  isSupported: true,
  isSubscribed: false,
  permission: "default" as NotificationPermission | "default",
  isLoading: false,
  error: null as string | null,
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  requestPermission: vi.fn(),
};

// Mock usePushNotifications
vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => mockState,
}));

// Import after mocks
import { NotificationSettings } from "@/components/NotificationSettings";

describe("NotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.subscribe = vi.fn().mockResolvedValue(true);
    mockState.unsubscribe = vi.fn().mockResolvedValue(true);
    mockState.requestPermission = vi.fn().mockResolvedValue("granted");
    mockState.isSupported = true;
    mockState.isSubscribed = false;
    mockState.permission = "default";
    mockState.isLoading = false;
    mockState.error = null;
  });

  it("should render notification settings", () => {
    render(<NotificationSettings />);
    expect(screen.getByText("Notifications push")).toBeInTheDocument();
    expect(screen.getByText("Activez pour être notifié")).toBeInTheDocument();
  });

  it("should show Activer button when not subscribed", () => {
    render(<NotificationSettings />);
    expect(screen.getByText("Activer")).toBeInTheDocument();
  });

  it("should call subscribe when Activer clicked", async () => {
    render(<NotificationSettings />);

    const activerButton = screen.getByText("Activer");
    fireEvent.click(activerButton);

    await waitFor(() => {
      expect(mockState.subscribe).toHaveBeenCalled();
    });
  });

  it("should show not supported message when unsupported", () => {
    mockState.isSupported = false;
    render(<NotificationSettings />);

    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(
      screen.getByText("Non disponible sur ce navigateur")
    ).toBeInTheDocument();
  });

  it("should show blocked message when permission denied", () => {
    mockState.permission = "denied";
    render(<NotificationSettings />);

    expect(screen.getByText("Notifications bloquées")).toBeInTheDocument();
  });

  it("should show Désactiver button when subscribed", () => {
    mockState.isSubscribed = true;
    mockState.permission = "granted";
    render(<NotificationSettings />);

    expect(screen.getByText("Désactiver")).toBeInTheDocument();
    expect(screen.getByText("Vous recevrez des alertes")).toBeInTheDocument();
  });

  it("should show success message when subscribed", () => {
    mockState.isSubscribed = true;
    mockState.permission = "granted";
    render(<NotificationSettings />);

    expect(screen.getByText("Notifications activées")).toBeInTheDocument();
  });

  it("should call unsubscribe when Désactiver clicked", async () => {
    mockState.isSubscribed = true;
    mockState.permission = "granted";
    render(<NotificationSettings />);

    const desactiverButton = screen.getByText("Désactiver");
    fireEvent.click(desactiverButton);

    await waitFor(() => {
      expect(mockState.unsubscribe).toHaveBeenCalled();
    });
  });

  it("should show error message", () => {
    mockState.error = "Une erreur est survenue";
    render(<NotificationSettings />);

    expect(screen.getByText("Une erreur est survenue")).toBeInTheDocument();
  });

  it("should disable button when loading", () => {
    mockState.isLoading = true;
    render(<NotificationSettings />);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });
});
