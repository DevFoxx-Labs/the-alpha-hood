import type { SummaryRow } from "@/components/store/order-summary";
import type { PriceBreakdown } from "@/lib/pricing/price-cart";

/** CART-02 / CHK-05 breakdown rows from the server's PriceBreakdown (labels only — no maths here). */
export function priceRows(p: PriceBreakdown, { showFees = true }: { showFees?: boolean } = {}): SummaryRow[] {
  const rows: SummaryRow[] = [{ label: "Total MRP", amount: p.mrpTotal }];
  if (p.saleDiscount) rows.push({ label: "Discount on MRP", amount: p.saleDiscount, discount: true });
  if (p.automaticDiscount) rows.push({ label: "Sale discount", amount: p.automaticDiscount, discount: true });
  for (const c of p.combos) rows.push({ label: `Combo · ${c.title}`, amount: c.discount, discount: true });
  for (const l of p.looks ?? []) rows.push({ label: `Shop the look · ${l.title}`, amount: l.discount, discount: true });
  if (p.coupon?.ok && p.couponDiscount) rows.push({ label: `Coupon (${p.coupon.code})`, amount: p.couponDiscount, discount: true });
  if (p.prepaidDiscount) rows.push({ label: "UPI offer", amount: p.prepaidDiscount, discount: true });
  rows.push(p.shipping === 0 ? { label: "Shipping", amount: 0, freeLabel: "FREE" } : { label: "Shipping", amount: p.shipping });
  if (showFees && p.expressFee) rows.push({ label: "Express delivery", amount: p.expressFee });
  if (showFees && p.codFee) rows.push({ label: "Cash on delivery fee", amount: p.codFee });
  return rows;
}
