import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

describe("useInstallPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset matchMedia mock
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("should initialize with default values", () => {
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.isInstallable).toBe(false);
    expect(result.current.isInstalled).toBe(false);
    expect(typeof result.current.promptInstall).toBe("function");
  });

  it("should detect iOS devices", async () => {
    Object.defineProperty(navigator, "userAgent", {
      writable: true,
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    });

    const { result } = renderHook(() => useInstallPrompt());

    await waitFor(() => {
      expect(result.current.isIOS).toBe(true);
    });
  });

  it("should detect Android devices", async () => {
    Object.defineProperty(navigator, "userAgent", {
      writable: true,
      configurable: true,
      value: "Mozilla/5.0 (Linux; Android 13)",
    });

    const { result } = renderHook(() => useInstallPrompt());

    await waitFor(() => {
      expect(result.current.isIOS).toBe(false);
    });
  });

  it("should detect standalone mode as installed", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const { result } = renderHook(() => useInstallPrompt());

    await waitFor(() => {
      expect(result.current.isInstalled).toBe(true);
    });
  });

  it("should capture beforeinstallprompt event", async () => {
    const { result } = renderHook(() => useInstallPrompt());

    const mockPrompt = vi.fn();
    const mockEvent = {
      preventDefault: vi.fn(),
      prompt: mockPrompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    };

    act(() => {
      window.dispatchEvent(
        Object.assign(new Event("beforeinstallprompt"), mockEvent)
      );
    });

    await waitFor(() => {
      expect(result.current.isInstallable).toBe(true);
    });
  });

  it("should handle appinstalled event", async () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    await waitFor(() => {
      expect(result.current.isInstalled).toBe(true);
    });
  });

  it("should return false when no prompt available", async () => {
    const { result } = renderHook(() => useInstallPrompt());

    let success: boolean;
    await act(async () => {
      success = await result.current.promptInstall();
    });

    expect(success!).toBe(false);
  });
});
