import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { listOrders, listPayouts, listReturns, reports } from "@/lib/admin/ops";
import { can } from "@/lib/admin/permissions";
import { resolveInbox } from "@/lib/privacy/requests";

/** GET — KPIs + the work queue for the signed-in role (only what the role may see). */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "dashboard");
  if (!auth.ok) return auth.response;
  try {
    const role = auth.staff.role;
    const out: Record<string, unknown> = { role };
    if (can(role, "orders.read")) {
      const toPack = await listOrders({ fulfilment: "confirmed", status: "confirmed" });
      out.queue = {
        toPack: toPack.total,
        toConfirm: toPack.rows.filter((o) => o.needsConfirmation).length,
        onHold: toPack.rows.filter((o) => o.hold).length,
        toShip: (await listOrders({ fulfilment: "packed", status: "confirmed" })).total,
      };
    }
    if (can(role, "returns.read")) {
      out.returns = { awaitingPickup: (await listReturns("pickup_scheduled")).length, awaitingQc: (await listReturns("picked_up")).length };
    }
    if (can(role, "refunds.issue")) out.payouts = (await listPayouts()).length;
    if (can(role, "privacy.read")) {
      const open = (await resolveInbox().list()).filter((r) => r.status !== "resolved" && r.status !== "rejected");
      out.privacy = { open: open.length, overdue: open.filter((r) => Date.parse(r.acknowledgeBy) < Date.now() && r.status === "received").length };
    }
    if (can(role, "reports.read")) {
      const r = await reports(1);
      out.today = { orders: r.orders, revenue: r.revenue, aov: r.aov, codShare: r.codShare };
    }
    return privateJson(out);
  } catch (error) {
    return adminError(error);
  }
}
