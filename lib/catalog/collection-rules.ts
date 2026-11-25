import { percentOff } from "@/lib/format";
import type { Product, ProductAttributes } from "@/lib/commerce/types";

/**
 * PLP-07 rule-based collections as DATA (so they can live in a database and be edited later), evaluated by one
 * function for every backend. A rule is a small tree of conditions; unknown shapes never match (fail closed).
 */
export type CollectionRule =
  | { any: CollectionRule[] }
  | { all: CollectionRule[] }
  | { not: CollectionRule }
  | { badge: "NEW" | "BESTSELLER" }
  | { newWithinDays: number }
  | { minPopularity: number }
  | { minPercentOff: number }
  | { maxPrice: number }
  | { category: string[] }
  | { subcategory: string[] }
  | { attribute: keyof ProductAttributes; values: string[] }
  | { sizeInStock: string }
  /** Hand-picked products (admin "Add products" in a collection). */
  | { productIds: string[] };

const ATTRIBUTE_KEYS = new Set(["fit", "fabric", "sleeve", "pattern", "occasion"]);
const MAX_DEPTH = 6;

export function matchesRule(p: Product, rule: CollectionRule, now: number, depth = 0): boolean {
  if (depth > MAX_DEPTH || !rule || typeof rule !== "object") return false;
  const r = rule as Record<string, unknown>;
  if (Array.isArray(r.any)) return (r.any as CollectionRule[]).some((x) => matchesRule(p, x, now, depth + 1));
  if (Array.isArray(r.all)) return (r.all as CollectionRule[]).every((x) => matchesRule(p, x, now, depth + 1));
  if (r.not) return !matchesRule(p, r.not as CollectionRule, now, depth + 1);
  if (typeof r.badge === "string") return p.badge === r.badge;
  if (typeof r.newWithinDays === "number") return now - Date.parse(p.createdAt) < r.newWithinDays * 86_400_000;
  if (typeof r.minPopularity === "number") return p.popularity >= r.minPopularity;
  if (typeof r.minPercentOff === "number") return percentOff(p.price, p.mrp) >= r.minPercentOff;
  if (typeof r.maxPrice === "number") return p.price <= r.maxPrice;
  if (Array.isArray(r.category)) return (r.category as string[]).includes(p.category);
  if (Array.isArray(r.subcategory)) return !!p.subcategory && (r.subcategory as string[]).includes(p.subcategory);
  if (typeof r.attribute === "string" && Array.isArray(r.values)) {
    if (!ATTRIBUTE_KEYS.has(r.attribute)) return false;
    const v = p.attributes[r.attribute as keyof ProductAttributes];
    return !!v && (r.values as string[]).includes(v);
  }
  if (typeof r.sizeInStock === "string") return p.sizes.some((s) => s.label === r.sizeInStock && s.stock > 0);
  if (Array.isArray(r.productIds)) return (r.productIds as string[]).includes(p.id);
  return false;
}
