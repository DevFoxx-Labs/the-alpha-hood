import { ATTRIBUTE_VALUES } from "@/lib/catalog/attributes";
import { percentOff, rupees } from "@/lib/format";
import { generateReviews } from "@/lib/reviews/mock-generate";
import { summarise } from "@/lib/reviews/summary";
import type { Review } from "@/lib/reviews/types";
import type {
  Category,
  CategoryNode,
  Collection,
  GarmentKind,
  Product,
  ProductAttributes,
  ProductBadge,
  SizeOption,
} from "../types";

/**
 * Demo catalogue — fictional styles, prices, stock and ratings for development only.
 * Each style group expands to one product per colour (every colour is its own URL — PDP-03).
 * Replace with the real catalogue from the chosen commerce platform (PRD §4).
 */

const TOP = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const WAIST = ["28", "30", "32", "34", "36", "38", "40"];
const SHOES = ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"];
const ONE = ["One size"];

interface SizeSpec {
  labels: string[];
  soldOut?: string[];
  low?: Record<string, number>;
}

function sizes({ labels, soldOut = [], low = {} }: SizeSpec): SizeOption[] {
  return labels.map((label) => ({ label, stock: soldOut.includes(label) ? 0 : (low[label] ?? 12) }));
}

interface ColourSpec {
  name: string;
  hex: string;
  family: string;
  /** Per-colour stock override. */
  sizes?: SizeSpec;
}

interface Group {
  base: string;
  category: string;
  subcategory?: string;
  art: GarmentKind;
  price: number;
  mrp: number;
  attributes: ProductAttributes;
  colours: ColourSpec[];
  sizes: SizeSpec;
  badge?: ProductBadge;
  rating?: { average: number; count: number };
  tags?: string[];
  /** Days before 2026-11-22 the style went live. */
  age: number;
  desc?: string;
  collar?: string;
  model?: { height: string; size: string };
}

const col = (name: string, hex: string, family: string, sizeSpec?: SizeSpec): ColourSpec => ({ name, hex, family, sizes: sizeSpec });

const GROUPS: Group[] = [
  // T-shirts
  { base: "Heavyweight Oversized Tee", desc: "A 240 GSM cotton tee with dropped shoulders and a boxy body. Holds its shape wash after wash.", collar: "Crew neck", model: { height: "6'0\"", size: "L" }, category: "t-shirts", subcategory: "oversized", art: "oversized", price: 899, mrp: 1299, badge: "NEW", rating: { average: 4.6, count: 212 }, age: 3, attributes: { fit: "oversized", fabric: "cotton", sleeve: "half", pattern: "solid", occasion: "casual" }, colours: [col("Jet Black", "#1b1b1b", "black"), col("Bone", "#f2f0ea", "cream"), col("Olive", "#5b6b4e", "olive")], sizes: { labels: TOP, soldOut: ["XS"] }, tags: ["streetwear", "drop shoulder", "240 gsm"] },
  { base: "Graphic Print Oversized Tee", category: "t-shirts", subcategory: "oversized", art: "oversized", price: 999, mrp: 1399, age: 20, attributes: { fit: "oversized", fabric: "cotton", sleeve: "half", pattern: "printed", occasion: "casual" }, colours: [col("Jet Black", "#1b1b1b", "black"), col("Bone", "#f2f0ea", "cream", { labels: TOP, soldOut: TOP })], sizes: { labels: TOP }, tags: ["graphic", "streetwear"] },
  { base: "Essential Crew Tee", collar: "Crew neck", category: "t-shirts", subcategory: "crew", art: "tee", price: 699, mrp: 999, rating: { average: 4.3, count: 64 }, age: 60, attributes: { fit: "regular", fabric: "cotton", sleeve: "half", pattern: "solid", occasion: "casual" }, colours: [col("Off White", "#f4f2ec", "white"), col("Navy", "#1d2a44", "navy"), col("Black", "#1b1b1b", "black"), col("Grey Melange", "#9a9a9a", "grey")], sizes: { labels: TOP }, tags: ["basic", "plain", "round neck"] },
  { base: "Textured Knit Polo", collar: "Polo", category: "t-shirts", subcategory: "polos", art: "polo", price: 1299, mrp: 1699, age: 9, attributes: { fit: "regular", fabric: "knit", sleeve: "half", pattern: "textured", occasion: "smart-casual" }, colours: [col("Forest", "#2f4a3a", "green"), col("Cream", "#e8e1cf", "cream")], sizes: { labels: TOP } },
  { base: "Pique Polo", collar: "Polo", category: "t-shirts", subcategory: "polos", art: "polo", price: 999, mrp: 1499, rating: { average: 4.4, count: 38 }, age: 75, attributes: { fit: "slim", fabric: "cotton", sleeve: "half", pattern: "solid", occasion: "smart-casual" }, colours: [col("Navy", "#1d2a44", "navy"), col("White", "#ffffff", "white"), col("Maroon", "#5a1f2a", "maroon")], sizes: { labels: TOP, low: { M: 2 } } },
  // Shirts
  { base: "Brushed Flannel Check Shirt", desc: "A soft brushed flannel in a muted check, cut in a relaxed regular fit with a spread collar, chest pocket and curved hem. Layer it open over a tee or button it up for a smart-casual look.", collar: "Spread", model: { height: "6'0\"", size: "M" }, category: "shirts", subcategory: "checks", art: "check", price: 1299, mrp: 1799, badge: "BESTSELLER", rating: { average: 4.6, count: 128 }, age: 40, attributes: { fit: "regular", fabric: "cotton", sleeve: "full", pattern: "checks", occasion: "casual" }, colours: [col("Slate Grey", "#5c6670", "grey"), col("Maroon", "#7a2b2b", "maroon"), col("Forest", "#3d5a40", "green"), col("Sand", "#c8b79a", "beige")], sizes: { labels: TOP, soldOut: ["XS", "3XL"], low: { L: 2 } }, tags: ["flannel", "plaid"] },
  { base: "Boxy Fit Corduroy Overshirt", collar: "Camp", model: { height: "5'10\"", size: "M" }, category: "shirts", subcategory: "overshirts", art: "shirt", price: 1799, mrp: 2499, rating: { average: 4.6, count: 74 }, age: 30, attributes: { fit: "oversized", fabric: "corduroy", sleeve: "full", pattern: "solid", occasion: "casual" }, colours: [col("Tan", "#7a5230", "brown"), col("Forest", "#2f3a2a", "green"), col("Sand", "#c8b79a", "beige")], sizes: { labels: TOP }, tags: ["shacket", "cord"] },
  { base: "Mandarin Collar Linen Shirt", collar: "Mandarin", model: { height: "6'1\"", size: "M" }, category: "shirts", subcategory: "linen", art: "shirt", price: 1499, mrp: 1999, rating: { average: 4.5, count: 41 }, age: 55, attributes: { fit: "regular", fabric: "linen", sleeve: "full", pattern: "solid", occasion: "smart-casual" }, colours: [col("Stone", "#d9d3c3", "beige"), col("White", "#ffffff", "white"), col("Sage", "#8aa0a8", "green")], sizes: { labels: TOP }, tags: ["chinese collar", "band collar", "summer"] },
  { base: "Oxford Formal Shirt", collar: "Button-down", category: "shirts", subcategory: "formal", art: "shirt", price: 1399, mrp: 1899, rating: { average: 4.4, count: 52 }, age: 90, attributes: { fit: "slim", fabric: "cotton", sleeve: "full", pattern: "solid", occasion: "office" }, colours: [col("White", "#ffffff", "white"), col("Sky Blue", "#a9c4e0", "blue"), col("Black", "#1b1b1b", "black")], sizes: { labels: TOP }, tags: ["office", "work"] },
  { base: "Cuban Collar Printed Shirt", collar: "Cuban", category: "shirts", subcategory: "printed", art: "shirt", price: 1199, mrp: 1699, badge: "NEW", age: 2, attributes: { fit: "relaxed", fabric: "viscose", sleeve: "half", pattern: "printed", occasion: "party" }, colours: [col("Black", "#1b1b1b", "black"), col("Maroon", "#5a1f2a", "maroon")], sizes: { labels: TOP }, tags: ["resort", "camp collar", "party wear"] },
  // Jeans
  { base: "Washed Baggy Jeans", desc: "Rigid cotton denim with a light vintage wash, a high rise and a wide, straight leg that stacks over sneakers.", model: { height: "5'11\"", size: "32" }, category: "jeans", subcategory: "baggy", art: "baggy", price: 2199, mrp: 2999, badge: "BESTSELLER", rating: { average: 4.5, count: 176 }, age: 25, attributes: { fit: "relaxed", fabric: "denim", pattern: "solid", occasion: "casual" }, colours: [col("Ice Blue", "#8fb3d1", "blue"), col("Mid Blue", "#3e5c7a", "blue")], sizes: { labels: WAIST, soldOut: ["28"], low: { "34": 2 } }, tags: ["wide leg", "streetwear"] },
  { base: "Straight Fit Raw Denim", category: "jeans", subcategory: "straight", art: "jeans", price: 1999, mrp: 2599, rating: { average: 4.6, count: 33 }, age: 45, attributes: { fit: "regular", fabric: "denim", pattern: "solid", occasion: "casual" }, colours: [col("Raw Indigo", "#2d3f5a", "navy"), col("Black", "#1b1b1b", "black")], sizes: { labels: WAIST } },
  { base: "Slim Tapered Jeans", category: "jeans", subcategory: "slim", art: "jeans", price: 1799, mrp: 2399, age: 70, attributes: { fit: "slim", fabric: "denim", pattern: "solid", occasion: "casual" }, colours: [col("Light Blue", "#9fbcd6", "blue"), col("Charcoal", "#3a3a3c", "grey")], sizes: { labels: WAIST } },
  // Trousers, cargos, joggers, shorts
  { base: "Pleated Korean Trousers", category: "trousers", subcategory: "korean", art: "trouser", price: 1799, mrp: 2399, rating: { average: 4.6, count: 19 }, age: 15, attributes: { fit: "relaxed", fabric: "poly-viscose", pattern: "solid", occasion: "smart-casual" }, colours: [col("Beige", "#c8b99b", "beige"), col("Charcoal", "#3a3a3c", "grey"), col("Black", "#1b1b1b", "black")], sizes: { labels: WAIST }, tags: ["pleated", "wide leg"] },
  { base: "Stretch Chinos", category: "trousers", subcategory: "chinos", art: "trouser", price: 1499, mrp: 1999, rating: { average: 4.3, count: 27 }, age: 80, attributes: { fit: "slim", fabric: "cotton", pattern: "solid", occasion: "office" }, colours: [col("Khaki", "#c2b28f", "beige"), col("Navy", "#1d2a44", "navy"), col("Olive", "#59603f", "olive")], sizes: { labels: WAIST } },
  { base: "Relaxed Cargo Pants", category: "cargo-pants", art: "cargo", price: 1899, mrp: 2599, badge: "NEW", age: 4, attributes: { fit: "relaxed", fabric: "cotton", pattern: "solid", occasion: "casual" }, colours: [col("Olive", "#59603f", "olive"), col("Black", "#1b1b1b", "black"), col("Khaki", "#c2b28f", "beige")], sizes: { labels: WAIST }, tags: ["utility", "streetwear"] },
  { base: "Fleece Joggers", category: "joggers", art: "trouser", price: 1299, mrp: 1799, age: 35, attributes: { fit: "regular", fabric: "fleece", pattern: "solid", occasion: "lounge" }, colours: [col("Grey Melange", "#9a9a9a", "grey"), col("Black", "#1b1b1b", "black")], sizes: { labels: TOP }, tags: ["track pants", "gym"] },
  { base: "Nylon Cargo Shorts", category: "shorts", art: "cargo", price: 999, mrp: 1399, age: 100, attributes: { fit: "relaxed", fabric: "nylon", pattern: "solid", occasion: "casual" }, colours: [col("Black", "#1b1b1b", "black"), col("Olive", "#59603f", "olive")], sizes: { labels: WAIST } },
  // Hoodies, sweaters, jackets
  { base: "Essential Zip Hoodie", collar: "Hooded", category: "hoodies", art: "hoodie", price: 1699, mrp: 2299, rating: { average: 4.4, count: 98 }, age: 28, attributes: { fit: "regular", fabric: "fleece", sleeve: "full", pattern: "solid", occasion: "winter" }, colours: [col("Charcoal", "#3a3a3c", "grey"), col("Slate", "#6d7a8a", "grey"), col("Oat", "#e9e4d8", "cream")], sizes: { labels: TOP } },
  { base: "Heavyweight Oversized Hoodie", collar: "Hooded", model: { height: "6'0\"", size: "L" }, category: "hoodies", art: "hoodie", price: 1999, mrp: 2799, badge: "BESTSELLER", rating: { average: 4.7, count: 143 }, age: 22, attributes: { fit: "oversized", fabric: "fleece", sleeve: "full", pattern: "solid", occasion: "winter" }, colours: [col("Black", "#1b1b1b", "black"), col("Maroon", "#5a1f2a", "maroon")], sizes: { labels: TOP, low: { XL: 1 } }, tags: ["sweatshirt", "streetwear"] },
  { base: "Cable Knit Polo Sweater", collar: "Polo", category: "sweaters", art: "sweater", price: 1999, mrp: 2799, age: 12, attributes: { fit: "regular", fabric: "knit", sleeve: "full", pattern: "textured", occasion: "winter" }, colours: [col("Cream", "#e8e1cf", "cream"), col("Navy", "#2b3a55", "navy")], sizes: { labels: TOP } },
  { base: "Matte Puffer Jacket", category: "jackets", subcategory: "puffers", art: "puffer", price: 3499, mrp: 4999, rating: { average: 4.7, count: 56 }, age: 8, attributes: { fit: "regular", fabric: "nylon", sleeve: "full", pattern: "solid", occasion: "winter" }, colours: [col("Black", "#202020", "black"), col("Olive", "#4a5a3c", "olive")], sizes: { labels: TOP, low: { M: 1 } } },
  { base: "Varsity Knit Bomber", category: "jackets", subcategory: "bombers", art: "jacket", price: 2799, mrp: 3699, badge: "NEW", age: 5, attributes: { fit: "regular", fabric: "wool-blend", sleeve: "full", pattern: "solid", occasion: "winter" }, colours: [col("Maroon", "#5a1f2a", "maroon"), col("Navy", "#1d2a44", "navy")], sizes: { labels: TOP } },
  { base: "Denim Trucker Jacket", category: "jackets", subcategory: "denim", art: "jacket", price: 2499, mrp: 3299, age: 50, attributes: { fit: "regular", fabric: "denim", sleeve: "full", pattern: "solid", occasion: "casual" }, colours: [col("Mid Blue", "#3e5c7a", "blue"), col("Black", "#1b1b1b", "black")], sizes: { labels: TOP } },
  // Footwear & accessories
  { base: "Retro Low-Top Sneakers", category: "sneakers", art: "sneaker", price: 2499, mrp: 3299, age: 18, attributes: { occasion: "casual" }, colours: [col("Black", "#2a2a2a", "black"), col("Off White", "#f1efe9", "white")], sizes: { labels: SHOES, soldOut: ["UK 11"] }, tags: ["shoes", "trainers"] },
  { base: "Aviator Sunglasses", category: "sunglasses", art: "shades", price: 999, mrp: 1499, age: 65, attributes: { occasion: "casual" }, colours: [col("Black", "#1b1b1b", "black"), col("Tortoise", "#7a5230", "brown"), col("Silver", "#a8a8a8", "grey")], sizes: { labels: ONE }, tags: ["uv protection", "shades"] },
  { base: "Six-Panel Logo Cap", category: "accessories", art: "cap", price: 599, mrp: 799, age: 85, attributes: { occasion: "casual" }, colours: [col("Black", "#1b1b1b", "black"), col("Beige", "#c8b99b", "beige")], sizes: { labels: ONE }, tags: ["baseball cap"] },
];

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/—/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const NOW = Date.parse("2026-11-22T00:00:00Z");
const styleIdOf = (gi: number) => `style_${String(gi + 1).padStart(2, "0")}`;

/** DEMO reviews per style (lib/reviews/mock-generate.ts). Styles without a `rating` seed have none (category fallback). */
export const MOCK_REVIEWS: Review[] = GROUPS.flatMap((g, gi) =>
  g.rating
    ? generateReviews({
        styleId: styleIdOf(gi),
        category: g.category,
        variants: g.colours.map((c) => ({ handle: slugify(`${g.base} ${c.name}`), hex: c.hex })),
        art: g.art,
        sizes: g.sizes.labels,
        count: Math.min(g.rating.count, 60),
        targetAverage: g.rating.average,
        seed: gi + 1,
        now: NOW,
      })
    : [],
);

const REVIEWS_BY_STYLE = new Map<string, Review[]>();
for (const r of MOCK_REVIEWS) REVIEWS_BY_STYLE.set(r.styleId, [...(REVIEWS_BY_STYLE.get(r.styleId) ?? []), r]);

export const MOCK_PRODUCTS: Product[] = GROUPS.flatMap((g, gi) => {
  const handles = g.colours.map((c) => slugify(`${g.base} ${c.name}`));
  const swatches = g.colours.map((c, i) => ({ name: c.name, hex: c.hex, handle: handles[i] }));
  const styleId = styleIdOf(gi);
  const rating = summarise(REVIEWS_BY_STYLE.get(styleId) ?? []);
  return g.colours.map((c, ci): Product => {
    const title = `${g.base} — ${c.name}`;
    return {
      id: `mock_${String(gi + 1).padStart(2, "0")}${String(ci + 1)}`,
      handle: handles[ci],
      title,
      category: g.category,
      subcategory: g.subcategory,
      price: rupees(g.price),
      mrp: rupees(g.mrp),
      badge: g.badge,
      rating: rating ? { average: rating.average, count: rating.count } : undefined,
      colour: swatches[ci],
      colours: swatches,
      sizes: sizes(c.sizes ?? g.sizes),
      images: (["front", "model", "back", "detail"] as const).map((view) => ({
        art: g.art,
        colour: c.hex,
        view,
        alt: `${title}, ${view === "model" ? "on model" : view === "detail" ? "fabric close-up" : view}`,
      })),
      attributes: g.attributes,
      colourFamily: c.family,
      createdAt: new Date(NOW - (g.age * 24 + ci) * 3_600_000).toISOString(),
      popularity: Math.round((g.rating?.count ?? 10) * (g.rating?.average ?? 4)) + (g.badge === "BESTSELLER" ? 600 : 0) - ci * 5,
      tags: g.tags ?? [],
      styleId,
      sku: `AH-${g.category.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase()}-${String(gi + 1).padStart(3, "0")}-${slugify(c.name).slice(0, 3).toUpperCase()}`,
      description: g.desc ?? describe(g),
      specs: specsFor(g),
      sizeChart: chartFor(g),
      model: g.model,
      legal: {
        manufacturer: "[TO BE PROVIDED: manufacturer name & address]",
        packer: "[TO BE PROVIDED: packer name & address]",
        countryOfOrigin: "[TO BE PROVIDED: country of origin]",
        netQuantity: g.category === "sneakers" ? "1 pair" : "1 N (one piece)",
      },
    };
  });
});

function describe(g: Group): string {
  const fit = g.attributes.fit ? ATTRIBUTE_VALUES.fit[g.attributes.fit].toLowerCase() : "";
  const fabric = g.attributes.fabric ? ATTRIBUTE_VALUES.fabric[g.attributes.fabric].toLowerCase() : "";
  const lead = [fit, g.base.toLowerCase()].filter(Boolean).join(" ");
  return `A ${lead}${fabric ? ` in ${fabric}` : ""}. Made for everyday wear and easy to style with the rest of your rotation.`;
}

function specsFor(g: Group): { label: string; value: string }[] {
  const a = g.attributes;
  const rows: { label: string; value: string }[] = [];
  if (a.fit) rows.push({ label: "Fit", value: ATTRIBUTE_VALUES.fit[a.fit] });
  if (a.fabric) rows.push({ label: "Fabric", value: ATTRIBUTE_VALUES.fabric[a.fabric] });
  if (g.collar) rows.push({ label: "Collar", value: g.collar });
  if (a.sleeve) rows.push({ label: "Sleeve", value: ATTRIBUTE_VALUES.sleeve[a.sleeve] });
  if (a.pattern) rows.push({ label: "Pattern", value: ATTRIBUTE_VALUES.pattern[a.pattern] });
  const wipe = ["sneakers", "sunglasses", "accessories"].includes(g.category);
  const hand = a.fabric === "wool-blend" || a.fabric === "knit";
  rows.push({ label: "Wash care", value: wipe ? "Wipe clean" : hand ? "Hand wash cold, dry flat" : "Machine wash cold, inside out" });
  return rows;
}

function chartFor(g: Group): Product["sizeChart"] {
  if (g.sizes.labels === TOP) return "tops";
  if (g.sizes.labels === WAIST) return "bottoms";
  if (g.sizes.labels === SHOES) return "shoes";
  return "none";
}

const img = (art: GarmentKind, colour: string, alt: string) => ({ art, colour, alt });

/** Category pages (PLP-01). Categories without products show the empty state (PLP-06). */
export const MOCK_CATEGORY_TREE: CategoryNode[] = [
  { handle: "shirts", title: "Shirts", image: img("check", "#5c6670", "Shirts"), subcategories: [
    { handle: "checks", title: "Checks", image: img("check", "#5c6670", "Check shirts") },
    { handle: "linen", title: "Linen", image: img("shirt", "#d9d3c3", "Linen shirts") },
    { handle: "overshirts", title: "Overshirts", image: img("shirt", "#7a5230", "Overshirts") },
    { handle: "formal", title: "Formal", image: img("shirt", "#ffffff", "Formal shirts") },
    { handle: "printed", title: "Printed", image: img("shirt", "#5a1f2a", "Printed shirts") },
  ] },
  { handle: "t-shirts", title: "T-shirts", image: img("oversized", "#1b1b1b", "T-shirts"), subcategories: [
    { handle: "oversized", title: "Oversized", image: img("oversized", "#1b1b1b", "Oversized tees") },
    { handle: "crew", title: "Crew neck", image: img("tee", "#f4f2ec", "Crew neck tees") },
    { handle: "polos", title: "Polos", image: img("polo", "#2f4a3a", "Polos") },
  ] },
  { handle: "jeans", title: "Jeans", image: img("baggy", "#8fb3d1", "Jeans"), subcategories: [
    { handle: "baggy", title: "Baggy", image: img("baggy", "#8fb3d1", "Baggy jeans") },
    { handle: "straight", title: "Straight", image: img("jeans", "#2d3f5a", "Straight jeans") },
    { handle: "slim", title: "Slim", image: img("jeans", "#9fbcd6", "Slim jeans") },
  ] },
  { handle: "trousers", title: "Trousers", image: img("trouser", "#c8b99b", "Trousers"), subcategories: [
    { handle: "korean", title: "Korean", image: img("trouser", "#c8b99b", "Korean trousers") },
    { handle: "chinos", title: "Chinos", image: img("trouser", "#c2b28f", "Chinos") },
  ] },
  { handle: "cargo-pants", title: "Cargo pants", image: img("cargo", "#59603f", "Cargo pants"), subcategories: [] },
  { handle: "joggers", title: "Joggers", image: img("trouser", "#9a9a9a", "Joggers"), subcategories: [] },
  { handle: "hoodies", title: "Hoodies", image: img("hoodie", "#3a3a3c", "Hoodies"), subcategories: [] },
  { handle: "sweaters", title: "Sweaters", image: img("sweater", "#e8e1cf", "Sweaters"), subcategories: [] },
  { handle: "jackets", title: "Jackets", image: img("jacket", "#1b1b1b", "Jackets"), subcategories: [
    { handle: "puffers", title: "Puffers", image: img("puffer", "#202020", "Puffer jackets") },
    { handle: "bombers", title: "Bombers", image: img("jacket", "#5a1f2a", "Bomber jackets") },
    { handle: "denim", title: "Denim", image: img("jacket", "#3e5c7a", "Denim jackets") },
  ] },
  { handle: "co-ords", title: "Co-ords", image: img("shirt", "#c8b99b", "Co-ords"), subcategories: [] },
  { handle: "shorts", title: "Shorts", image: img("cargo", "#1b1b1b", "Shorts"), subcategories: [] },
  { handle: "sneakers", title: "Sneakers", image: img("sneaker", "#2a2a2a", "Sneakers"), subcategories: [] },
  { handle: "sunglasses", title: "Sunglasses", image: img("shades", "#1b1b1b", "Sunglasses"), subcategories: [] },
  { handle: "accessories", title: "Accessories", image: img("cap", "#1b1b1b", "Accessories"), subcategories: [] },
];

/** HOME-02 rail. */
export const MOCK_CATEGORIES: Category[] = [
  { handle: "t-shirts", title: "Oversized Tees", href: "/men/t-shirts/oversized", image: img("oversized", "#1b1b1b", "Oversized tee") },
  { handle: "shirts", title: "Shirts", image: img("check", "#5c6670", "Check shirt") },
  { handle: "jeans", title: "Jeans", image: img("baggy", "#8fb3d1", "Baggy jeans") },
  { handle: "hoodies", title: "Hoodies", image: img("hoodie", "#3a3a3c", "Hoodie") },
  { handle: "jackets", title: "Jackets", image: img("jacket", "#1b1b1b", "Jacket") },
  { handle: "cargo-pants", title: "Cargos", image: img("cargo", "#59603f", "Cargo pants") },
];

const BOTTOMS = new Set(["jeans", "trousers", "cargo-pants", "joggers"]);
const has3xl = (p: Product) => p.sizes.some((s) => s.label === "3XL" && s.stock > 0);
const isNew = (p: Product) => p.badge === "NEW" || NOW - Date.parse(p.createdAt) < 21 * 86_400_000;

/** Rule-based collections (PLP-07 auto-collections). Linked from the header, menu and homepage. */
export const MOCK_COLLECTIONS: (Collection & { rule: (p: Product) => boolean })[] = [
  { handle: "new-in", title: "New in", description: "Fresh drops from the last three weeks.", rule: isNew },
  { handle: "bestsellers", title: "Bestsellers", description: "What everyone is wearing right now.", rule: (p) => p.badge === "BESTSELLER" || p.popularity >= 300 },
  { handle: "sale", title: "Sale", description: "30% off or more.", rule: (p) => percentOff(p.price, p.mrp) >= 30 },
  { handle: "price-drop", title: "Price drop", description: "Styles with a recent price drop.", rule: (p) => percentOff(p.price, p.mrp) >= 30 },
  { handle: "winter-drop", title: "Winter drop", description: "Puffers, knits and heavyweight hoodies.", rule: (p) => p.attributes.occasion === "winter" },
  { handle: "winter-edit", title: "Winter edit", description: "Layers for the cold.", rule: (p) => p.attributes.occasion === "winter" },
  { handle: "puffer-season", title: "Puffer season", description: "Warmth with an attitude.", rule: (p) => p.category === "jackets" },
  { handle: "knit-club", title: "Knit club", description: "Texture that talks.", rule: (p) => p.attributes.fabric === "knit" || p.attributes.fabric === "wool-blend" },
  { handle: "smart-casuals", title: "Smart casuals", description: "Monday to Friday, sorted.", rule: (p) => p.attributes.occasion === "smart-casual" || p.attributes.occasion === "office" },
  { handle: "office-ready", title: "Office ready", description: "Sharp without trying too hard.", rule: (p) => p.attributes.occasion === "office" },
  { handle: "streetwear", title: "Streetwear", description: "Oversized, relaxed and loud.", rule: (p) => p.attributes.fit === "oversized" || p.attributes.fit === "relaxed" },
  { handle: "weekend-uniform", title: "Weekend uniform", description: "Relaxed cargos, boxy overshirts and heavyweight tees.", rule: (p) => p.attributes.occasion === "casual" && p.category !== "sunglasses" && p.category !== "accessories" },
  { handle: "under-999", title: "Under ₹999", description: "Everything at ₹999 or less.", rule: (p) => p.price <= rupees(999) },
  { handle: "plus-size", title: "Plus size", description: "Styles available in 3XL.", rule: has3xl },
  { handle: "combos", title: "Combos", description: "Mix-and-match eligible styles.", rule: (p) => BOTTOMS.has(p.category) || p.category === "hoodies" || p.category === "t-shirts" },
  { handle: "combo-bottoms", title: "Combo: bottoms", description: "Mix-and-match eligible bottoms.", rule: (p) => BOTTOMS.has(p.category) },
  { handle: "combo-hoodies", title: "Combo: hoodies", description: "Mix-and-match eligible hoodies.", rule: (p) => p.category === "hoodies" },
  { handle: "combo-tees", title: "Combo: tees", description: "Mix-and-match eligible tees.", rule: (p) => p.category === "t-shirts" && p.subcategory !== "polos" },
];
