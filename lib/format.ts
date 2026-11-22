/**
 * Money is always an integer number of paise (PRD §13: all price maths in paise).
 * Display follows DESIGN.md §6: `₹1,299` with Indian digit grouping, `28% OFF` rounded down.
 */
export type Paise = number;

const inrWhole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inrFraction = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function rupees(amount: number): Paise {
  if (!Number.isFinite(amount)) throw new RangeError("amount must be finite");
  return Math.round(amount * 100);
}

export function formatINR(paise: Paise): string {
  if (!Number.isInteger(paise)) throw new RangeError("paise must be an integer");
  const sign = paise < 0 ? "−" : "";
  const abs = Math.abs(paise);
  const body = abs % 100 === 0 ? inrWhole.format(abs / 100) : inrFraction.format(abs / 100);
  return `${sign}₹${body}`;
}

/** Whole-percent discount of `price` against `mrp`, rounded down. 0 when there is no discount. */
export function percentOff(price: Paise, mrp: Paise): number {
  if (mrp <= 0 || price >= mrp) return 0;
  return Math.floor(((mrp - price) * 100) / mrp);
}

/** Progress towards a free-shipping threshold, for the mini-cart / bag bar. */
export function freeShippingProgress(subtotal: Paise, threshold: Paise) {
  const remaining = Math.max(0, threshold - subtotal);
  const ratio = threshold <= 0 ? 1 : Math.min(1, subtotal / threshold);
  return { remaining, ratio, unlocked: remaining === 0 };
}
