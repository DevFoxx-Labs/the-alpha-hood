import { customerIdFromRequest } from "@/lib/auth/session";
import { defaultDeps, hostedPayUrl } from "@/lib/checkout/service";
import { clientIp, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";

const ORDER_RE = /^AH[0-9A-Z]{8}$/;

/**
 * GET /api/payments/go/<order> — sends the signed-in owner of a pending order to the gateway's hosted payment page
 * stored on the order (allow-listed https host). Anyone else, or an order that isn't waiting for payment, goes to
 * the order page (which shows its own state / a sign-in prompt). Never redirects to a URL from the request.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/payments/go/[order]">) {
  const { order: number } = await ctx.params;
  const back = (path: string) => Response.redirect(new URL(path, request.url), 303);
  if (!ORDER_RE.test(number)) return jsonError(404, "not_found", "Not found.");
  const rl = await rateLimiter.hit(`pay-go:ip:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const customerId = await customerIdFromRequest(request);
  const order = customerId ? await defaultDeps().orders.get(number) : null;
  if (!order || order.customerId !== customerId) return back(`/checkout/order/${number}`);
  const url = hostedPayUrl(order);
  if (!url) return back(`/checkout/order/${number}`);
  return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
