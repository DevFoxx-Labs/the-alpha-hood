import type { Product } from "@/lib/commerce/types";
import type { Order } from "@/lib/orders/store";

/**
 * PDP-04 size recommendation from the customer's own history (no new data collected): sizes they KEPT in the
 * same size-chart family (tops / bottoms / shoes), nudged one size up or down if their returns for that family
 * say "too small" / "too large". Returns null when there's nothing to go on. Explained to the shopper.
 */
export interface SizeAdvice {
  size: string;
  basis: "kept" | "kept_adjusted";
  from: number;
}

export function adviseSize(
  target: Pick<Product, "sizeChart" | "sizes">,
  orders: Pick<Order, "lines" | "returnedQty" | "deliveredAt">[],
  chartOf: (productId: string) => Product["sizeChart"] | undefined,
  returns: { productId: string; reason: string }[],
): SizeAdvice | null {
  if (target.sizeChart === "none") return null;
  const labels = target.sizes.map((s) => s.label);
  const kept = new Map<string, number>();
  for (const o of orders) {
    if (!o.deliveredAt) continue;
    for (const l of o.lines) {
      if (chartOf(l.productId) !== target.sizeChart || !labels.includes(l.size)) continue;
      const left = l.quantity - (o.returnedQty[l.lineId] ?? 0);
      if (left > 0) kept.set(l.size, (kept.get(l.size) ?? 0) + left);
    }
  }
  if (kept.size === 0) return null;
  const [best, count] = [...kept.entries()].sort((a, b) => b[1] - a[1] || labels.indexOf(a[0]) - labels.indexOf(b[0]))[0];
  const family = returns.filter((r) => chartOf(r.productId) === target.sizeChart);
  const small = family.filter((r) => r.reason === "too_small").length;
  const large = family.filter((r) => r.reason === "too_large").length;
  const i = labels.indexOf(best);
  const shift = small > large ? 1 : large > small ? -1 : 0;
  const j = Math.min(labels.length - 1, Math.max(0, i + shift));
  return { size: labels[j], basis: j === i ? "kept" : "kept_adjusted", from: count };
}
