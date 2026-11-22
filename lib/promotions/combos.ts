import { rupees, type Paise } from "@/lib/format";

/**
 * PROMO-04 combos / bundles: mix & match within an eligible set, priced as a bundle. The discount is split
 * across the bundled units in proportion to their price (needed for GST and partial returns).
 * DEMO combos — publish only offers that are actually live.
 */
export interface Combo {
  id: string;
  title: string;
  /** Units per bundle. */
  size: number;
  /** Bundle price in paise. */
  price: Paise;
  /** Collection that lists eligible styles (the offer tile links here). */
  collection: string;
  eligible: (p: { category: string; subcategory?: string }) => boolean;
  startsAt?: string;
  endsAt?: string;
}

const BOTTOMS = new Set(["jeans", "trousers", "cargo-pants", "joggers"]);

export const COMBOS: Combo[] = [
  { id: "any-2-bottoms", title: "Any 2 bottoms for ₹2,999", size: 2, price: rupees(2999), collection: "combo-bottoms", eligible: (p) => BOTTOMS.has(p.category) },
  { id: "3-tees", title: "Any 3 tees for ₹1,999", size: 3, price: rupees(1999), collection: "combo-tees", eligible: (p) => p.category === "t-shirts" && p.subcategory !== "polos" },
  { id: "2-hoodies", title: "2 hoodies for ₹2,499", size: 2, price: rupees(2499), collection: "combo-hoodies", eligible: (p) => p.category === "hoodies" },
];

export interface ComboUnitInput {
  lineId: string;
  unitPrice: Paise;
  quantity: number;
  category: string;
  subcategory?: string;
}

export interface ComboApplication {
  comboId: string;
  title: string;
  bundles: number;
  discount: Paise;
}

export interface ComboResult {
  /** Discount per line id (sum over its units). */
  lineDiscounts: Map<string, Paise>;
  /** Units of each line that ended up in a bundle. */
  lineBundledUnits: Map<string, number>;
  applications: ComboApplication[];
  /** CART-03 nudge: units in an incomplete bundle. */
  progress: { comboId: string; title: string; have: number; need: number; collection: string }[];
}

function live(c: Combo, now: Date) {
  const t = now.getTime();
  return !(c.startsAt && t < Date.parse(c.startsAt)) && !(c.endsAt && t >= Date.parse(c.endsAt));
}

/**
 * Greedy: for each combo, take eligible unused units most-expensive first, in groups of `size`. A group is
 * bundled only if it actually saves money. Each unit is used by at most one combo.
 */
export function applyCombos(lines: ComboUnitInput[], combos: Combo[] = COMBOS, now = new Date()): ComboResult {
  const units = lines.flatMap((l) => Array.from({ length: l.quantity }, () => ({ ...l, used: false })));
  const lineDiscounts = new Map<string, Paise>();
  const lineBundledUnits = new Map<string, number>();
  const applications: ComboApplication[] = [];
  const progress: ComboResult["progress"] = [];

  for (const combo of combos) {
    if (!live(combo, now)) continue;
    const pool = units.filter((u) => !u.used && combo.eligible(u)).sort((a, b) => b.unitPrice - a.unitPrice);
    let bundles = 0;
    let comboDiscount = 0;
    let i = 0;
    for (; i + combo.size <= pool.length; i += combo.size) {
      const group = pool.slice(i, i + combo.size);
      const sum = group.reduce((n, u) => n + u.unitPrice, 0);
      if (sum <= combo.price) break; // sorted desc: later groups can't save either
      const discount = sum - combo.price;
      let allocated = 0;
      group.forEach((u, gi) => {
        const share = gi === group.length - 1 ? discount - allocated : Math.floor((discount * u.unitPrice) / sum);
        allocated += share;
        u.used = true;
        lineBundledUnits.set(u.lineId, (lineBundledUnits.get(u.lineId) ?? 0) + 1);
        lineDiscounts.set(u.lineId, (lineDiscounts.get(u.lineId) ?? 0) + share);
      });
      bundles += 1;
      comboDiscount += discount;
    }
    if (bundles) applications.push({ comboId: combo.id, title: combo.title, bundles, discount: comboDiscount });
    const leftover = pool.length - i;
    if (leftover > 0 && leftover < combo.size) {
      progress.push({ comboId: combo.id, title: combo.title, have: leftover, need: combo.size - leftover, collection: combo.collection });
    }
  }
  return { lineDiscounts, lineBundledUnits, applications, progress };
}
