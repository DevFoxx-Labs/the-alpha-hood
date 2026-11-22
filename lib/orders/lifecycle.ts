import { randomBytes } from "node:crypto";
import type { CheckoutDeps } from "@/lib/checkout/service";
import { notify, type Template } from "@/lib/notify/outbox";
import type { FulfilmentStatus, Order, Refund } from "./store";

/**
 * ORD-01 fulfilment state machine + ORD-04 customer cancellation. Transitions are checked against an
 * allow-list (never `cancelled → shipped`) and applied under the order lock. Courier webhooks / admin (M7)
 * call `advanceFulfilment`; customers call `cancelOrder`.
 */
export const TRANSITIONS: Record<FulfilmentStatus, FulfilmentStatus[]> = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped"],
  shipped: ["out_for_delivery", "delivered", "rto"],
  out_for_delivery: ["delivered", "rto"],
  delivered: ["returned"],
  cancelled: [],
  rto: [],
  returned: [],
};

/** ORD-04: customers can cancel until the order is packed. */
export function canCustomerCancel(o: Pick<Order, "status" | "fulfilment">): boolean {
  return o.status === "confirmed" && o.fulfilment === "confirmed";
}

export class OrderActionError extends Error {
  constructor(
    public readonly code: "order_not_found" | "invalid_transition" | "not_cancellable",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "OrderActionError";
  }
}

const NOTIFY: Partial<Record<FulfilmentStatus, Template>> = {
  packed: "order_packed",
  shipped: "order_shipped",
  out_for_delivery: "order_out_for_delivery",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
};

/** Indian financial year label for a date, e.g. 2026-27 (April–March). */
export function financialYear(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Sum paid by the customer through the gateway (succeeded attempts). */
export function capturedAmount(o: Order): number {
  return o.attempts.filter((a) => a.status === "succeeded").reduce((n, a) => n + a.amount, 0);
}

export function refundedAmount(o: Order): number {
  return o.refunds.filter((r) => r.to !== "store_credit").reduce((n, r) => n + r.amount, 0);
}

export async function advanceFulfilment(deps: CheckoutDeps, orderNumber: string, to: FulfilmentStatus, now = new Date()): Promise<Order> {
  return deps.locks.run(`order:${orderNumber}`, async () => {
    const order = await deps.orders.get(orderNumber);
    if (!order || order.status !== "confirmed") throw new OrderActionError("order_not_found", "Order not found.", 404);
    if (!TRANSITIONS[order.fulfilment].includes(to)) {
      throw new OrderActionError("invalid_transition", `Can't move an order from ${order.fulfilment} to ${to}.`, 409);
    }
    if (to === "cancelled") throw new OrderActionError("invalid_transition", "Use cancelOrder for cancellations.", 409);

    const at = now.toISOString();
    let tracking = order.tracking;
    let invoice = order.invoice;
    if (to === "shipped") {
      tracking = await deps.shipping.createShipment(order.number);
      // GST invoice is issued at dispatch with a consecutive number in the financial year (CHK-10).
      invoice ??= { number: await deps.orders.nextInvoiceNumber(financialYear(now)), issuedAt: at };
    }
    if (to === "rto") {
      await deps.commerce.inventory.restock(`rto:${order.number}`, order.lines.map((l) => ({ productId: l.productId, size: l.size, quantity: l.quantity })));
    }
    const updated = await deps.orders.update(order.number, (o) => {
      o.fulfilment = to;
      o.timeline.push({ status: to, at });
      o.tracking = tracking;
      o.invoice = invoice;
      if (to === "delivered") o.deliveredAt = at;
    });
    const template = NOTIFY[to];
    if (template) await notify(order.customerId, template, { orderNumber: order.number });
    return updated!;
  });
}

/**
 * ORD-04 cancellation by the customer (before packing). Stock goes back; prepaid orders are refunded in full
 * to the original method (idempotent reference `cancel:<order>`); COD orders have nothing to refund.
 */
export async function cancelOrder(deps: CheckoutDeps, customerId: string, orderNumber: string, now = new Date()): Promise<Order> {
  return deps.locks.run(`order:${orderNumber}`, async () => {
    const order = await deps.orders.get(orderNumber);
    if (!order || order.customerId !== customerId) throw new OrderActionError("order_not_found", "Order not found.", 404);
    if (!canCustomerCancel(order)) {
      throw new OrderActionError("not_cancellable", "This order can no longer be cancelled. You can return it after delivery.", 409);
    }

    await deps.commerce.inventory.restock(
      `cancel:${order.number}`,
      order.lines.map((l) => ({ productId: l.productId, size: l.size, quantity: l.quantity })),
    );

    const refunds: Refund[] = [];
    const paid = capturedAmount(order) - refundedAmount(order);
    if (order.paymentMethod !== "cod" && paid > 0) {
      const attempt = order.attempts.find((a) => a.status === "succeeded")!;
      const reference = `cancel:${order.number}`;
      const { refundId } = await deps.gateway.refund(attempt.paymentId, paid, reference);
      refunds.push({ id: refundId, reference, amount: paid, to: "source", status: "processing", createdAt: now.toISOString() });
    }

    const updated = await deps.orders.update(order.number, (o) => {
      o.fulfilment = "cancelled";
      o.timeline.push({ status: "cancelled", at: now.toISOString(), note: "Cancelled by you" });
      for (const r of refunds) {
        if (!o.refunds.some((x) => x.reference === r.reference)) {
          o.refunds.push(r);
          o.timeline.push({ status: "refund", at: now.toISOString(), note: "Full refund to your original payment method" });
        }
      }
    });
    await notify(customerId, "order_cancelled", { orderNumber: order.number });
    if (refunds.length) await notify(customerId, "refund_initiated", { orderNumber: order.number });
    return updated!;
  });
}

export function newId(prefix: string): string {
  return `${prefix}${randomBytes(5).toString("hex").toUpperCase()}`;
}
