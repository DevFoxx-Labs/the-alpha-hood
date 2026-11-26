import { randomBytes } from "node:crypto";
import { type PhotoType, sniffType, stripJpeg, stripPng } from "@/lib/returns/photos";

/**
 * ADM-01 product photos (own backend). Uploaded by staff with `catalog.write`, served publicly from
 * `/api/media/<id>` and resized by the Next.js image pipeline (AVIF/WebP, srcset) — no URL fetching anywhere.
 * Same intake rules as return photos: type sniffed from magic bytes (JPEG / PNG only), EXIF/GPS and text chunks
 * removed, random server-chosen id. Plus: ≤ 8 MB, 600–6000 px per side (no thumbnails, no decompression bombs).
 * Stored once and never changed, so the URL is cached `immutable`.
 */
export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const MEDIA_MIN_PX = 600;
export const MEDIA_MAX_PX = 6000;
export const MEDIA_ID_RE = /^med_[a-f0-9]{32}$/;
export const mediaUrl = (id: string) => `/api/media/${id}`;

export interface MediaItem {
  id: string;
  type: PhotoType;
  width: number;
  height: number;
  bytes: Uint8Array;
  createdAt: string;
  createdBy: string;
  /** Set when the bytes live in object storage (`<local|s3|r2>:<key>`, lib/storage/media.ts); then `bytes` is empty in the row. */
  storageKey?: string | null;
}

export class MediaError extends Error {
  constructor(
    public readonly code: "bad_type" | "bad_size" | "bad_dimensions",
    message: string,
  ) {
    super(message);
    this.name = "MediaError";
  }
}

/** Pixel size from the file header (JPEG SOFn / PNG IHDR). Null if it can't be read. */
export function imageSize(bytes: Uint8Array, type: PhotoType): { width: number; height: number } | null {
  if (type === "image/png") {
    if (bytes.length < 24) return null;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0–SOF15 except DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    if (marker === 0xda || len < 2) return null;
    i += 2 + len;
  }
  return null;
}

export function prepareProductPhoto(raw: Uint8Array, createdBy: string, now = new Date()): MediaItem {
  if (raw.length === 0 || raw.length > MEDIA_MAX_BYTES) throw new MediaError("bad_size", "Photos must be 8 MB or smaller.");
  const type = sniffType(raw);
  if (!type) throw new MediaError("bad_type", "Upload a JPEG or PNG photo.");
  let bytes: Uint8Array;
  try {
    bytes = type === "image/jpeg" ? stripJpeg(raw) : stripPng(raw);
  } catch {
    throw new MediaError("bad_type", "That file isn't a valid JPEG or PNG photo.");
  }
  const size = imageSize(bytes, type);
  if (!size || size.width < MEDIA_MIN_PX || size.height < MEDIA_MIN_PX || size.width > MEDIA_MAX_PX || size.height > MEDIA_MAX_PX) {
    throw new MediaError("bad_dimensions", `Photos must be ${MEDIA_MIN_PX}–${MEDIA_MAX_PX} px on each side.`);
  }
  return { id: `med_${randomBytes(16).toString("hex")}`, type, ...size, bytes, createdAt: now.toISOString(), createdBy };
}

export interface MediaStore {
  save(item: MediaItem): Promise<void>;
  get(id: string): Promise<MediaItem | null>;
  /** Which of these ids exist (used to validate a product's photo list). */
  existing(ids: string[]): Promise<Set<string>>;
}

export function createMemoryMediaStore(): MediaStore {
  const items = new Map<string, MediaItem>();
  return {
    async save(item) {
      items.set(item.id, item);
    },
    async get(id) {
      return MEDIA_ID_RE.test(id) ? (items.get(id) ?? null) : null;
    },
    async existing(ids) {
      return new Set(ids.filter((id) => items.has(id)));
    },
  };
}
