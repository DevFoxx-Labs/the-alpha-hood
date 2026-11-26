import { requireCustomer } from "@/lib/http/commerce-http";
import { clientIp, jsonError, PRIVATE_NO_STORE } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";
import { inIndia, reverseGeocode } from "@/lib/geo/geocode";

/**
 * GET /api/geo/reverse?lat=&lng= — address suggestions for a map pin, for a signed-in customer adding an address.
 * Signed-in only and rate-limited (per customer and per IP), so it can't be used as a free geocoding service.
 * The pin is used for this one lookup and not stored here (it is saved only if the customer saves the address).
 */
export async function GET(request: Request) {
  const ip = clientIp(request);
  const rl = await rateLimiter.hit(`geo:ip:${ip}`, 30, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many lookups. Wait a moment.");
  const auth = await requireCustomer(request);
  if (!auth.ok) return auth.response;
  const daily = await rateLimiter.hit(`geo:cus:${auth.customerId}`, 200, 86_400_000);
  if (!daily.ok) return jsonError(429, "rate_limited", "Too many lookups today.");
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  if (!inIndia(lat, lng)) return jsonError(422, "invalid_input", "We only deliver in India — place the pin on your address.");
  const suggestion = await reverseGeocode(lat, lng);
  return Response.json({ suggestion }, { headers: PRIVATE_NO_STORE });
}
