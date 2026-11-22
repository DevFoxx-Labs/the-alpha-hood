import type { Paise } from "@/lib/format";
import { rupees } from "@/lib/format";

/**
 * PROMO-01 coupons: % or flat, minimum cart, max discount, first order only, per-customer limits, validity,
 * applicable categories, exclusions, prepaid-only. All maths in integer paise, server-side only.
 * DEMO coupons until the platform/CMS holds the real ones — only publish offers that are actually live.
 */
export interface Coupon {
  code: string;
  kind: "percent" | "flat";
  /** Percent (1–90) or flat amount in paise. */
  value: number;
  /** Minimum eligible subtotal (after combos), paise. */
  minCart: Paise;
  maxDiscount?: Paise;
  firstOrderOnly?: boolean;
  prepaidOnly?: boolean;
  /** Uses per customer (by verified phone). */
  perCustomerLimit?: number;
  /** Limit to these categories (else all). */
  categories?: string[];
  /** Units already discounted by a combo don't count towards or receive the coupon. */
  excludeComboItems?: boolean;
  description: string;
  startsAt?: string;
  endsAt?: string;
}

export const DEMO_COUPONS: Coupon[] = [
  { code: "ALPHA10", kind: "percent", value: 10, minCart: 0, maxDiscount: rupees(300), firstOrderOnly: true, perCustomerLimit: 1, excludeComboItems: true, description: "Extra 10% off your first order (up to ₹300)" },
  { code: "HOOD200", kind: "flat", value: rupees(200), minCart: rupees(1999), perCustomerLimit: 3, excludeComboItems: true, description: "₹200 off on orders above ₹1,999" },
  { code: "HOOD500", kind: "flat", value: rupees(500), minCart: rupees(3999), perCustomerLimit: 3, excludeComboItems: true, description: "₹500 off on orders above ₹3,999" },
  { code: "UPI150", kind: "flat", value: rupees(150), minCart: rupees(1499), prepaidOnly: true, perCustomerLimit: 2, description: "₹150 off on prepaid orders above ₹1,499" },
];

const CODE_RE = /^[A-Z0-9]{3,20}$/;

export function normaliseCouponCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

export function findCoupon(code: string, coupons: Coupon[] = DEMO_COUPONS): Coupon | null {
  return coupons.find((c) => c.code === code) ?? null;
}

export function isCouponLive(c: Coupon, now: Date): boolean {
  const t = now.getTime();
  if (c.startsAt && t < Date.parse(c.startsAt)) return false;
  if (c.endsAt && t >= Date.parse(c.endsAt)) return false;
  return true;
}

/** Discount in paise for an eligible subtotal; 0 when below the minimum. Never exceeds the subtotal. */
export function couponDiscount(c: Coupon, subtotal: Paise): Paise {
  if (!Number.isInteger(subtotal) || subtotal <= 0 || subtotal < c.minCart) return 0;
  let d = c.kind === "percent" ? Math.floor((subtotal * c.value) / 100) : c.value;
  if (c.maxDiscount !== undefined) d = Math.min(d, c.maxDiscount);
  return Math.min(d, subtotal);
}

export interface CouponLine {
  lineId: string;
  category: string;
  /** Line value after automatic + combo discounts. */
  value: Paise;
  /** Value of the line's units that are NOT in a combo bundle. */
  nonComboValue: Paise;
}

export interface CouponContext {
  lines: CouponLine[];
  /** null = not chosen yet (cart): prepaid-only coupons apply provisionally. */
  payment: "prepaid" | "cod" | null;
  /** null = guest (cart): first-order / limits are checked again at checkout. */
  customer: { orderCount: number; uses: number } | null;
  now: Date;
}

export type CouponEvaluation =
  | { ok: true; discount: Paise; allocations: Map<string, Paise>; provisional: string | null }
  | { ok: false; reason: string; shortBy?: Paise };

export function evaluateCoupon(c: Coupon, ctx: CouponContext): CouponEvaluation {
  if (!isCouponLive(c, ctx.now)) return { ok: false, reason: "This coupon has expired." };
  if (c.prepaidOnly && ctx.payment === "cod") return { ok: false, reason: "Valid on prepaid orders only." };
  if (ctx.customer) {
    if (c.firstOrderOnly && ctx.customer.orderCount > 0) return { ok: false, reason: "Valid on your first order only." };
    if (c.perCustomerLimit !== undefined && ctx.customer.uses >= c.perCustomerLimit) {
      return { ok: false, reason: "You've already used this coupon." };
    }
  }
  const eligible = ctx.lines
    .filter((l) => !c.categories || c.categories.includes(l.category))
    .map((l) => ({ lineId: l.lineId, value: c.excludeComboItems ? l.nonComboValue : l.value }))
    .filter((l) => l.value > 0);
  const base = eligible.reduce((n, l) => n + l.value, 0);
  if (base === 0) return { ok: false, reason: "No items in your bag are eligible for this coupon." };
  if (base < c.minCart) return { ok: false, reason: `Add items worth ₹${Math.ceil((c.minCart - base) / 100)} more to use this coupon.`, shortBy: c.minCart - base };

  const discount = couponDiscount(c, base);
  const allocations = new Map<string, Paise>();
  let allocated = 0;
  eligible.forEach((l, i) => {
    const share = i === eligible.length - 1 ? discount - allocated : Math.floor((discount * l.value) / base);
    allocated += share;
    allocations.set(l.lineId, share);
  });
  const notes: string[] = [];
  if (c.firstOrderOnly && !ctx.customer) notes.push("first order only — checked at checkout");
  if (c.prepaidOnly && ctx.payment === null) notes.push("prepaid orders only");
  return { ok: true, discount, allocations, provisional: notes.length ? notes.join("; ") : null };
}

/**
 * Best coupon for buying one unit at `price` (PDP-02). First-order coupons are included with their label
 * because a guest may be a first-time buyer; checkout re-validates eligibility.
 */
export function bestCouponFor(price: Paise, coupons: Coupon[] = DEMO_COUPONS, now = new Date()) {
  let best: { coupon: Coupon; discount: Paise; finalPrice: Paise } | null = null;
  for (const c of coupons) {
    if (!isCouponLive(c, now) || c.prepaidOnly) continue;
    const discount = couponDiscount(c, price);
    if (discount > 0 && (!best || discount > best.discount)) best = { coupon: c, discount, finalPrice: price - discount };
  }
  return best;
}
