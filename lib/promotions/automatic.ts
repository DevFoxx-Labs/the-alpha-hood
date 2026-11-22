import type { Paise } from "@/lib/format";

/**
 * PROMO-02 automatic discounts (category sales) on top of catalogue sale prices (MRP vs selling price) and
 * the price-drop collection. Applied per unit before combos and coupons. None are live in the demo.
 */
export interface AutomaticDiscount {
  id: string;
  label: string;
  percent: number;
  categories: string[];
  startsAt?: string;
  endsAt?: string;
}

export const AUTOMATIC_DISCOUNTS: AutomaticDiscount[] = [];

export function automaticUnitDiscount(
  unitPrice: Paise,
  category: string,
  now: Date,
  rules: AutomaticDiscount[] = AUTOMATIC_DISCOUNTS,
): { discount: Paise; label: string | null } {
  let best = { discount: 0, label: null as string | null };
  const t = now.getTime();
  for (const r of rules) {
    if (!r.categories.includes(category)) continue;
    if ((r.startsAt && t < Date.parse(r.startsAt)) || (r.endsAt && t >= Date.parse(r.endsAt))) continue;
    const d = Math.floor((unitPrice * Math.min(Math.max(r.percent, 0), 90)) / 100);
    if (d > best.discount) best = { discount: d, label: r.label };
  }
  return best;
}

/** PROMO-03 prepaid offer: extra % off for the listed methods, capped. DEMO values. */
export const PREPAID_OFFER = { percent: 5, max: 15_000 as Paise, methods: ["upi"] as const, label: "Extra 5% off on UPI" };
