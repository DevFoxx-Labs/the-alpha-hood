import { createAlert, resolveAlerts } from "@/lib/alerts/service";
import { commerce } from "@/lib/commerce";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { asObject, rejectUnknownFields } from "@/lib/validation";

const PRODUCT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SIZE_RE = /^[A-Za-z0-9 ]{1,8}$/;

/** GET /api/account/alerts — the customer's own alerts (PDP-10). */
export async function GET(request: Request) {
  const auth = requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const alerts = await resolveAlerts().listByCustomer(auth.customerId);
    return privateJson({ alerts: alerts.map((a) => ({ id: a.id, productId: a.productId, size: a.size, kind: a.kind, createdAt: a.createdAt, firedAt: a.firedAt })) });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

/** POST `{ productId, kind: "back_in_stock" | "price_drop", size? }` — signed in, same-origin, rate-limited. */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "alerts", limit: 20, windowMs: 10 * 60_000, maxBytes: 256 });
  if (!guard.ok) return guard.response;
  const auth = requireAccount(request);
  if (!auth.ok) return auth.response;
  if (!rateLimiter.hit(`alerts:customer:${auth.customerId}`, 40, 86_400_000).ok) return jsonError(429, "rate_limited", "Too many alerts today.");
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["productId", "kind", "size"]);
    if (typeof input.productId !== "string" || !PRODUCT_ID_RE.test(input.productId)) return jsonError(422, "invalid_input", "Invalid product.");
    if (input.kind !== "back_in_stock" && input.kind !== "price_drop") return jsonError(422, "invalid_input", "Invalid alert.");
    const size = input.size === undefined || input.size === null ? null : typeof input.size === "string" && SIZE_RE.test(input.size) ? input.size : undefined;
    if (size === undefined) return jsonError(422, "invalid_input", "Invalid size.");
    const alert = await createAlert({ commerce, alerts: resolveAlerts() }, auth.customerId, { productId: input.productId, kind: input.kind, size });
    return privateJson({ alert: { id: alert.id, kind: alert.kind, productId: alert.productId, size: alert.size } }, { status: 201 });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
