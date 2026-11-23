import type { Product } from "@/lib/commerce/types";
import { LOOKS } from "@/lib/promotions/looks";

/**
 * PDP-09 recommendations, rule-based (no personal data, no tracking):
 * - Complete the look: the curated look this product belongs to (PROMO-05) first, then in-stock items from
 *   other categories that share the colour family or style tags — at most one per category.
 * - You may also like: in-stock styles from the same category, other styles first (no colour variants of
 *   the same style), closest price first.
 */
const inStock = (p: Product) => p.sizes.some((s) => s.stock > 0);
const NOT_OUTFIT = new Set(["sunglasses", "accessories"]);

export function completeTheLook(product: Product, all: Product[], limit = 4): Product[] {
  const look = LOOKS.find((l) => l.productIds.includes(product.id));
  const curated = look ? look.productIds.filter((id) => id !== product.id).map((id) => all.find((p) => p.id === id)).filter((p): p is Product => !!p && inStock(p)) : [];
  const usedCats = new Set([product.category, ...curated.map((p) => p.category)]);
  const score = (p: Product) => (p.colourFamily === product.colourFamily ? 2 : 0) + p.tags.filter((t) => product.tags.includes(t)).length + (NOT_OUTFIT.has(p.category) ? -1 : 0);
  const rest = all
    .filter((p) => inStock(p) && p.styleId !== product.styleId && !usedCats.has(p.category))
    .sort((a, b) => score(b) - score(a) || b.popularity - a.popularity);
  const picked = [...curated];
  for (const p of rest) {
    if (picked.length >= limit) break;
    if (usedCats.has(p.category)) continue;
    usedCats.add(p.category);
    picked.push(p);
  }
  return picked.slice(0, limit);
}

export function similarProducts(product: Product, all: Product[], limit = 8): Product[] {
  const seenStyles = new Set([product.styleId]);
  return all
    .filter((p) => p.category === product.category && inStock(p) && p.id !== product.id)
    .sort((a, b) => Math.abs(a.price - product.price) - Math.abs(b.price - product.price))
    .filter((p) => (seenStyles.has(p.styleId) ? false : (seenStyles.add(p.styleId), true)))
    .slice(0, limit);
}

export function lookFor(productId: string) {
  return LOOKS.find((l) => l.productIds.includes(productId)) ?? null;
}
