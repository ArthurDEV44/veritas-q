/**
 * Utility functions for camera capture
 */

/**
 * Get supported video MIME type for MediaRecorder
 */
export function getSupportedMimeType(): string {
  const types = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "video/webm"; // fallback
}

/**
 * Format seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Get localized error message
 */
export function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Une erreur inattendue s'est produite";
  }

  const message = error.message.toLowerCase();

  if (message.includes("permission") || message.includes("notallowed")) {
    return "Accès à la caméra refusé. Veuillez autoriser l'accès dans les paramètres de votre navigateur.";
  }
  if (message.includes("notfound") || message.includes("not found")) {
    return "Aucune caméra détectée sur cet appareil.";
  }
  if (message.includes("notreadable") || message.includes("not readable")) {
    return "La caméra est utilisée par une autre application.";
  }
  if (message.includes("overconstrained")) {
    return "La caméra ne supporte pas la résolution demandée.";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "Erreur réseau. Vérifiez votre connexion internet.";
  }

  return error.message;
}

// Video capture constants
export const MAX_VIDEO_DURATION_SECONDS = 60; // 60 seconds for Free tier
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
