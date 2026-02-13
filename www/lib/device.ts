/**
 * Device detection utilities for handling platform-specific behavior
 */

/**
 * Detect if the current device is iOS (iPhone, iPad, iPod)
 * @returns true if running on iOS, false otherwise
 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !("MSStream" in window)
  );
}

/**
 * Detect the current browser
 * @returns Browser name or "unknown"
 */
export function getBrowser(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("chrome") && !ua.includes("edg")) return "Chrome";
  if (ua.includes("safari") && !ua.includes("chrome")) return "Safari";
  if (ua.includes("firefox")) return "Firefox";
  if (ua.includes("edg")) return "Edge";
  return "votre navigateur";
}
