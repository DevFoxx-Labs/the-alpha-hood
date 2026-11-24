import { resolveAlerts } from "@/lib/alerts/service";
import { commerce } from "@/lib/commerce";
import { dbStores } from "@/lib/db";
import { defaultDeps, reconcilePending } from "@/lib/checkout/service";
import { resolveCustomers } from "@/lib/customers/store";
import { runSweep } from "@/lib/flows/service";
import { deliverOutbox } from "@/lib/notify/delivery";
import { resolveOutbox } from "@/lib/notify/outbox";
import { resolveSms } from "@/lib/notify/sms";
import { cronAuthorised } from "@/lib/http/cron";
import { jsonError } from "@/lib/http/guard";
import { commerceErrorResponse } from "@/lib/http/commerce-http";
import { resolveOrders } from "@/lib/orders/store";

/**
 * GET /api/cron/sweep — payment reconciliation (pending gateway payments), scheduled flows (alerts, review requests, abandoned checkout) and the retention clean-up
 * (lib/db/retention.ts: expired sessions, OTPs, tickets, rate windows, locks, old holds, idle bags, orphan
 * photos). Cron secret only. The response carries counts only — no ids or personal data.
 */
export async function GET(request: Request) {
  if (!cronAuthorised(request)) return jsonError(401, "unauthorised", "Not allowed.");
  try {
    // CHK-06: a missed webhook can't leave a paid order unconfirmed, and unpaid orders release their stock.
    const reconciled = Object.keys(await reconcilePending(defaultDeps())).length;
    const result = await runSweep({ orders: resolveOrders(), commerce, alerts: resolveAlerts() });
    // Notifications queued so far (order updates now; the alerts / reminders queued above go next run).
    const outbox = resolveOutbox();
    const delivery = outbox ? await deliverOutbox({ outbox, sms: resolveSms(), customers: resolveCustomers() }) : null;
    const purged = (await dbStores()?.maintenance.purgeExpired()) ?? {};
    return Response.json({ ok: true, reconciled, ...result, delivery, purged }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
