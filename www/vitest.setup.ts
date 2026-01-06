import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
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

// Mock navigator.serviceWorker
Object.defineProperty(navigator, "serviceWorker", {
  writable: true,
  value: {
    register: vi.fn().mockResolvedValue({
      installing: null,
      waiting: null,
      active: null,
      addEventListener: vi.fn(),
    }),
    ready: Promise.resolve({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn(),
      },
    }),
    controller: null,
  },
});

// Mock Notification
Object.defineProperty(window, "Notification", {
  writable: true,
  value: {
    permission: "default" as NotificationPermission,
    requestPermission: vi.fn().mockResolvedValue("granted"),
  },
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});
