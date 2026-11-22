import { queueRefund } from "@/lib/analytics/server";
import { randomBytes } from "node:crypto";
import type { CheckoutDeps } from "@/lib/checkout/service";
import { CommerceError } from "@/lib/commerce/types";
import type { Paise } from "@/lib/format";
import { ValidationError } from "@/lib/http/guard";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { notify } from "@/lib/notify/outbox";
import { capturedAmount, refundedAmount } from "@/lib/orders/lifecycle";
import type { Order } from "@/lib/orders/store";
import type { StoreCreditLedger } from "@/lib/wallet/store-credit";
import { asObject, rejectUnknownFields } from "@/lib/validation";
import type { PhotoStore } from "./photos";
import { FAULT_REASONS, RETURN_REASONS, RETURN_RULES, returnEligibility, type ReturnReason, unitsValue } from "./rules";

/**
 * RET-01…04: self-serve returns & exchanges. Exchange-first (size swap if in stock, else store credit with a
 * bonus), refund to source otherwise; COD refunds go to a UPI ID or store credit. Money moves only after the
 * quality check, under the order lock, idempotently (`return:<number>`), never above what was paid.
 */
export type Resolution = "exchange" | "store_credit" | "refund";
export type ReturnStatus = "pickup_scheduled" | "picked_up" | "qc_failed" | "completed" | "cancelled";

export interface ReturnItem {
  lineId: string;
  quantity: number;
  /** For exchanges: the new size (same product). */
  exchangeSize?: string;
}

export interface ReturnRequest {
  number: string;
  orderNumber: string;
  customerId: string;
  items: ReturnItem[];
  reason: ReturnReason;
  comment: string;
  photoIds: string[];
  resolution: Resolution;
  refundTo: "source" | "upi" | "store_credit" | null;
  /** Masked for display; the full id is kept only for the payout (encrypt at rest with a DB). */
  upiId: string | null;
  pickup: { addressId: string; pincode: string; city: string; date: string; slot: "morning" | "afternoon"; courier: string; awb: string };
  amounts: { itemsValue: Paise; fee: Paise; bonus: Paise; payable: Paise };
  status: ReturnStatus;
  timeline: { status: ReturnStatus | "requested"; at: string; note?: string }[];
  createdAt: string;
}

export interface ReturnStore {
  create(r: ReturnRequest): Promise<ReturnRequest>;
  get(number: string): Promise<ReturnRequest | null>;
  listByOrder(orderNumber: string): Promise<ReturnRequest[]>;
  listByCustomer(customerId: string): Promise<ReturnRequest[]>;
  listRecent(limit: number): Promise<ReturnRequest[]>;
  update(number: string, patch: (r: ReturnRequest) => void): Promise<ReturnRequest | null>;
}

export function createMemoryReturnStore(): ReturnStore {
  const items = new Map<string, ReturnRequest>();
  const clone = (r: ReturnRequest) => structuredClone(r);
  return {
    async create(r) {
      if (items.has(r.number)) throw new Error("Duplicate return number");
      items.set(r.number, structuredClone(r));
      return clone(r);
    },
    async get(n) {
      const r = items.get(n);
      return r ? clone(r) : null;
    },
    async listByOrder(o) {
      return [...items.values()].filter((r) => r.orderNumber === o).map(clone);
    },
    async listByCustomer(c) {
      return [...items.values()].filter((r) => r.customerId === c).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
    },
    async listRecent(limit) {
      return [...items.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(clone);
    },
    async update(n, patch) {
      const r = items.get(n);
      if (!r) return null;
      patch(r);
      return clone(r);
    },
  };
}

export function resolveReturns(env: Env = process.env): ReturnStore {
  if (mockDataAllowed(env)) return devSingleton("return_store", createMemoryReturnStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Returns");
  };
  return { create: fail, get: fail, listByOrder: fail, listByCustomer: fail, listRecent: fail, update: fail };
}

export interface ReturnDeps extends CheckoutDeps {
  returns: ReturnStore;
  credit: StoreCreditLedger;
  photos: PhotoStore;
  categoryOf: (productId: string) => string | undefined;
  sizesOf: (productId: string) => string[];
}

export class ReturnError extends Error {
  constructor(
    public readonly code: "order_not_found" | "not_returnable" | "invalid_items" | "photos_required" | "report_window" | "exchange_unavailable" | "invalid_refund_target" | "return_not_found" | "invalid_transition",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ReturnError";
  }
}

const UPI_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function maskUpi(upi: string): string {
  const [user, handle] = upi.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(2, user.length - 2))}@${handle}`;
}

/** Pickup dates offered: the next 3 days excluding Sundays (IST). */
export function pickupDates(now = new Date()): string[] {
  const out: string[] = [];
  const ist = new Date(now.getTime() + 330 * 60_000);
  let d = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  while (out.length < 3) {
    d += 86_400_000;
    if (new Date(d).getUTCDay() !== 0) out.push(new Date(d).toISOString().slice(0, 10));
  }
  return out;
}

export interface CreateReturnInput {
  orderNumber: string;
  items: ReturnItem[];
  reason: ReturnReason;
  comment: string;
  photoIds: string[];
  resolution: Resolution;
  refundTo: "source" | "upi" | "store_credit" | null;
  upiId: string | null;
  addressId: string;
  date: string;
  slot: "morning" | "afternoon";
}

/** Strict allow-list parse of the request body (orderNumber comes from the URL). */
export function parseReturnInput(body: unknown, orderNumber: string): CreateReturnInput {
  const input = asObject(body);
  rejectUnknownFields(input, ["items", "reason", "comment", "photoIds", "resolution", "refundTo", "upiId", "addressId", "date", "slot"]);
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 20) throw new ValidationError("Choose the items to return.");
  const items: ReturnItem[] = input.items.map((raw) => {
    const it = asObject(raw);
    rejectUnknownFields(it, ["lineId", "quantity", "exchangeSize"]);
    if (typeof it.lineId !== "string" || !/^line_[a-f0-9]{32}$/.test(it.lineId)) throw new ValidationError("Unknown item.");
    if (typeof it.quantity !== "number" || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 5) throw new ValidationError("Invalid quantity.");
    const exchangeSize = it.exchangeSize === undefined ? undefined : typeof it.exchangeSize === "string" && it.exchangeSize.length <= 12 ? it.exchangeSize : null;
    if (exchangeSize === null) throw new ValidationError("Choose a size.");
    return { lineId: it.lineId, quantity: it.quantity, ...(exchangeSize ? { exchangeSize } : {}) };
  });
  if (new Set(items.map((i) => i.lineId)).size !== items.length) throw new ValidationError("Each item can appear once.");
  if (typeof input.reason !== "string" || !Object.hasOwn(RETURN_REASONS, input.reason)) throw new ValidationError("Choose a reason.");
  const comment = typeof input.comment === "string" ? input.comment.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, 500) : "";
  const photoIds = input.photoIds === undefined ? [] : Array.isArray(input.photoIds) ? input.photoIds : null;
  if (!photoIds || photoIds.length > RETURN_RULES.maxPhotos || !photoIds.every((p) => typeof p === "string")) throw new ValidationError("Invalid photos.");
  if (input.resolution !== "exchange" && input.resolution !== "store_credit" && input.resolution !== "refund") throw new ValidationError("Choose exchange, store credit or refund.");
  const refundTo = input.refundTo === undefined || input.refundTo === null ? null : input.refundTo;
  if (refundTo !== null && refundTo !== "source" && refundTo !== "upi" && refundTo !== "store_credit") throw new ValidationError("Choose where to refund.");
  let upiId: string | null = null;
  if (refundTo === "upi") {
    if (typeof input.upiId !== "string" || !UPI_RE.test(input.upiId.trim())) throw new ValidationError("Enter a valid UPI ID, e.g. name@bank.");
    upiId = input.upiId.trim();
  }
  if (typeof input.addressId !== "string" || !/^adr_[A-Za-z0-9_-]{8,20}$/.test(input.addressId)) throw new ValidationError("Choose a pickup address.");
  if (typeof input.date !== "string" || !DATE_RE.test(input.date)) throw new ValidationError("Choose a pickup date.");
  if (input.slot !== "morning" && input.slot !== "afternoon") throw new ValidationError("Choose a pickup slot.");
  return {
    orderNumber,
    items,
    reason: input.reason as ReturnReason,
    comment,
    photoIds: photoIds as string[],
    resolution: input.resolution,
    refundTo,
    upiId,
    addressId: input.addressId,
    date: input.date,
    slot: input.slot,
  };
}

export async function createReturn(deps: ReturnDeps, customerId: string, input: CreateReturnInput, now = new Date()): Promise<ReturnRequest> {
  return deps.locks.run(`order:${input.orderNumber}`, async () => {
    const order = await deps.orders.get(input.orderNumber);
    if (!order || order.customerId !== customerId) throw new ReturnError("order_not_found", "Order not found.", 404);
    const elig = returnEligibility(order, deps.categoryOf, now);
    if (!elig.open) throw new ReturnError("not_returnable", elig.reason ?? "This order can't be returned.", 409);

    // Items: every line belongs to this order and stays within what's left to return.
    for (const it of input.items) {
      const e = elig.lines.find((l) => l.lineId === it.lineId);
      if (!e || it.quantity > e.returnableQty) throw new ReturnError("invalid_items", e?.reason ?? "You can't return that many of this item.", 422);
    }

    const fault = FAULT_REASONS.includes(input.reason);
    if (fault) {
      if (input.photoIds.length === 0) throw new ReturnError("photos_required", "Add at least one photo of the damage or the wrong item.", 422);
      if (now.getTime() - Date.parse(order.deliveredAt!) > RETURN_RULES.damageReportHours * 3_600_000) {
        throw new ReturnError("report_window", `Damaged or wrong items must be reported within ${RETURN_RULES.damageReportHours} hours of delivery. Please contact support.`, 409);
      }
    }

    // Resolution rules (RET-02/03).
    let refundTo = input.refundTo;
    if (input.resolution === "exchange") {
      if (input.items.some((it) => !it.exchangeSize)) throw new ReturnError("exchange_unavailable", "Choose the new size for each item.", 422);
      refundTo = null;
    } else if (input.resolution === "store_credit") {
      refundTo = "store_credit";
    } else {
      if (order.paymentMethod === "cod" && refundTo !== "upi" && refundTo !== "store_credit") {
        throw new ReturnError("invalid_refund_target", "Cash on delivery orders are refunded to a UPI ID or as store credit.", 422);
      }
      if (order.paymentMethod !== "cod") refundTo = "source";
    }

    // Pickup address must be one of the customer's own; date one of the offered ones.
    const customer = await deps.customers.get(customerId);
    const address = customer?.addresses.find((a) => a.id === input.addressId);
    if (!address) throw new ReturnError("invalid_items", "Choose one of your saved addresses for pickup.", 422);
    if (!pickupDates(now).includes(input.date)) throw new ReturnError("invalid_items", "Choose one of the offered pickup dates.", 422);

    // Exchange: same product, a size it's sold in, in stock now (held until pickup + QC).
    const number = `RT${randomBytes(5).toString("hex").toUpperCase()}`;
    if (input.resolution === "exchange") {
      const holds = input.items.map((it) => {
        const line = order.lines.find((l) => l.lineId === it.lineId)!;
        if (it.exchangeSize === line.size || !deps.sizesOf(line.productId).includes(it.exchangeSize!)) {
          throw new ReturnError("exchange_unavailable", "Choose a different size of the same item.", 422);
        }
        return { productId: line.productId, size: it.exchangeSize!, quantity: it.quantity };
      });
      try {
        await deps.commerce.inventory.reserve(`exchange:${number}`, holds, 10 * 86_400_000, now);
      } catch (e) {
        if (e instanceof CommerceError && e.code === "out_of_stock") {
          throw new ReturnError("exchange_unavailable", "That size is out of stock. Choose store credit or a refund instead.", 409);
        }
        throw e;
      }
    }

    // Photos must be the customer's own, unused uploads.
    if (input.photoIds.length && !(await deps.photos.attach(customerId, input.photoIds, number))) {
      await deps.commerce.inventory.release(`exchange:${number}`);
      throw new ReturnError("invalid_items", "Please upload the photos again.", 422);
    }

    // Money (computed now for display; paid after QC).
    const itemsValue = input.items.reduce((n, it) => {
      const line = order.lines.find((l) => l.lineId === it.lineId)!;
      return n + unitsValue(line, it.quantity, order.returnedQty[it.lineId] ?? 0);
    }, 0);
    const previous = (await deps.returns.listByCustomer(customerId)).filter((r) => r.status !== "cancelled" && r.status !== "qc_failed").length;
    const fee = fault || input.resolution === "exchange" || previous === 0 ? 0 : Math.min(RETURN_RULES.returnFee, itemsValue);
    const bonus = refundTo === "store_credit" ? Math.floor(((itemsValue - fee) * RETURN_RULES.storeCreditBonusPercent) / 100) : 0;
    const payable = input.resolution === "exchange" ? 0 : itemsValue - fee;

    const pickup = await deps.shipping.bookPickup(number, { pincode: address.pincode, date: input.date, slot: input.slot });
    const at = now.toISOString();
    const created = await deps.returns.create({
      number,
      orderNumber: order.number,
      customerId,
      items: input.items,
      reason: input.reason,
      comment: input.comment,
      photoIds: input.photoIds,
      resolution: input.resolution,
      refundTo,
      upiId: input.upiId,
      pickup: { addressId: address.id, pincode: address.pincode, city: address.city, date: input.date, slot: input.slot, courier: pickup.courier, awb: pickup.awb },
      amounts: { itemsValue, fee, bonus, payable },
      status: "pickup_scheduled",
      timeline: [
        { status: "requested", at },
        { status: "pickup_scheduled", at, note: `${input.date} · ${input.slot}` },
      ],
      createdAt: at,
    });

    await deps.orders.update(order.number, (o) => {
      for (const it of input.items) o.returnedQty[it.lineId] = (o.returnedQty[it.lineId] ?? 0) + it.quantity;
      o.timeline.push({ status: "return_requested", at, note: number });
    });
    await notify(customerId, "return_pickup_scheduled", { orderNumber: order.number, returnNumber: number });
    return created;
  });
}

/** Customer cancels before pickup: frees the quantities and any exchange hold. */
export async function cancelReturn(deps: ReturnDeps, customerId: string, returnNumber: string, now = new Date()) {
  const r = await deps.returns.get(returnNumber);
  if (!r || r.customerId !== customerId) throw new ReturnError("return_not_found", "Return not found.", 404);
  return deps.locks.run(`order:${r.orderNumber}`, async () => {
    const current = (await deps.returns.get(returnNumber))!;
    if (current.status !== "pickup_scheduled") throw new ReturnError("invalid_transition", "This return can no longer be cancelled.", 409);
    await deps.commerce.inventory.release(`exchange:${returnNumber}`);
    await deps.orders.update(current.orderNumber, (o) => {
      for (const it of current.items) o.returnedQty[it.lineId] = Math.max(0, (o.returnedQty[it.lineId] ?? 0) - it.quantity);
    });
    return deps.returns.update(returnNumber, (x) => {
      x.status = "cancelled";
      x.timeline.push({ status: "cancelled", at: now.toISOString() });
    });
  });
}

/**
 * RET-04 courier / warehouse progress: picked_up → QC passed (completes: refund / credit / exchange) or failed.
 * Called by courier webhooks and the warehouse (M7); the dev tool calls it locally.
 */
export async function advanceReturn(deps: ReturnDeps, returnNumber: string, to: "picked_up" | "qc_passed" | "qc_failed", now = new Date()) {
  const first = await deps.returns.get(returnNumber);
  if (!first) throw new ReturnError("return_not_found", "Return not found.", 404);
  return deps.locks.run(`order:${first.orderNumber}`, async () => {
    const r = (await deps.returns.get(returnNumber))!;
    const at = now.toISOString();
    if (to === "picked_up") {
      if (r.status !== "pickup_scheduled") throw new ReturnError("invalid_transition", "Not awaiting pickup.", 409);
      return deps.returns.update(returnNumber, (x) => {
        x.status = "picked_up";
        x.timeline.push({ status: "picked_up", at });
      });
    }
    if (r.status !== "picked_up") throw new ReturnError("invalid_transition", "Not picked up yet.", 409);
    const order = (await deps.orders.get(r.orderNumber))!;

    if (to === "qc_failed") {
      await deps.commerce.inventory.release(`exchange:${returnNumber}`);
      await deps.orders.update(order.number, (o) => {
        for (const it of r.items) o.returnedQty[it.lineId] = Math.max(0, (o.returnedQty[it.lineId] ?? 0) - it.quantity);
      });
      await notify(r.customerId, "return_rejected", { orderNumber: order.number, returnNumber });
      return deps.returns.update(returnNumber, (x) => {
        x.status = "qc_failed";
        x.timeline.push({ status: "qc_failed", at, note: "Item didn't pass the quality check and will be sent back to you." });
      });
    }

    // QC passed: returned units go back to stock; money / exchange is settled exactly once.
    const returnedItems = r.items.map((it) => {
      const line = order.lines.find((l) => l.lineId === it.lineId)!;
      return { productId: line.productId, size: line.size, quantity: it.quantity };
    });
    await deps.commerce.inventory.restock(`return:${returnNumber}`, returnedItems);
    const reference = `return:${returnNumber}`;
    let note = "";

    if (r.resolution === "exchange") {
      await deps.commerce.inventory.commit(`exchange:${returnNumber}`);
      note = "Exchange approved — your new size ships today.";
    } else if (r.refundTo === "store_credit") {
      await deps.credit.add({ customerId: r.customerId, amount: r.amounts.payable, reason: "return_credit", reference }, now);
      if (r.amounts.bonus > 0) {
        await deps.credit.add({ customerId: r.customerId, amount: r.amounts.bonus, reason: "return_bonus", reference: `${reference}:bonus` }, now);
      }
      await recordRefund(deps, order, reference, r.amounts.payable, "store_credit", "completed", now);
      note = "Store credit added to your account.";
    } else if (r.refundTo === "source") {
      const remaining = capturedAmount(order) - refundedAmount(order);
      const amount = Math.min(r.amounts.payable, remaining);
      if (amount > 0) {
        const attempt = order.attempts.find((a) => a.status === "succeeded")!;
        const { refundId } = await deps.gateway.refund(attempt.paymentId, amount, reference);
        await recordRefund(deps, order, reference, amount, "source", "processing", now, refundId);
      }
      note = "Refund started to your original payment method.";
    } else if (r.refundTo === "upi") {
      // COD refund payout to the customer's UPI ID — needs the payout API (M7); queued for ops.
      await recordRefund(deps, order, reference, r.amounts.payable, "upi", "payout_pending", now);
      note = "Refund queued to your UPI ID.";
    }

    const allReturned = order.lines.every((l) => (order.returnedQty[l.lineId] ?? 0) >= l.quantity);
    if (allReturned && order.fulfilment === "delivered") {
      await deps.orders.update(order.number, (o) => {
        o.fulfilment = "returned";
        o.timeline.push({ status: "returned", at });
      });
    }
    await deps.orders.update(order.number, (o) => o.timeline.push({ status: "return_completed", at, note: returnNumber }));
    await notify(r.customerId, "return_completed", { orderNumber: order.number, returnNumber });
    return deps.returns.update(returnNumber, (x) => {
      x.status = "completed";
      x.timeline.push({ status: "completed", at, note });
    });
  });
}

async function recordRefund(
  deps: ReturnDeps,
  order: Order,
  reference: string,
  amount: Paise,
  to: "source" | "upi" | "store_credit",
  status: "processing" | "completed" | "payout_pending",
  now: Date,
  id = `rf_${randomBytes(8).toString("hex")}`,
) {
  let added = false;
  await deps.orders.update(order.number, (o) => {
    if (o.refunds.some((x) => x.reference === reference)) return;
    added = true;
    o.refunds.push({ id, reference, amount, to, status, createdAt: now.toISOString() });
    o.timeline.push({ status: "refund", at: now.toISOString(), note: to === "store_credit" ? "Store credit issued" : to === "upi" ? "Refund to UPI queued" : "Refund to original payment method" });
  });  if (added) queueRefund(order, amount, reference);
}

/** What the customer sees (UPI ID masked). */
export function publicReturn(r: ReturnRequest) {
  return {
    number: r.number,
    orderNumber: r.orderNumber,
    items: r.items,
    reason: RETURN_REASONS[r.reason],
    resolution: r.resolution,
    refundTo: r.refundTo,
    upiId: r.upiId ? maskUpi(r.upiId) : null,
    pickup: { date: r.pickup.date, slot: r.pickup.slot, city: r.pickup.city, courier: r.pickup.courier, awb: r.pickup.awb },
    amounts: r.amounts,
    status: r.status,
    timeline: r.timeline,
    createdAt: r.createdAt,
  };
}
