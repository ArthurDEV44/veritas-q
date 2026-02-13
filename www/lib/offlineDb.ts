import Dexie, { type EntityTable } from 'dexie';

/**
 * Pending capture - media captured offline waiting for sync
 */
export interface PendingCapture {
  id?: number;
  /** UUID v4 generated locally for tracking */
  localId: string;
  /** The captured media file as ArrayBuffer (stored as Blob in IndexedDB) */
  mediaData: ArrayBuffer;
  /** Original filename */
  filename: string;
  /** MIME type of the media */
  mimeType: string;
  /** Media type for API */
  mediaType: 'image' | 'video' | 'audio';
  /** File size in bytes */
  fileSize: number;
  /** Local hash computed from the media (SHA-256) */
  localHash: string;
  /** Thumbnail as base64 (for images/videos) */
  thumbnail?: string;
  /** Capture timestamp */
  capturedAt: number;
  /** GPS coordinates if available */
  location?: {
    lat: number;
    lng: number;
    altitude?: number;
  };
  /** Device attestation JSON if available */
  deviceAttestation?: string;
  /** Sync status */
  status: 'pending' | 'syncing' | 'failed';
  /** Number of sync attempts */
  syncAttempts: number;
  /** Last sync attempt timestamp */
  lastSyncAttempt?: number;
  /** Error message if failed */
  errorMessage?: string;
  /** Clerk user ID (captured when offline but authenticated) */
  userId?: string;
}

/**
 * Synced seal - successfully synced seals stored locally for quick access
 */
export interface SyncedSeal {
  id?: number;
  /** Seal ID from the server */
  sealId: string;
  /** Local ID that was synced (links to what was captured offline) */
  localId: string;
  /** Seal timestamp from server */
  timestamp: number;
  /** Trust tier */
  trustTier: string;
  /** Whether device was attested */
  hasDeviceAttestation: boolean;
  /** Thumbnail for quick display */
  thumbnail?: string;
  /** Sync completion timestamp */
  syncedAt: number;
}

/**
 * Offline database using Dexie.js
 * Stores pending captures and synced seal references
 */
class OfflineDatabase extends Dexie {
  pendingCaptures!: EntityTable<PendingCapture, 'id'>;
  syncedSeals!: EntityTable<SyncedSeal, 'id'>;

  constructor() {
    super('VeritasOfflineDb');

    this.version(1).stores({
      // id is auto-increment, indexes on status and capturedAt for querying
      pendingCaptures: '++id, localId, status, capturedAt, userId',
      // sealId is the server ID, localId links to original capture
      syncedSeals: '++id, sealId, localId, syncedAt',
    });
  }
}

// Singleton database instance
export const offlineDb = new OfflineDatabase();

/**
 * Compute SHA-256 hash of an ArrayBuffer
 */
export async function computeHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a UUID v4 for local tracking
 */
export function generateLocalId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a thumbnail from an image blob
 * Returns base64 encoded JPEG
 */
export async function generateThumbnail(
  blob: Blob,
  maxSize: number = 200
): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (blob.size > 10 * 1024 * 1024) return resolve(undefined); // Skip thumbnails for files > 10MB

    // Only for images
    if (!blob.type.startsWith('image/')) {
      resolve(undefined);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate dimensions
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      // Create canvas and draw
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(undefined);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Get base64 JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };

    img.src = url;
  });
}

/**
 * Generate a thumbnail from a video blob (first frame)
 */
export async function generateVideoThumbnail(
  blob: Blob,
  maxSize: number = 200
): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (blob.size > 10 * 1024 * 1024) return resolve(undefined); // Skip thumbnails for files > 10MB

    if (!blob.type.startsWith('video/')) {
      resolve(undefined);
      return;
    }

    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);

    video.onloadeddata = () => {
      // Seek to first frame
      video.currentTime = 0;
    };

    video.onseeked = () => {
      URL.revokeObjectURL(url);

      // Calculate dimensions
      let width = video.videoWidth;
      let height = video.videoHeight;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      // Create canvas and draw
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(undefined);
        return;
      }

      ctx.drawImage(video, 0, 0, width, height);

      // Get base64 JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      resolve(dataUrl);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };

    video.src = url;
    video.load();
  });
}
