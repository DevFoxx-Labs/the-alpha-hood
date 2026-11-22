import { loadCartView, priceLines } from "@/lib/cart/service";
import { commerce as defaultCommerce } from "@/lib/commerce";
import { CommerceError, type CommerceAdapter } from "@/lib/commerce/types";
import { locks as defaultLocks, type KeyedLock } from "@/lib/concurrency/lock";
import { resolveCustomers, type CustomerStore } from "@/lib/customers/store";
import type { Paise } from "@/lib/format";
import { resolveOrders, type Order, type OrderStore } from "@/lib/orders/store";
import { resolveGateway, type PaymentEvent, type PaymentGateway } from "@/lib/payments/gateway";
import type { PaymentMethod } from "@/lib/pricing/price-cart";
import { findCoupon } from "@/lib/promotions/coupons";
import { notify } from "@/lib/notify/outbox";
import { securityEvent } from "@/lib/security/log";
import { shipping as defaultShipping, type ShippingAdapter } from "@/lib/shipping";
import { addressQuality } from "./address";
import { codDecision } from "./cod-risk";
import { checkoutEnabled, codEnabled } from "./flags";

/**
 * Checkout (CHK-01…07, 09). Every amount comes from `priceLines` on the server. Money flows run under a
 * per-customer / per-order lock (the in-process stand-in for row locks), stock is reserved all-or-nothing,
 * placement is idempotent per (customer, Idempotency-Key), and payment events are idempotent per event id
 * and per attempt status.
 */
export const RESERVATION_TTL_MS = 15 * 60_000;

export class CheckoutError extends Error {
  constructor(
    public readonly code:
      | "checkout_disabled"
      | "cart_empty"
      | "cart_changed"
      | "address_not_found"
      | "not_serviceable"
      | "express_unavailable"
      | "coupon_invalid"
      | "cod_unavailable"
      | "out_of_stock"
      | "total_changed"
      | "order_not_found"
      | "not_retryable",
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export interface CheckoutDeps {
  commerce: CommerceAdapter;
  customers: CustomerStore;
  orders: OrderStore;
  gateway: PaymentGateway;
  shipping: ShippingAdapter;
  locks: KeyedLock;
  env?: Record<string, string | undefined>;
}

export function defaultDeps(): CheckoutDeps {
  return {
    commerce: defaultCommerce,
    customers: resolveCustomers(),
    orders: resolveOrders(),
    gateway: resolveGateway(),
    shipping: defaultShipping,
    locks: defaultLocks,
  };
}

export interface QuoteInput {
  customerId: string;
  cartId: string | null;
  addressId: string | null;
  speed: "standard" | "express";
  payment: PaymentMethod | null;
  now?: Date;
}

/** Everything the checkout page shows for the current choices (CHK-03/04/05/07). No side effects. */
export async function quote(deps: CheckoutDeps, input: QuoteInput) {
  const customer = await deps.customers.get(input.customerId);
  if (!customer) throw new CheckoutError("order_not_found", "Please verify your phone again.", 401);
  const view = await loadCartView(input.cartId, { now: input.now }, deps.commerce);
  const address = input.addressId ? customer.addresses.find((a) => a.id === input.addressId) ?? null : null;
  if (input.addressId && !address) throw new CheckoutError("address_not_found", "Address not found.", 404);

  const promise = address ? await deps.shipping.check(address.pincode, input.now) : null;
  const speed: "standard" | "express" = input.speed === "express" && promise?.express ? "express" : "standard";
  const coupon = view.couponCode ? findCoupon(view.couponCode) : null;
  const ctx = {
    payment: input.payment,
    speed,
    expressFee: promise?.express?.fee ?? null,
    shipState: address?.state ?? null,
    customer: { orderCount: customer.orderCount, couponUses: customer.couponUses },
    now: input.now,
  } as const;
  const pricing = priceLines(view.purchasable, coupon, ctx);
  // COD eligibility is judged on the COD total (incl. COD fee).
  const codPricing = priceLines(view.purchasable, coupon, { ...ctx, payment: "cod" });
  const cod =
    address && promise
      ? codDecision({
          codEnabled: codEnabled(deps.env),
          total: codPricing.total,
          promise,
          customer,
          addressQuality: addressQuality(address),
        })
      : null;
  return { view, pricing, promise, speed, cod: cod ? { allowed: cod.allowed, reasons: cod.reasons } : null, codTotal: codPricing.total };
}

export interface PlaceInput {
  customerId: string;
  cartId: string | null;
  addressId: string;
  speed: "standard" | "express";
  payment: PaymentMethod;
  upiApp?: string;
  idempotencyKey: string;
  /** The total the shopper saw; if the server total differs, the order is refused (no surprise charges). */
  expectedTotal: Paise;
  now?: Date;
}

export type PlaceResult = { orderNumber: string; status: Order["status"]; redirectUrl: string };

/** Replay of an earlier placement with the same Idempotency-Key returns the same outcome. */
function placeResult(order: Order): PlaceResult {
  if (order.notes.includes("out_of_stock_at_placement")) {
    throw new CheckoutError("out_of_stock", "Some items just sold out. Please review your bag.", 409);
  }
  const last = order.attempts.at(-1);
  const redirectUrl =
    order.status === "pending_payment" && last && last.status === "pending" ? `/checkout/pay/${last.paymentId}` : `/checkout/order/${order.number}`;
  return { orderNumber: order.number, status: order.status, redirectUrl };
}

export async function placeOrder(deps: CheckoutDeps, input: PlaceInput): Promise<PlaceResult> {
  if (!checkoutEnabled(deps.env)) throw new CheckoutError("checkout_disabled", "Checkout is temporarily unavailable.", 503);
  if (input.payment === "cod" && !codEnabled(deps.env)) {
    throw new CheckoutError("cod_unavailable", "Cash on delivery is unavailable right now.", 422, { reasons: ["Cash on delivery is unavailable right now."] });
  }

  return deps.locks.run(`checkout:${input.customerId}`, async () => {
    const existing = await deps.orders.byIdempotency(input.customerId, input.idempotencyKey);
    if (existing) return placeResult(existing);

    const q = await quote(deps, { ...input, addressId: input.addressId });
    if (!q.view.id || q.view.purchasable.length === 0) throw new CheckoutError("cart_empty", "Your bag is empty.", 409);
    if (q.view.hasIssues) {
      throw new CheckoutError("cart_changed", "Some items in your bag changed. Please review your bag.", 409);
    }
    const customer = (await deps.customers.get(input.customerId))!;
    const address = customer.addresses.find((a) => a.id === input.addressId)!;
    if (!q.promise?.serviceable) throw new CheckoutError("not_serviceable", "We don't deliver to this pincode yet.", 422);
    if (input.speed === "express" && q.speed !== "express") {
      throw new CheckoutError("express_unavailable", "Express delivery isn't available for this pincode.", 422);
    }
    if (q.pricing.coupon && !q.pricing.coupon.ok) {
      throw new CheckoutError("coupon_invalid", q.pricing.coupon.reason ?? "This coupon can't be used.", 409);
    }

    // The payment method changes the total (COD fee / prepaid offer) — price for the chosen method.
    const coupon = q.view.couponCode ? findCoupon(q.view.couponCode) : null;
    const pricing = priceLines(q.view.purchasable, coupon, {
      payment: input.payment,
      speed: q.speed,
      expressFee: q.promise.express?.fee ?? null,
      shipState: address.state,
      customer: { orderCount: customer.orderCount, couponUses: customer.couponUses },
      now: input.now,
    });
    if (pricing.coupon && !pricing.coupon.ok) throw new CheckoutError("coupon_invalid", pricing.coupon.reason ?? "This coupon can't be used.", 409);
    if (!Number.isSafeInteger(pricing.total) || pricing.total <= 0) throw new CheckoutError("cart_empty", "Nothing to pay for.", 409);
    if (pricing.total !== input.expectedTotal) {
      throw new CheckoutError("total_changed", "Your total has changed. Please review it before paying.", 409, { total: pricing.total });
    }

    let codRisk: Order["codRisk"] = null;
    if (input.payment === "cod") {
      const d = codDecision({ codEnabled: codEnabled(deps.env), total: pricing.total, promise: q.promise, customer, addressQuality: addressQuality(address) });
      if (!d.allowed) {
        securityEvent("cod_blocked", { customer: customer.id, reasons: d.reasons.length });
        throw new CheckoutError("cod_unavailable", d.reasons[0] ?? "Cash on delivery isn't available.", 422, { reasons: d.reasons });
      }
      codRisk = { score: d.score, needsConfirmation: d.needsConfirmation };
    }

    const byId = new Map(q.view.purchasable.map((l) => [l.id, l]));
    const now = input.now ?? new Date();
    const order = await deps.orders.create({
      customerId: customer.id,
      cartId: q.view.id,
      status: input.payment === "cod" ? "confirmed" : "pending_payment",
      paymentMethod: input.payment,
      attempts: [],
      lines: pricing.lines.map((pl) => {
        const l = byId.get(pl.lineId)!;
        return {
          lineId: l.id,
          productId: l.productId,
          handle: l.handle,
          title: l.title,
          colour: l.colour,
          size: l.size,
          quantity: pl.quantity,
          image: { art: l.image.art, colour: l.image.colour, alt: l.image.alt },
          net: pl.net,
          unitMrp: pl.unitMrp,
          unitPrice: pl.unitPrice,
          gstRate: pl.gstRate,
          gst: pl.gst,
        };
      }),
      pricing,
      address: { ...address },
      delivery: { speed: q.speed, by: (q.speed === "express" ? q.promise.express?.by : q.promise.standardBy) ?? null },
      couponCode: pricing.coupon?.ok ? pricing.coupon.code : null,
      codRisk,
      idempotencyKey: input.idempotencyKey,
      createdAt: now.toISOString(),
      confirmedAt: input.payment === "cod" ? now.toISOString() : null,
      notes: [],
      fulfilment: input.payment === "cod" ? "confirmed" : "placed",
      timeline:
        input.payment === "cod"
          ? [
              { status: "placed", at: now.toISOString() },
              { status: "confirmed", at: now.toISOString() },
            ]
          : [{ status: "placed", at: now.toISOString() }],
      tracking: null,
      deliveredAt: null,
      refunds: [],
      returnedQty: {},
      invoice: null,
    });

    // Hold stock all-or-nothing; on failure the order never becomes visible as placed.
    try {
      await deps.commerce.inventory.reserve(
        order.id,
        order.lines.map((l) => ({ productId: l.productId, size: l.size, quantity: l.quantity })),
        RESERVATION_TTL_MS,
        now,
      );
    } catch (e) {
      await deps.orders.transition(order.number, ["pending_payment", "confirmed"], "expired", (o) => o.notes.push("out_of_stock_at_placement"));
      if (e instanceof CommerceError && e.code === "out_of_stock") {
        throw new CheckoutError("out_of_stock", "Some items just sold out. Please review your bag.", 409);
      }
      throw e;
    }

    if (input.payment === "cod") {
      await deps.commerce.inventory.commit(order.id);
      await finaliseConfirmed(deps, order);
      securityEvent("order_placed", { order: order.number, method: "cod" });
      return { orderNumber: order.number, status: "confirmed", redirectUrl: `/checkout/order/${order.number}` };
    }

    // Gateway order is created after our order exists (outbox-style: a crash here leaves a pending order
    // that reconciliation expires and releases).
    const payment = await deps.gateway.createPayment({ orderNumber: order.number, amount: pricing.total, method: input.payment, upiApp: input.upiApp });
    await deps.orders.update(order.number, (o) => {
      o.attempts.push({ paymentId: payment.paymentId, amount: pricing.total, status: "pending", createdAt: now.toISOString() });
    });
    securityEvent("order_placed", { order: order.number, method: input.payment });
    return { orderNumber: order.number, status: "pending_payment", redirectUrl: payment.redirectUrl };
  });
}

async function finaliseConfirmed(deps: CheckoutDeps, order: Order) {
  if (order.cartId) await deps.commerce.cart.clear(order.cartId);
  await deps.customers.recordOrder(order.customerId, order.couponCode);
  await notify(order.customerId, "order_confirmed", { orderNumber: order.number });
}

/**
 * Applies a verified gateway event (webhook, demo gateway or reconciliation). Idempotent: duplicate event
 * ids and already-final attempts are no-ops. Amount must match the attempt and the order total exactly.
 */
export async function handlePaymentEvent(deps: CheckoutDeps, event: PaymentEvent, now = new Date()): Promise<string> {
  return deps.locks.run(`order:${event.orderNumber}`, async () => {
    if (!(await deps.orders.markEvent(event.id))) return "duplicate";
    const order = await deps.orders.byPaymentId(event.paymentId);
    if (!order || order.number !== event.orderNumber) return "unknown_payment";
    const attempt = order.attempts.find((a) => a.paymentId === event.paymentId)!;
    if (attempt.status === "succeeded" || attempt.status === "failed") return "already_final";

    if (event.type === "payment.failed") {
      await deps.orders.update(order.number, (o) => {
        o.attempts.find((a) => a.paymentId === event.paymentId)!.status = "failed";
      });
      const moved = await deps.orders.transition(order.number, ["pending_payment"], "payment_failed", (o) =>
        o.timeline.push({ status: "payment_failed", at: now.toISOString() }),
      );
      if (moved) await deps.commerce.inventory.release(order.id);
      return "failed";
    }

    if (event.amount !== attempt.amount || attempt.amount !== order.pricing.total) {
      securityEvent("payment_amount_mismatch", { order: order.number });
      await deps.orders.update(order.number, (o) => {
        o.status = "needs_review";
        o.notes.push("amount_mismatch");
      });
      return "amount_mismatch";
    }

    await deps.orders.update(order.number, (o) => {
      o.attempts.find((a) => a.paymentId === event.paymentId)!.status = "succeeded";
    });

    if (order.status === "confirmed" || order.status === "needs_review") {
      // Paid twice (second attempt) — keep the money safe for a refund, never double-ship.
      await deps.orders.update(order.number, (o) => o.notes.push(`duplicate_payment:${event.paymentId}`));
      return "duplicate_payment";
    }

    // Stock still held? Late success after expiry tries to re-reserve; otherwise ops refunds.
    let held = await deps.commerce.inventory.isHeld(order.id, now);
    if (!held) {
      try {
        await deps.commerce.inventory.reserve(
          order.id,
          order.lines.map((l) => ({ productId: l.productId, size: l.size, quantity: l.quantity })),
          RESERVATION_TTL_MS,
          now,
        );
        held = true;
      } catch {
        held = false;
      }
    }
    if (!held) {
      securityEvent("payment_late_success", { order: order.number });
      await deps.orders.transition(order.number, ["pending_payment", "payment_failed", "expired"], "needs_review", (o) =>
        o.notes.push("paid_but_out_of_stock"),
      );
      return "needs_review";
    }

    await deps.commerce.inventory.commit(order.id);
    const confirmed = await deps.orders.transition(order.number, ["pending_payment", "payment_failed", "expired"], "confirmed", (o) => {
      o.confirmedAt = now.toISOString();
      o.fulfilment = "confirmed";
      o.timeline.push({ status: "confirmed", at: now.toISOString() });
    });
    if (confirmed) await finaliseConfirmed(deps, confirmed);
    return "confirmed";
  });
}

/** CHK-06 retry after a failed/expired payment: same order and amount, new gateway attempt. */
export async function retryPayment(deps: CheckoutDeps, customerId: string, orderNumber: string, now = new Date()) {
  if (!checkoutEnabled(deps.env)) throw new CheckoutError("checkout_disabled", "Checkout is temporarily unavailable.", 503);
  return deps.locks.run(`order:${orderNumber}`, async () => {
    const order = await deps.orders.get(orderNumber);
    if (!order || order.customerId !== customerId) throw new CheckoutError("order_not_found", "Order not found.", 404);
    if (order.paymentMethod === "cod" || (order.status !== "payment_failed" && order.status !== "expired")) {
      throw new CheckoutError("not_retryable", "This order can't be paid again.", 409);
    }
    try {
      await deps.commerce.inventory.reserve(
        order.id,
        order.lines.map((l) => ({ productId: l.productId, size: l.size, quantity: l.quantity })),
        RESERVATION_TTL_MS,
        now,
      );
    } catch {
      throw new CheckoutError("out_of_stock", "Some items sold out since. Please place a new order.", 409);
    }
    const method = order.paymentMethod as Exclude<PaymentMethod, "cod">;
    const payment = await deps.gateway.createPayment({ orderNumber: order.number, amount: order.pricing.total, method });
    await deps.orders.transition(order.number, ["payment_failed", "expired"], "pending_payment", (o) => {
      o.attempts.push({ paymentId: payment.paymentId, amount: o.pricing.total, status: "pending", createdAt: now.toISOString() });
    });
    return { orderNumber: order.number, redirectUrl: payment.redirectUrl };
  });
}

/**
 * CHK-06 reconciliation (cron every few minutes): asks the gateway about pending payments so a missed
 * webhook can't leave a "paid but not confirmed" order; expires unpaid orders after the hold and frees stock.
 */
export async function reconcilePending(deps: CheckoutDeps, now = new Date()) {
  const results: Record<string, string> = {};
  for (const order of await deps.orders.listByStatus("pending_payment")) {
    const attempt = order.attempts.at(-1);
    if (!attempt) continue;
    const status = await deps.gateway.fetchStatus(attempt.paymentId);
    if (status && status.status !== "pending") {
      results[order.number] = await handlePaymentEvent(
        deps,
        {
          id: `evt_${attempt.paymentId.slice(4)}`,
          type: status.status === "succeeded" ? "payment.succeeded" : "payment.failed",
          paymentId: attempt.paymentId,
          orderNumber: order.number,
          amount: status.amount,
        },
        now,
      );
      continue;
    }
    if (now.getTime() - Date.parse(attempt.createdAt) > RESERVATION_TTL_MS) {
      const expired = await deps.orders.transition(order.number, ["pending_payment"], "expired", (o) => {
        o.attempts.find((a) => a.paymentId === attempt.paymentId)!.status = "expired";
      });
      if (expired) await deps.commerce.inventory.release(order.id);
      results[order.number] = "expired";
    }
  }
  return results;
}
