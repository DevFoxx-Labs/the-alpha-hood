import { randomBytes } from "node:crypto";
import type { Address } from "@/lib/checkout/address";
import type { Paise } from "@/lib/format";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import type { PaymentMethod, PriceBreakdown } from "@/lib/pricing/price-cart";

/**
 * Orders (CHK-09, ORD-01 statuses start here). In-memory for dev/preview; the platform / database replaces it.
 * Uniqueness that a database would enforce with UNIQUE indexes is enforced here too: order number,
 * (customer, idempotency key), gateway payment id, processed webhook event id.
 * Status changes go through `transition`, a conditional update (from → to) — never a blind write.
 */
export type OrderStatus = "pending_payment" | "payment_failed" | "expired" | "confirmed" | "needs_review";

/** ORD-01 fulfilment state machine (see lib/orders/lifecycle.ts for the allowed transitions). */
export type FulfilmentStatus =
  | "placed"
  | "confirmed"
  | "packed"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "rto"
  | "returned";

export interface TimelineEvent {
  status: FulfilmentStatus | "payment_failed" | "refund" | "return_requested" | "return_completed";
  at: string;
  note?: string;
}

export interface Refund {
  id: string;
  /** Idempotency reference, e.g. `cancel:AH…` or `return:RT…` (UNIQUE per order). */
  reference: string;
  amount: Paise;
  to: "source" | "upi" | "store_credit";
  status: "processing" | "completed" | "payout_pending";
  createdAt: string;
}

export interface OrderLine {
  lineId: string;
  productId: string;
  handle?: string;
  title: string;
  colour: string;
  size: string;
  quantity: number;
  image: { art: string; colour: string; alt: string };
  net: Paise;
  unitMrp: Paise;
  unitPrice: Paise;
  gstRate: number;
  gst: Paise;
}

export interface PaymentAttempt {
  paymentId: string;
  amount: Paise;
  status: "pending" | "succeeded" | "failed" | "expired";
  createdAt: string;
}

export interface Order {
  id: string;
  number: string;
  customerId: string;
  cartId: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  attempts: PaymentAttempt[];
  lines: OrderLine[];
  pricing: PriceBreakdown;
  address: Address;
  delivery: { speed: "standard" | "express"; by: string | null };
  couponCode: string | null;
  codRisk: { score: number; needsConfirmation: boolean } | null;
  idempotencyKey: string;
  createdAt: string;
  confirmedAt: string | null;
  notes: string[];
  fulfilment: FulfilmentStatus;
  timeline: TimelineEvent[];
  tracking: { courier: string; awb: string } | null;
  deliveredAt: string | null;
  refunds: Refund[];
  /** Units per line already returned or in an open return (prevents returning more than bought). */
  returnedQty: Record<string, number>;
  /** GST invoice, issued at dispatch (CHK-10). */
  invoice: { number: string; issuedAt: string } | null;
  /** ADM-03 on hold (e.g. high-risk COD awaiting confirmation): can't be packed. */
  hold?: { reason: string; by: string; at: string } | null;
}

export interface OrderStore {
  create(order: Omit<Order, "id" | "number">): Promise<Order>;
  get(number: string): Promise<Order | null>;
  byIdempotency(customerId: string, key: string): Promise<Order | null>;
  byPaymentId(paymentId: string): Promise<Order | null>;
  listByStatus(status: OrderStatus): Promise<Order[]>;
  listByCustomer(customerId: string): Promise<Order[]>;
  /** Recent orders for dev tools. */
  listRecent(limit: number): Promise<Order[]>;
  /** Next invoice number in the financial year's gap-free series (GST: unique and consecutive). */
  nextInvoiceNumber(financialYear: string): Promise<string>;
  /** Conditional update: applies only if the current status is in `from`. Returns the order or null. */
  transition(number: string, from: OrderStatus[], to: OrderStatus, patch?: (o: Order) => void): Promise<Order | null>;
  update(number: string, patch: (o: Order) => void): Promise<Order | null>;
  /** Records a webhook event id; false if already processed (UNIQUE). */
  markEvent(eventId: string): Promise<boolean>;
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function orderNumber(): string {
  const bytes = randomBytes(8);
  return `AH${Array.from(bytes, (b) => ALPHABET[b % 32]).join("")}`;
}

export function createMemoryOrderStore(): OrderStore {
  const orders = new Map<string, Order>();
  const idem = new Map<string, string>();
  const payments = new Map<string, string>();
  const events = new Set<string>();
  const invoiceSeq = new Map<string, number>();
  const clone = (o: Order): Order => structuredClone(o);

  return {
    async create(input) {
      const key = `${input.customerId}:${input.idempotencyKey}`;
      if (idem.has(key)) throw new Error("Duplicate idempotency key");
      let number = orderNumber();
      while (orders.has(number)) number = orderNumber();
      const order: Order = { ...structuredClone(input), id: `ord_${randomBytes(12).toString("hex")}`, number };
      orders.set(number, order);
      idem.set(key, number);
      for (const a of order.attempts) payments.set(a.paymentId, number);
      return clone(order);
    },
    async get(number) {
      const o = orders.get(number);
      return o ? clone(o) : null;
    },
    async byIdempotency(customerId, key) {
      const n = idem.get(`${customerId}:${key}`);
      return n ? clone(orders.get(n)!) : null;
    },
    async byPaymentId(paymentId) {
      const n = payments.get(paymentId);
      return n ? clone(orders.get(n)!) : null;
    },
    async listByStatus(status) {
      return [...orders.values()].filter((o) => o.status === status).map(clone);
    },
    async listByCustomer(customerId) {
      return [...orders.values()]
        .filter((o) => o.customerId === customerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(clone);
    },
    async listRecent(limit) {
      return [...orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(clone);
    },
    async nextInvoiceNumber(fy) {
      const n = (invoiceSeq.get(fy) ?? 0) + 1;
      invoiceSeq.set(fy, n);
      return `INV/${fy}/${String(n).padStart(6, "0")}`;
    },
    async transition(number, from, to, patch) {
      const o = orders.get(number);
      if (!o || !from.includes(o.status)) return null;
      o.status = to;
      patch?.(o);
      for (const a of o.attempts) payments.set(a.paymentId, number);
      return clone(o);
    },
    async update(number, patch) {
      const o = orders.get(number);
      if (!o) return null;
      patch(o);
      for (const a of o.attempts) {
        const owner = payments.get(a.paymentId);
        if (owner && owner !== number) throw new Error("Payment id already belongs to another order");
        payments.set(a.paymentId, number);
      }
      return clone(o);
    },
    async markEvent(eventId) {
      if (events.has(eventId)) return false;
      events.add(eventId);
      return true;
    },
  };
}

export function resolveOrders(env: Env = process.env): OrderStore {
  if (mockDataAllowed(env)) return devSingleton("order_store", createMemoryOrderStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Orders");
  };
  return {
    create: fail,
    get: fail,
    byIdempotency: fail,
    byPaymentId: fail,
    listByStatus: fail,
    listByCustomer: fail,
    listRecent: fail,
    nextInvoiceNumber: fail,
    transition: fail,
    update: fail,
    markEvent: fail,
  };
}

/** What the customer's browser may see (confirmation page). */
export function publicOrder(o: Order) {
  const lastAttempt = o.attempts.at(-1);
  return {
    number: o.number,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentMethod === "cod" ? "cod" : (lastAttempt?.status ?? "pending"),
    canRetryPayment: o.paymentMethod !== "cod" && (o.status === "payment_failed" || o.status === "expired"),
    lines: o.lines.map((l) => ({ title: l.title, colour: l.colour, size: l.size, quantity: l.quantity, image: l.image, net: l.net, handle: l.handle })),
    totals: {
      mrpTotal: o.pricing.mrpTotal,
      savings: o.pricing.savings,
      shipping: o.pricing.shipping,
      codFee: o.pricing.codFee,
      expressFee: o.pricing.expressFee,
      total: o.pricing.total,
      gst: o.pricing.gst.total,
    },
    delivery: o.delivery,
    address: { name: o.address.name, city: o.address.city, pincode: o.address.pincode },
    createdAt: o.createdAt,
  };
}
