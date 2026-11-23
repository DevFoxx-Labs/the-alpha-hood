import { STORE_CONFIG } from "@/lib/config/store";
import { rupees, type Paise } from "@/lib/format";
import type { Order, OrderLine } from "@/lib/orders/store";

/**
 * RET-03 configurable return rules. DEMO values — confirm with the owner and keep the Refund & Cancellation
 * Policy (lib/legal/notices/refund.ts) in sync.
 */
export const RETURN_RULES = {
  windowDays: STORE_CONFIG.returnWindowDays,
  damageReportHours: STORE_CONFIG.damageReportHours,
  /** Hygiene / final-sale categories (shown on the PDP before purchase). */
  nonReturnableCategories: ["sunglasses", "accessories", "innerwear", "perfumes"],
  /** Fee per return after the customer's first free return; never for damaged / wrong items. */
  returnFee: rupees(99) as Paise,
  storeCreditBonusPercent: 5,
  maxPhotos: 3,
};

export const RETURN_REASONS = {
  too_small: "Size too small",
  too_large: "Size too large",
  didnt_like: "Didn't like it",
  not_as_pictured: "Looks different from the photos",
  damaged: "Damaged or defective",
  wrong_item: "Wrong item delivered",
} as const;
export type ReturnReason = keyof typeof RETURN_REASONS;

/** Reasons that need photos, a report within 24 h, and are always free. */
export const FAULT_REASONS: ReturnReason[] = ["damaged", "wrong_item"];

export interface LineEligibility {
  lineId: string;
  returnableQty: number;
  reason: string | null;
}

export function lineCategory(line: OrderLine, categoryOf: (productId: string) => string | undefined): string {
  return categoryOf(line.productId) ?? "";
}

/** Per-line eligibility for a return request right now. */
/** RET-01: 7 days by default; Alpha Club members get the window stored on the order at placement (30 days). */
export function windowDaysFor(order: Pick<Order, "club">): number {
  return order.club?.returnWindowDays ?? RETURN_RULES.windowDays;
}

export function returnEligibility(order: Order, categoryOf: (productId: string) => string | undefined, now = new Date()): {
  open: boolean;
  closesAt: string | null;
  reason: string | null;
  lines: LineEligibility[];
} {
  if (order.fulfilment !== "delivered" || !order.deliveredAt) {
    return { open: false, closesAt: null, reason: "Returns open once your order is delivered.", lines: [] };
  }
  const days = windowDaysFor(order);
  const closes = Date.parse(order.deliveredAt) + days * 86_400_000;
  const closesAt = new Date(closes).toISOString();
  if (now.getTime() > closes) return { open: false, closesAt, reason: `The ${days}-day return window has closed.`, lines: [] };
  const lines = order.lines.map((l) => {
    const left = l.quantity - (order.returnedQty[l.lineId] ?? 0);
    if (RETURN_RULES.nonReturnableCategories.includes(lineCategory(l, categoryOf))) {
      return { lineId: l.lineId, returnableQty: 0, reason: "Not returnable for hygiene reasons." };
    }
    return { lineId: l.lineId, returnableQty: Math.max(0, left), reason: left > 0 ? null : "Already returned." };
  });
  return { open: lines.some((l) => l.returnableQty > 0), closesAt, reason: null, lines };
}

/** Value of `qty` units of a line (its net share incl. all discounts); the last unit takes the remainder. */
export function unitsValue(line: Pick<OrderLine, "net" | "quantity">, qty: number, alreadyReturned: number): Paise {
  if (qty <= 0) return 0;
  const per = Math.floor(line.net / line.quantity);
  const remainder = line.net - per * line.quantity;
  const includesLast = alreadyReturned + qty === line.quantity;
  return per * qty + (includesLast ? remainder : 0);
}
