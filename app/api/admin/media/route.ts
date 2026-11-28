import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { CatalogAdminError } from "@/lib/catalog/admin";
import { catalogAdminDeps } from "@/lib/catalog/admin-deps";
import { MEDIA_MAX_BYTES, MediaError, mediaUrl, parseMediaKind, prepareProductPhoto } from "@/lib/catalog/media";
import { guardPublicUpload, jsonError } from "@/lib/http/guard";

/**
 * POST /api/admin/media[?kind=photo|signature] — raw JPEG/PNG body (≤ 8 MB) → `{ id, url, width, height }`.
 * photo (default): 600–6000 px per side. signature: 16–6000 px (small, wide signatures). Unknown kind → 422.
 * Staff with `catalog.write` on the own backend only. Same-origin, rate-limited (60 / hour per IP), type sniffed,
 * EXIF/GPS stripped, random id; audited. Attach the id to a product in the product form.
 */
export async function POST(request: Request) {
  const auth = await requireStaff(request, "catalog.write");
  if (!auth.ok) return auth.response;
  const kind = parseMediaKind(new URL(request.url).searchParams.get("kind"));
  if (!kind) return jsonError(422, "invalid_input", "Unknown upload kind.");
  const guard = await guardPublicUpload(request, { name: "admin-media", limit: 60, windowMs: 60 * 60_000, maxBytes: MEDIA_MAX_BYTES });
  if (!guard.ok) return guard.response;
  try {
    const deps = catalogAdminDeps();
    if (!deps?.media) throw new CatalogAdminError("catalog_readonly", "Products are managed in the commerce platform for this store.", 409);
    const item = prepareProductPhoto(guard.bytes, auth.staff.id, new Date(), kind);
    await deps.media.save(item);
    await audit(auth, "catalog.media_upload", item.id, { kind, width: item.width, height: item.height, bytes: item.bytes.length });
    return privateJson({ id: item.id, url: mediaUrl(item.id), width: item.width, height: item.height }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaError) return jsonError(error.code === "bad_size" ? 413 : 422, error.code === "bad_size" ? "payload_too_large" : "invalid_image", error.message);
    return adminError(error);
  }
}
