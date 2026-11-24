import { resolveAlerts } from "@/lib/alerts/service";
import { commerce } from "@/lib/commerce";
import { dbStores } from "@/lib/db";
import { runSweep } from "@/lib/flows/service";
import { cronAuthorised } from "@/lib/http/cron";
import { jsonError } from "@/lib/http/guard";
import { commerceErrorResponse } from "@/lib/http/commerce-http";
import { resolveOrders } from "@/lib/orders/store";

/**
 * GET /api/cron/sweep — scheduled flows (alerts, review requests, abandoned checkout) and the retention clean-up
 * (lib/db/retention.ts: expired sessions, OTPs, tickets, rate windows, locks, old holds, idle bags, orphan
 * photos). Cron secret only. The response carries counts only — no ids or personal data.
 */
export async function GET(request: Request) {
  if (!cronAuthorised(request)) return jsonError(401, "unauthorised", "Not allowed.");
  try {
    const result = await runSweep({ orders: resolveOrders(), commerce, alerts: resolveAlerts() });
    const purged = (await dbStores()?.maintenance.purgeExpired()) ?? {};
    return Response.json({ ok: true, ...result, purged }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
