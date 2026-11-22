import { returnDeps } from "@/lib/account/service";
import { ORDER_NUMBER_RE } from "@/lib/checkout/parse";
import { devPagesEnabled } from "@/lib/dev-tools";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { mockDataAllowed } from "@/lib/mock-guard";
import { advanceFulfilment } from "@/lib/orders/lifecycle";
import type { FulfilmentStatus } from "@/lib/orders/store";
import { advanceReturn, resolveReturns } from "@/lib/returns/service";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * DEV TOOL — stands in for the courier webhooks and the warehouse (admin arrives in M7) so orders and returns
 * can be moved through their lifecycle locally. 404 unless dev pages AND mock data are allowed, i.e. never on
 * the live store. GET lists recent orders/returns; POST `{ kind, number, to }` advances one.
 */
function allowed() {
  return devPagesEnabled() && mockDataAllowed();
}

const ORDER_STEPS: FulfilmentStatus[] = ["packed", "shipped", "out_for_delivery", "delivered", "rto"];
const RETURN_STEPS = ["picked_up", "qc_passed", "qc_failed"] as const;

export async function GET() {
  if (!allowed()) return jsonError(404, "not_found", "Not found.");
  const deps = await returnDeps([]);
  const orders = await deps.orders.listRecent(30);
  const returns = await resolveReturns().listRecent(30);
  return privateJson({
    orders: orders.map((o) => ({ number: o.number, status: o.status, fulfilment: o.fulfilment, total: o.pricing.total, createdAt: o.createdAt })),
    returns: returns.map((r) => ({ number: r.number, orderNumber: r.orderNumber, status: r.status, resolution: r.resolution, createdAt: r.createdAt })),
  });
}

export async function POST(request: Request) {
  if (!allowed()) return jsonError(404, "not_found", "Not found.");
  const guard = await guardPublicWrite(request, { name: "dev-fulfilment", limit: 120, windowMs: 60_000, maxBytes: 256 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["kind", "number", "to"]);
    const number = typeof input.number === "string" ? input.number : "";
    if (input.kind === "order") {
      if (!ORDER_NUMBER_RE.test(number) || !ORDER_STEPS.includes(input.to as FulfilmentStatus)) return jsonError(422, "invalid_input", "Bad request.");
      const o = await advanceFulfilment(await returnDeps([]), number, input.to as FulfilmentStatus);
      return privateJson({ fulfilment: o.fulfilment });
    }
    if (input.kind === "return") {
      if (!/^RT[0-9A-F]{10}$/.test(number) || !RETURN_STEPS.includes(input.to as (typeof RETURN_STEPS)[number])) return jsonError(422, "invalid_input", "Bad request.");
      const r = await resolveReturns().get(number);
      const order = r ? await (await returnDeps([])).orders.get(r.orderNumber) : null;
      const deps = await returnDeps(order?.lines.map((l) => l.productId) ?? []);
      const updated = await advanceReturn(deps, number, input.to as (typeof RETURN_STEPS)[number]);
      return privateJson({ status: updated?.status });
    }
    return jsonError(422, "invalid_input", "Bad request.");
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
