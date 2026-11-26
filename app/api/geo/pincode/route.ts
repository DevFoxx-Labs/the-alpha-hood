import { requireCustomer } from "@/lib/http/commerce-http";
import { clientIp, jsonError, PRIVATE_NO_STORE } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { locatePincode } from "@/lib/geo/geocode";

/** GET /api/geo/pincode?pincode=411045 — where to centre the map for a pincode (signed-in, rate-limited). */
export async function GET(request: Request) {
  const rl = await rateLimiter.hit(`geo:ip:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many lookups. Wait a moment.");
  const auth = await requireCustomer(request);
  if (!auth.ok) return auth.response;
  const pincode = new URL(request.url).searchParams.get("pincode") ?? "";
  if (!/^[1-9]\d{5}$/.test(pincode)) return jsonError(422, "invalid_input", "Enter a valid 6-digit pincode.");
  return Response.json({ position: await locatePincode(pincode) }, { headers: PRIVATE_NO_STORE });
}
