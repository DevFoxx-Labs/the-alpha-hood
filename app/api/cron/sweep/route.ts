import { resolveAlerts } from "@/lib/alerts/service";
import { commerce } from "@/lib/commerce";
import { runSweep } from "@/lib/flows/service";
import { cronAuthorised } from "@/lib/http/cron";
import { jsonError } from "@/lib/http/guard";
import { commerceErrorResponse } from "@/lib/http/commerce-http";
import { resolveOrders } from "@/lib/orders/store";

/** GET /api/cron/sweep — scheduled flows (alerts, review requests, abandoned checkout). Cron secret only. */
export async function GET(request: Request) {
  if (!cronAuthorised(request)) return jsonError(401, "unauthorised", "Not allowed.");
  try {
    const result = await runSweep({ orders: resolveOrders(), commerce, alerts: resolveAlerts() });
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
