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
}

export interface OrderStore {
  create(order: Omit<Order, "id" | "number">): Promise<Order>;
  get(number: string): Promise<Order | null>;
  byIdempotency(customerId: string, key: string): Promise<Order | null>;
  byPaymentId(paymentId: string): Promise<Order | null>;
  listByStatus(status: OrderStatus): Promise<Order[]>;
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
  return { create: fail, get: fail, byIdempotency: fail, byPaymentId: fail, listByStatus: fail, transition: fail, update: fail, markEvent: fail };
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
