/**
 * Admin uploads to our own media store (POST /api/admin/media), with real progress, plus the signature "auto-fit".
 * One helper for every admin upload screen (homepage, product photos, categories).
 *
 * - `uploadMedia` uses XMLHttpRequest because `fetch` can't report upload progress. `onProgress` gets 0–100 while the
 *   bytes go up. After 100 the server still checks and stores the file, and the caller shows "Processing…".
 * - `fitSignature` runs in the admin's browser (canvas, no extra package). It turns white or light paper
 *   transparent, trims the empty edges, scales the signature to fit the space it's shown in, and returns a PNG.
 *   The server still checks every upload itself (type sniffing, size limits). This step only prepares the file.
 */

export type UploadKind = "photo" | "signature";
export interface Uploaded {
  id: string;
  url: string;
  width: number;
  height: number;
}

export function uploadMedia(file: Blob, { kind = "photo", onProgress }: { kind?: UploadKind; onProgress?: (pct: number) => void } = {}): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", kind === "photo" ? "/api/admin/media" : `/api/admin/media?kind=${kind}`);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.responseType = "json";
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      const data = xhr.response as (Partial<Uploaded> & { error?: { message?: string } }) | null;
      if (xhr.status >= 200 && xhr.status < 300 && data?.id && data.url) resolve(data as Uploaded);
      else reject(new Error(data?.error?.message ?? `Upload failed (${xhr.status || "network"}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed: check your connection and try again."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Try a smaller file."));
    xhr.send(file);
  });
}

/** Where the signature is shown: up to 220 × 56 CSS px. The fitted file is ~4× that, so it stays sharp on 3× screens. */
export const SIGNATURE_BOX = { width: 960, height: 240 } as const;

/**
 * The pixel work of the auto-fit, on raw RGBA (no DOM, so it can be tested):
 * 1. paper → transparent: alpha follows how dark a pixel is (white 0, ink full), and the existing alpha is kept;
 * 2. bounding box of the ink (alpha > 24), plus a small margin.
 * Returns the cleaned pixels (same buffer) and the crop rectangle, or null if there's no ink at all.
 */
export function cleanSignaturePixels(px: Uint8ClampedArray, width: number, height: number): { x: number; y: number; w: number; h: number } | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      // ≥ 225 is paper (0), ≤ 120 is solid ink (255), smooth in between (keeps anti-aliased edges).
      const ink = lum >= 225 ? 0 : lum <= 120 ? 255 : Math.round(((225 - lum) / 105) * 255);
      const a = Math.min(px[i + 3], ink);
      px[i + 3] = a;
      if (a > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03) + 2;
  const x = Math.max(0, minX - pad), y = Math.max(0, minY - pad);
  return { x, y, w: Math.min(width, maxX + pad + 1) - x, h: Math.min(height, maxY + pad + 1) - y };
}

/** Output size: fit inside SIGNATURE_BOX (never upscale), at least 16 px per side (the server's minimum). */
export function fitSize(w: number, h: number, box: { width: number; height: number } = SIGNATURE_BOX): { width: number; height: number } {
  const k = Math.min(1, box.width / w, box.height / h);
  return { width: Math.max(16, Math.round(w * k)), height: Math.max(16, Math.round(h * k)) };
}

/** Work on at most this many pixels per side, so a huge phone photo of a signature doesn't freeze the tab. */
const WORK_MAX = 2400;

export async function fitSignature(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That file couldn't be read as an image.");
  });
  const k = Math.min(1, WORK_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const ctx = work.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser can't prepare the image. Choose “Use as uploaded”.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const data = ctx.getImageData(0, 0, w, h);
  const crop = cleanSignaturePixels(data.data, w, h);
  if (!crop) throw new Error("No signature found in that image: it looks blank.");
  ctx.putImageData(data, 0, 0);
  const size = fitSize(crop.w, crop.h);
  const out = document.createElement("canvas");
  out.width = size.width;
  out.height = size.height;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("This browser can't prepare the image. Choose “Use as uploaded”.");
  octx.imageSmoothingQuality = "high";
  octx.drawImage(work, crop.x, crop.y, crop.w, crop.h, 0, 0, size.width, size.height);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the image."))), "image/png"));
}
