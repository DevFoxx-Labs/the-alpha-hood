import { guardPublicUpload, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { MAX_PHOTO_BYTES, resolvePhotos } from "@/lib/returns/photos";

/**
 * POST /api/returns/photos — raw JPEG/PNG body (≤ 5 MB) → `{ id }`. Signed-in customers only, 20 uploads per
 * day each plus a per-IP limit. Type is verified by magic bytes; metadata (EXIF/GPS) is stripped.
 */
export async function POST(request: Request) {
  const auth = requireAccount(request);
  if (!auth.ok) return auth.response;
  const guard = await guardPublicUpload(request, { name: "return-photo", limit: 20, windowMs: 60 * 60_000, maxBytes: MAX_PHOTO_BYTES });
  if (!guard.ok) return guard.response;
  try {
    const photos = resolvePhotos();
    if ((await photos.countRecent(auth.customerId, 86_400_000)) >= 20) return jsonError(429, "rate_limited", "Upload limit reached for today.");
    const saved = await photos.save(auth.customerId, guard.bytes);
    return privateJson({ id: saved.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === "bad_type" || error.message.startsWith("Malformed"))) {
      return jsonError(422, "invalid_image", "That file isn't a valid JPEG or PNG photo.");
    }
    if (error instanceof Error && error.message === "bad_size") return jsonError(413, "payload_too_large", "Photos must be 5 MB or smaller.");
    return commerceErrorResponse(error);
  }
}
