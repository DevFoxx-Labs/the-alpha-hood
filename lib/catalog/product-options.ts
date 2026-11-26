import type { GarmentKind, SizeChartKind } from "@/lib/commerce/types";

/** Fixed choices of the product form, shared by the server validator and the admin UI (client-safe). */
export const GARMENT_KINDS: readonly GarmentKind[] = ["tee", "oversized", "shirt", "check", "hoodie", "jacket", "puffer", "sweater", "jeans", "baggy", "cargo", "trouser", "sneaker", "shades", "cap", "polo"];
export const SIZE_CHARTS: readonly SizeChartKind[] = ["tops", "bottoms", "shoes", "none"];

/** Category / subcategory slug → the placeholder drawing a new product starts with (until photos are uploaded). */
const DEFAULT_ART: Record<string, GarmentKind> = {
  "t-shirts": "tee", crew: "tee", oversized: "oversized", polos: "polo",
  shirts: "shirt", linen: "shirt", formal: "shirt", printed: "shirt", overshirts: "shirt", checks: "check",
  hoodies: "hoodie", sweaters: "sweater",
  jackets: "jacket", bombers: "jacket", denim: "jacket", puffers: "puffer",
  jeans: "jeans", slim: "jeans", straight: "jeans", baggy: "baggy",
  trousers: "trouser", chinos: "trouser", joggers: "trouser", korean: "trouser", "cargo-pants": "cargo", shorts: "cargo",
  sneakers: "sneaker", sunglasses: "shades", accessories: "cap",
};

/** The most specific match wins (subcategory, then category); unknown categories get the plain tee. */
export function defaultArt(category: unknown, subcategory?: unknown): GarmentKind {
  for (const slug of [subcategory, category]) {
    if (typeof slug === "string" && Object.hasOwn(DEFAULT_ART, slug)) return DEFAULT_ART[slug];
  }
  return "tee";
}
