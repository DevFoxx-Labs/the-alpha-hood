import { randomBytes } from "node:crypto";
import { returnDeps } from "@/lib/account/service";
import { defaultDeps } from "@/lib/checkout/service";
import type { Customer } from "@/lib/customers/store";
import { isErased, resolveCustomers } from "@/lib/customers/store";
import type { Paise } from "@/lib/format";
import { capturedAmount, refundedAmount } from "@/lib/orders/lifecycle";
import { orderPayable } from "@/lib/orders/store";
import type { Order } from "@/lib/orders/store";
import { RETURN_REASONS } from "@/lib/returns/rules";
import { publicReturn, type ReturnRequest, resolveReturns } from "@/lib/returns/service";
import { resolveCredit } from "@/lib/wallet/store-credit";
import { MONEY_LIMITS, type Role } from "./permissions";

/** ADM-03…07 operations shared by the /api/admin routes. Authorization happens in the routes. */

export class OpsError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function maskPhone(phone: string | null): string {
  if (!phone) return "(no mobile)";
  return phone.startsWith("erased:") ? "(deleted)" : `${phone.slice(0, 3)} ••••• ${phone.slice(-4)}`;
}

// ── Orders ───────────────────────────────────────────────────────────────────────────────────────

export interface OrderFilter {
  q?: string;
  fulfilment?: string;
  payment?: string;
  status?: string;
  page?: number;
}

export const PAGE = 25;

export function orderRow(o: Order) {
  return {
    number: o.number,
    createdAt: o.createdAt,
    status: o.status,
    fulfilment: o.fulfilment,
    paymentMethod: o.paymentMethod,
    total: o.pricing.total,
    items: o.lines.reduce((n, l) => n + l.quantity, 0),
    city: o.address.city,
    pincode: o.address.pincode,
    hold: !!o.hold,
    codRisk: o.codRisk?.score ?? null,
    needsConfirmation: !!o.codRisk?.needsConfirmation && !o.notes.includes("cod_confirmed"),
  };
}

export async function listOrders(filter: OrderFilter) {
  const all = await defaultDeps().orders.listRecent(5_000);
  const q = (filter.q ?? "").trim().toUpperCase();
  const rows = all.filter(
    (o) =>
      (!q || o.number.includes(q) || o.address.pincode.includes(q) || o.address.name.toUpperCase().includes(q)) &&
      (!filter.fulfilment || o.fulfilment === filter.fulfilment) &&
      (!filter.payment || (filter.payment === "cod" ? o.paymentMethod === "cod" : o.paymentMethod !== "cod")) &&
      (!filter.status || o.status === filter.status),
  );
  const page = Math.max(1, Math.min(filter.page ?? 1, 1000));
  return { rows: rows.slice((page - 1) * PAGE, page * PAGE).map(orderRow), total: rows.length, page, pageSize: PAGE };
}

export async function orderAdminView(number: string) {
  const deps = defaultDeps();
  const o = await deps.orders.get(number);
  if (!o) return null;
  const customer = await deps.customers.get(o.customerId);
  const returns = await resolveReturns().listByOrder(number);
  return {
    ...orderRow(o),
    lines: o.lines.map((l) => ({ lineId: l.lineId, title: l.title, size: l.size, quantity: l.quantity, net: l.net, image: l.image, productId: l.productId })),
    pricing: o.pricing,
    address: o.address,
    delivery: o.delivery,
    tracking: o.tracking,
    invoice: o.invoice,
    timeline: o.timeline,
    refunds: o.refunds,
    attempts: o.attempts.map((a) => ({ status: a.status, amount: a.amount, createdAt: a.createdAt })),
    notes: o.notes,
    holdInfo: o.hold ?? null,
    paid: capturedAmount(o),
    refunded: refundedAmount(o),
    payable: orderPayable(o),
    tenders: o.tenders ? { coins: o.tenders.coins, giftCardLast4: o.tenders.giftCard?.last4 ?? null, giftCard: o.tenders.giftCard?.amount ?? 0, storeCredit: o.tenders.storeCredit, total: o.tenders.total } : null,
    customer: customer
      ? { id: customer.id, phone: maskPhone(customer.phone), name: customer.name, orderCount: customer.orderCount, rtoCount: customer.rtoCount, codBlocked: customer.codBlocked }
      : null,
    returns: returns.map(publicReturn),
  };
}

export async function setHold(number: string, hold: boolean, by: string, reason: string) {
  const deps = defaultDeps();
  return deps.locks.run(`order:${number}`, async () => {
    const o = await deps.orders.get(number);
    if (!o || o.status !== "confirmed") throw new OpsError(404, "order_not_found", "Order not found.");
    if (hold && !["confirmed", "placed"].includes(o.fulfilment)) throw new OpsError(409, "invalid_state", "Only orders not yet packed can be held.");
    return deps.orders.update(number, (x) => {
      x.hold = hold ? { reason, by, at: new Date().toISOString() } : null;
      if (!hold && x.codRisk?.needsConfirmation && !x.notes.includes("cod_confirmed")) x.notes.push("cod_confirmed");
    });
  });
}

// ── Returns & refunds ────────────────────────────────────────────────────────────────────────────

export async function listReturns(status?: string) {
  const list = await resolveReturns().listRecent(1_000);
  return list
    .filter((r) => !status || r.status === status)
    .map((r: ReturnRequest) => ({
      number: r.number,
      orderNumber: r.orderNumber,
      status: r.status,
      resolution: r.resolution,
      refundTo: r.refundTo,
      reason: RETURN_REASONS[r.reason],
      items: r.items.reduce((n, i) => n + i.quantity, 0),
      payable: r.amounts.payable,
      pickupDate: r.pickup.date,
      photos: r.photoIds.length,
      createdAt: r.createdAt,
    }));
}

/** COD refunds queued to UPI (payout_pending) across orders. UPI ids are shown masked. */
export async function listPayouts() {
  const orders = await defaultDeps().orders.listRecent(5_000);
  const returns = await resolveReturns().listRecent(5_000);
  return orders.flatMap((o) =>
    o.refunds
      .filter((r) => r.status === "payout_pending")
      .map((r) => {
        const ret = returns.find((x) => r.reference === `return:${x.number}`);
        return { orderNumber: o.number, refundId: r.id, amount: r.amount, createdAt: r.createdAt, upi: ret?.upiId ? publicReturn(ret).upiId : null };
      }),
  );
}

/** Marks a queued UPI refund as paid (UTR from the bank / payout API). Role money limit applies. */
export async function markPayoutPaid(role: Role, orderNumber: string, refundId: string, utr: string) {
  const deps = defaultDeps();
  return deps.locks.run(`order:${orderNumber}`, async () => {
    const o = await deps.orders.get(orderNumber);
    const r = o?.refunds.find((x) => x.id === refundId);
    if (!o || !r) throw new OpsError(404, "not_found", "Refund not found.");
    if (r.status !== "payout_pending") throw new OpsError(409, "already_paid", "This refund is already marked paid.");
    const limit = MONEY_LIMITS[role]?.refund ?? 0;
    if (r.amount > limit) throw new OpsError(403, "over_limit", "This refund is above your limit — an owner or finance must approve it.");
    await deps.orders.update(orderNumber, (x) => {
      const ref = x.refunds.find((y) => y.id === refundId)!;
      ref.status = "completed";
      x.timeline.push({ status: "refund", at: new Date().toISOString(), note: `UPI refund paid (UTR ${utr})` });
    });
    return r.amount;
  });
}

// ── Customers ────────────────────────────────────────────────────────────────────────────────────

export function customerRow(c: Customer) {
  return {
    id: c.id,
    name: c.name,
    phone: maskPhone(c.phone),
    email: c.email ? c.email.replace(/^(.{2}).*(@.*)$/, "$1•••$2") : null,
    orderCount: c.orderCount,
    rtoCount: c.rtoCount,
    codBlocked: c.codBlocked,
    createdAt: c.createdAt,
  };
}

export async function customerAdminView(id: string) {
  const c = await resolveCustomers().get(id);
  if (!c || isErased(c)) return null;
  const orders = await defaultDeps().orders.listByCustomer(id);
  const returns = await resolveReturns().listByCustomer(id);
  const credit = resolveCredit();
  return {
    ...customerRow(c),
    addresses: c.addresses.map((a) => ({ id: a.id, city: a.city, state: a.state, pincode: a.pincode, type: a.type })),
    orders: orders.map(orderRow),
    returns: returns.map((r) => ({ number: r.number, orderNumber: r.orderNumber, status: r.status, resolution: r.resolution, reason: RETURN_REASONS[r.reason] })),
    storeCredit: { balance: await credit.balance(id), history: await credit.history(id) },
  };
}

/** Store credit adjustment; the reason is recorded in the audit log by the route. */
export async function adjustCredit(role: Role, customerId: string, amount: Paise) {
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 10_000_000) throw new OpsError(422, "invalid_input", "Enter a non-zero amount.");
  const limit = MONEY_LIMITS[role]?.credit ?? 0;
  if (Math.abs(amount) > limit) throw new OpsError(403, "over_limit", "This adjustment is above your limit — an owner must make it.");
  const c = await resolveCustomers().get(customerId);
  if (!c || isErased(c)) throw new OpsError(404, "not_found", "Customer not found.");
  try {
    return await resolveCredit().add({ customerId, amount, reason: "adjustment", reference: `adj:${randomBytes(8).toString("hex")}` });
  } catch (e) {
    throw new OpsError(422, "invalid_input", e instanceof Error ? e.message : "Couldn't adjust.");
  }
}

// ── Reports (ADM-07) ─────────────────────────────────────────────────────────────────────────────

function istDay(iso: string): string {
  return new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);
}

export async function reports(days = 14, now = new Date()) {
  const deps = defaultDeps();
  const orders = (await deps.orders.listRecent(10_000)).filter((o) => o.status === "confirmed");
  const since = now.getTime() - days * 86_400_000;
  const recent = orders.filter((o) => Date.parse(o.createdAt) >= since);
  const byDay = new Map<string, { orders: number; revenue: number }>();
  for (let i = days - 1; i >= 0; i--) byDay.set(istDay(new Date(now.getTime() - i * 86_400_000).toISOString()), { orders: 0, revenue: 0 });
  for (const o of recent) {
    const d = byDay.get(istDay(o.createdAt));
    if (d) {
      d.orders += 1;
      d.revenue += o.pricing.total;
    }
  }
  const revenue = recent.reduce((n, o) => n + o.pricing.total, 0);
  const cod = recent.filter((o) => o.paymentMethod === "cod");
  const returns = await resolveReturns().listRecent(10_000);
  const reasons = new Map<string, number>();
  for (const r of returns) reasons.set(RETURN_REASONS[r.reason], (reasons.get(RETURN_REASONS[r.reason]) ?? 0) + 1);
  const categories = new Map<string, { units: number; revenue: number }>();
  const rd = await returnDeps(recent.flatMap((o) => o.lines.map((l) => l.productId)));
  for (const o of recent)
    for (const l of o.lines) {
      const cat = rd.categoryOf(l.productId) ?? "other";
      const c = categories.get(cat) ?? { units: 0, revenue: 0 };
      c.units += l.quantity;
      c.revenue += l.net;
      categories.set(cat, c);
    }
  return {
    days,
    orders: recent.length,
    revenue,
    aov: recent.length ? Math.round(revenue / recent.length) : 0,
    codShare: recent.length ? Math.round((cod.length / recent.length) * 100) : 0,
    rto: recent.filter((o) => o.fulfilment === "rto").length,
    gst: recent.reduce((n, o) => n + o.pricing.gst.total, 0),
    byDay: [...byDay].map(([day, v]) => ({ day, ...v })),
    returnReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    categories: [...categories].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.revenue - a.revenue),
  };
}

/** CSV cell: quoted, and formula-leading characters neutralised (CSV injection) — one rule, lib/security. */
export { csvCell } from "@/lib/security/csv-cell";
import { csvCell } from "@/lib/security/csv-cell";

export async function ordersCsv(days = 30, now = new Date()) {
  const since = now.getTime() - days * 86_400_000;
  const orders = (await defaultDeps().orders.listRecent(10_000)).filter((o) => Date.parse(o.createdAt) >= since);
  const head = ["order", "date", "status", "fulfilment", "payment", "items", "total_inr", "gst_inr", "cgst_inr", "sgst_inr", "igst_inr", "ship_state", "pincode", "invoice"];
  const rows = orders.map((o) => [
    o.number,
    o.createdAt,
    o.status,
    o.fulfilment,
    o.paymentMethod,
    o.lines.reduce((n, l) => n + l.quantity, 0),
    (o.pricing.total / 100).toFixed(2),
    (o.pricing.gst.total / 100).toFixed(2),
    (o.pricing.gst.cgst / 100).toFixed(2),
    (o.pricing.gst.sgst / 100).toFixed(2),
    (o.pricing.gst.igst / 100).toFixed(2),
    o.address.state,
    o.address.pincode,
    o.invoice?.number ?? "",
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
