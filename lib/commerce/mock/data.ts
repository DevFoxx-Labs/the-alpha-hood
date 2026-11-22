import { rupees } from "@/lib/format";
import type { Category, Colour, GarmentKind, Product, ProductBadge, SizeOption } from "../types";

/**
 * Demo catalogue — fictional products, prices and ratings for development only.
 * Replace with the real catalogue from the chosen commerce platform (PRD §4).
 */

const TOP_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const WAIST_SIZES = ["28", "30", "32", "34", "36", "38", "40"];
const SHOE_SIZES = ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"];

function sizes(labels: string[], soldOut: string[] = [], low: Record<string, number> = {}): SizeOption[] {
  return labels.map((label) => ({
    label,
    stock: soldOut.includes(label) ? 0 : (low[label] ?? 12),
  }));
}

type Row = {
  title: string;
  category: string;
  art: GarmentKind;
  colour: Colour;
  price: number;
  mrp: number;
  badge?: ProductBadge;
  rating?: { average: number; count: number };
  colours: Colour[];
  sizes: SizeOption[];
};

const c = (name: string, hex: string): Colour => ({ name, hex });

const ROWS: Row[] = [
  { title: "Heavyweight Oversized Tee — Jet Black", category: "t-shirts", art: "oversized", colour: c("Jet Black", "#1b1b1b"), price: 899, mrp: 1299, badge: "NEW", rating: { average: 4.6, count: 212 }, colours: [c("Jet Black", "#1b1b1b"), c("Bone", "#f2f0ea"), c("Olive", "#5b6b4e")], sizes: sizes(TOP_SIZES, ["XS"]) },
  { title: "Washed Baggy Jeans — Ice Blue", category: "jeans", art: "baggy", colour: c("Ice Blue", "#8fb3d1"), price: 2199, mrp: 2999, badge: "BESTSELLER", colours: [c("Ice Blue", "#8fb3d1"), c("Mid Blue", "#3e5c7a")], sizes: sizes(WAIST_SIZES, ["28"], { "34": 2 }) },
  { title: "Boxy Fit Corduroy Overshirt", category: "shirts", art: "shirt", colour: c("Tan", "#7a5230"), price: 1799, mrp: 2499, rating: { average: 4.6, count: 74 }, colours: [c("Tan", "#7a5230"), c("Forest", "#2f3a2a"), c("Sand", "#c8b79a")], sizes: sizes(TOP_SIZES) },
  { title: "Essential Zip Hoodie — Charcoal", category: "hoodies", art: "hoodie", colour: c("Charcoal", "#3a3a3c"), price: 1699, mrp: 2299, rating: { average: 4.4, count: 98 }, colours: [c("Charcoal", "#3a3a3c"), c("Slate", "#6d7a8a"), c("Oat", "#e9e4d8")], sizes: sizes(TOP_SIZES) },
  { title: "Relaxed Cargo Pants — Olive", category: "cargo-pants", art: "cargo", colour: c("Olive", "#59603f"), price: 1899, mrp: 2599, badge: "NEW", colours: [c("Olive", "#59603f"), c("Black", "#1b1b1b"), c("Khaki", "#c2b28f")], sizes: sizes(WAIST_SIZES) },
  { title: "Brushed Flannel Check Shirt — Slate Grey", category: "shirts", art: "check", colour: c("Slate Grey", "#5c6670"), price: 1299, mrp: 1799, badge: "BESTSELLER", rating: { average: 4.6, count: 128 }, colours: [c("Slate Grey", "#5c6670"), c("Maroon", "#7a2b2b"), c("Forest", "#3d5a40"), c("Sand", "#c8b79a")], sizes: sizes(TOP_SIZES, ["XS", "3XL"], { L: 2 }) },
  { title: "Cable Knit Polo Sweater — Cream", category: "sweaters", art: "sweater", colour: c("Cream", "#e8e1cf"), price: 1999, mrp: 2799, colours: [c("Cream", "#e8e1cf"), c("Navy", "#2b3a55")], sizes: sizes(TOP_SIZES) },
  { title: "Matte Puffer Jacket — Black", category: "jackets", art: "puffer", colour: c("Black", "#202020"), price: 3499, mrp: 4999, rating: { average: 4.7, count: 56 }, colours: [c("Black", "#202020"), c("Olive", "#4a5a3c")], sizes: sizes(TOP_SIZES, [], { M: 1 }) },
  { title: "Mandarin Collar Linen Shirt", category: "shirts", art: "shirt", colour: c("Stone", "#d9d3c3"), price: 1499, mrp: 1999, rating: { average: 4.5, count: 41 }, colours: [c("Stone", "#d9d3c3"), c("White", "#ffffff"), c("Sage", "#8aa0a8")], sizes: sizes(TOP_SIZES) },
  { title: "Straight Fit Raw Denim", category: "jeans", art: "jeans", colour: c("Raw Indigo", "#2d3f5a"), price: 1999, mrp: 2599, rating: { average: 4.6, count: 33 }, colours: [c("Raw Indigo", "#2d3f5a"), c("Black", "#1b1b1b")], sizes: sizes(WAIST_SIZES) },
  { title: "Varsity Knit Bomber", category: "jackets", art: "jacket", colour: c("Maroon", "#5a1f2a"), price: 2799, mrp: 3699, badge: "NEW", colours: [c("Maroon", "#5a1f2a"), c("Navy", "#1d2a44")], sizes: sizes(TOP_SIZES) },
  { title: "Retro Low-Top Sneakers", category: "sneakers", art: "sneaker", colour: c("Black", "#2a2a2a"), price: 2499, mrp: 3299, colours: [c("Black", "#2a2a2a"), c("Off White", "#f1efe9")], sizes: sizes(SHOE_SIZES, ["UK 11"]) },
  { title: "Pleated Korean Trousers — Beige", category: "trousers", art: "trouser", colour: c("Beige", "#c8b99b"), price: 1799, mrp: 2399, rating: { average: 4.6, count: 19 }, colours: [c("Beige", "#c8b99b"), c("Charcoal", "#3a3a3c"), c("Black", "#1b1b1b")], sizes: sizes(WAIST_SIZES) },
  { title: "Textured Knit Polo — Forest", category: "t-shirts", art: "polo", colour: c("Forest", "#2f4a3a"), price: 1299, mrp: 1699, colours: [c("Forest", "#2f4a3a"), c("Cream", "#e8e1cf")], sizes: sizes(TOP_SIZES) },
  { title: "Graphic Print Oversized Tee", category: "t-shirts", art: "oversized", colour: c("Bone", "#f2f0ea"), price: 999, mrp: 1399, colours: [c("Bone", "#f2f0ea"), c("Jet Black", "#1b1b1b")], sizes: sizes(TOP_SIZES, TOP_SIZES) },
  { title: "Aviator Sunglasses", category: "sunglasses", art: "shades", colour: c("Black", "#1b1b1b"), price: 999, mrp: 1499, colours: [c("Black", "#1b1b1b"), c("Tortoise", "#7a5230"), c("Gold", "#b8973a"), c("Silver", "#a8a8a8"), c("Green", "#2f4a3a")], sizes: sizes(["One size"]) },
  { title: "Six-Panel Logo Cap", category: "accessories", art: "cap", colour: c("Black", "#1b1b1b"), price: 599, mrp: 799, colours: [c("Black", "#1b1b1b")], sizes: sizes(["One size"]) },
  { title: "Essential Crew Tee — Off White", category: "t-shirts", art: "tee", colour: c("Off White", "#f4f2ec"), price: 999, mrp: 1299, colours: [c("Off White", "#f4f2ec")], sizes: sizes(TOP_SIZES) },
];

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/—/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const MOCK_PRODUCTS: Product[] = ROWS.map((row, i) => {
  const handle = slugify(row.title);
  return {
    id: `mock_${String(i + 1).padStart(3, "0")}`,
    handle,
    title: row.title,
    category: row.category,
    price: rupees(row.price),
    mrp: rupees(row.mrp),
    badge: row.badge,
    rating: row.rating,
    colour: row.colour,
    colours: row.colours,
    sizes: row.sizes,
    images: [
      { art: row.art, colour: row.colour.hex, alt: `${row.title}, front` },
      { art: row.art, colour: row.colours[1]?.hex ?? row.colour.hex, alt: `${row.title}, alternate view` },
    ],
  };
});

export const MOCK_CATEGORIES: Category[] = [
  { handle: "t-shirts", title: "Oversized Tees", image: { art: "oversized", colour: "#1b1b1b", alt: "Oversized tee" } },
  { handle: "shirts", title: "Shirts", image: { art: "check", colour: "#5c6670", alt: "Check shirt" } },
  { handle: "jeans", title: "Jeans", image: { art: "baggy", colour: "#8fb3d1", alt: "Baggy jeans" } },
  { handle: "hoodies", title: "Hoodies", image: { art: "hoodie", colour: "#3a3a3c", alt: "Hoodie" } },
  { handle: "jackets", title: "Jackets", image: { art: "jacket", colour: "#1b1b1b", alt: "Jacket" } },
  { handle: "cargo-pants", title: "Cargos", image: { art: "cargo", colour: "#59603f", alt: "Cargo pants" } },
];
