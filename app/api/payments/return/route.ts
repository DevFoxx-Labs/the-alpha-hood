import { defaultDeps, syncAttempt } from "@/lib/checkout/service";
import { clientIp, jsonError } from "@/lib/http/guard";
import { rateLimiter } from "@/lib/http/rate-limit";

const ORDER_RE = /^AH[0-9A-Z]{8}$/;

/**
 * GET /api/payments/return?order=<number>&… — where the gateway sends the shopper back after paying. The query
 * string from the gateway is NOT trusted (it could be forged or replayed): we ask the gateway's API for the latest
 * attempt's status and apply it like a webhook (idempotent), then show the order page. The signed webhook is the
 * primary confirmation; this only makes the confirmation instant when the shopper returns.
 */
export async function GET(request: Request) {
  const number = new URL(request.url).searchParams.get("order") ?? "";
  if (!ORDER_RE.test(number)) return jsonError(404, "not_found", "Not found.");
  const rl = await rateLimiter.hit(`pay-return:ip:${clientIp(request)}`, 30, 60_000);
  if (rl.ok) {
    try {
      const deps = defaultDeps();
      const order = await deps.orders.get(number);
      const attempt = order?.status === "pending_payment" ? order.attempts.at(-1) : undefined;
      if (attempt?.status === "pending" && attempt.payUrl) await syncAttempt(deps, number, attempt.paymentId);
    } catch {
      // Gateway unreachable: the webhook / reconciliation will confirm it; the order page keeps polling.
    }
  }
  return Response.redirect(new URL(`/checkout/order/${number}`, request.url), 303);
}
