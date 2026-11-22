import { randomBytes } from "node:crypto";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * Return photos (RET-01: damaged / wrong items). Private files: owner + staff only, never public.
 * - type is sniffed from magic bytes (JPEG / PNG only — the client's Content-Type is not trusted);
 * - size ≤ 5 MB; server-chosen random id; the client file name is never used;
 * - JPEG APP1 (EXIF, incl. GPS) / PNG text+eXIf chunks are removed before storing;
 * - served with nosniff, a sandbox CSP and `private, no-store` (route).
 * Production needs a private bucket + short-lived signed URLs (docs/known-gaps.md).
 */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_ID_RE = /^img_[a-f0-9]{32}$/;

export type PhotoType = "image/jpeg" | "image/png";

export function sniffType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  return null;
}

/** Drops JPEG APPn (n=1..15) and COM segments — EXIF/XMP/GPS live there. Throws on malformed input. */
export function stripJpeg(bytes: Uint8Array): Uint8Array {
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error("Malformed JPEG");
    const marker = bytes[i + 1];
    if (marker === 0xda) {
      // Start of scan: the rest is entropy-coded image data.
      for (let j = i; j < bytes.length; j++) out.push(bytes[j]);
      return Uint8Array.from(out);
    }
    if (marker === 0xd9) {
      out.push(0xff, 0xd9);
      return Uint8Array.from(out);
    }
    if (i + 3 >= bytes.length) throw new Error("Malformed JPEG");
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2 || i + 2 + len > bytes.length) throw new Error("Malformed JPEG");
    const isAppOrComment = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isAppOrComment) for (let j = i; j < i + 2 + len; j++) out.push(bytes[j]);
    i += 2 + len;
  }
  throw new Error("Malformed JPEG");
}

/** Drops PNG ancillary text / EXIF / time chunks. Throws on malformed input. */
export function stripPng(bytes: Uint8Array): Uint8Array {
  const drop = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let i = 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (i + 12 <= bytes.length) {
    const len = view.getUint32(i);
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    const end = i + 12 + len;
    if (end > bytes.length) throw new Error("Malformed PNG");
    if (!drop.has(type)) parts.push(bytes.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

interface StoredPhoto {
  id: string;
  ownerId: string;
  type: PhotoType;
  bytes: Uint8Array;
  createdAt: number;
  attachedTo: string | null;
}

export interface PhotoStore {
  save(ownerId: string, bytes: Uint8Array, now?: number): Promise<{ id: string; type: PhotoType }>;
  /** Owner-scoped read: someone else's id behaves exactly like a missing one. */
  get(ownerId: string, id: string): Promise<StoredPhoto | null>;
  attach(ownerId: string, ids: string[], returnNumber: string): Promise<boolean>;
  countRecent(ownerId: string, sinceMs: number, now?: number): Promise<number>;
}

export function createMemoryPhotoStore(): PhotoStore {
  const photos = new Map<string, StoredPhoto>();
  return {
    async save(ownerId, raw, now = Date.now()) {
      if (raw.length === 0 || raw.length > MAX_PHOTO_BYTES) throw new Error("bad_size");
      const type = sniffType(raw);
      if (!type) throw new Error("bad_type");
      const bytes = type === "image/jpeg" ? stripJpeg(raw) : stripPng(raw);
      const id = `img_${randomBytes(16).toString("hex")}`;
      photos.set(id, { id, ownerId, type, bytes, createdAt: now, attachedTo: null });
      return { id, type };
    },
    async get(ownerId, id) {
      if (!PHOTO_ID_RE.test(id)) return null;
      const p = photos.get(id);
      return p && p.ownerId === ownerId ? p : null;
    },
    async attach(ownerId, ids, returnNumber) {
      const found = ids.map((id) => (PHOTO_ID_RE.test(id) ? photos.get(id) : undefined));
      if (found.some((p) => !p || p.ownerId !== ownerId || (p.attachedTo && p.attachedTo !== returnNumber))) return false;
      for (const p of found) p!.attachedTo = returnNumber;
      return true;
    },
    async countRecent(ownerId, sinceMs, now = Date.now()) {
      let n = 0;
      for (const p of photos.values()) if (p.ownerId === ownerId && p.createdAt > now - sinceMs) n++;
      return n;
    },
  };
}

export function resolvePhotos(env: Env = process.env): PhotoStore {
  if (mockDataAllowed(env)) return devSingleton("return_photos", createMemoryPhotoStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Photo storage");
  };
  return { save: fail, get: fail, attach: fail, countRecent: fail };
}
