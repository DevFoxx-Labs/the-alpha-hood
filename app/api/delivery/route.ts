import { clientIp, errorResponse, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { PINCODE_RE, shipping } from "@/lib/shipping";

/**
 * PDP-05 GET /api/delivery?pincode=411045 → serviceability, delivery date, express and COD. The pincode is
 * used only for this lookup — not stored or logged on the server.
 */
export async function GET(request: Request) {
  const rl = await rateLimiter.hit(`delivery:ip:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.", { "Retry-After": String(rl.retryAfterSeconds) });

  const pincode = new URL(request.url).searchParams.get("pincode") ?? "";
  if (!PINCODE_RE.test(pincode)) return jsonError(422, "invalid_input", "Enter a valid 6-digit pincode.");
  try {
    const promise = await shipping.check(pincode);
    return Response.json(promise, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (error) {
    return errorResponse(error);
  }
}
