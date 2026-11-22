import type { MultiFilter } from "./types";

/** Display labels for filter values (slugs). Shared by the engine, filter UI and chips. */
export const FILTER_LABELS: Record<MultiFilter, string> = {
  size: "Size",
  fit: "Fit",
  colour: "Colour",
  fabric: "Fabric",
  sleeve: "Sleeve",
  pattern: "Pattern",
  occasion: "Occasion",
};

export const ATTRIBUTE_VALUES: Record<"fit" | "fabric" | "sleeve" | "pattern" | "occasion", Record<string, string>> = {
  fit: { regular: "Regular fit", slim: "Slim fit", oversized: "Oversized / boxy", relaxed: "Relaxed" },
  fabric: {
    cotton: "Cotton",
    linen: "Linen",
    denim: "Denim",
    corduroy: "Corduroy",
    fleece: "Fleece",
    knit: "Knit",
    nylon: "Nylon",
    viscose: "Viscose",
    "poly-viscose": "Poly-viscose",
    "wool-blend": "Wool blend",
  },
  sleeve: { full: "Full sleeve", half: "Half sleeve" },
  pattern: { solid: "Solid", checks: "Checks", printed: "Printed", textured: "Textured" },
  occasion: {
    casual: "Casual",
    "smart-casual": "Smart casual",
    office: "Office",
    party: "Party",
    winter: "Winterwear",
    lounge: "Lounge & gym",
  },
};

/** Colour filter families (reference/02: circles with labels). */
export const COLOUR_FAMILIES: Record<string, { label: string; hex: string }> = {
  black: { label: "Black", hex: "#141414" },
  white: { label: "White", hex: "#ffffff" },
  grey: { label: "Grey", hex: "#8a8a8a" },
  navy: { label: "Navy", hex: "#1d2a44" },
  blue: { label: "Blue", hex: "#8fb3d1" },
  green: { label: "Green", hex: "#2f4a3a" },
  olive: { label: "Olive", hex: "#59603f" },
  beige: { label: "Beige", hex: "#c8b99b" },
  brown: { label: "Brown", hex: "#7a5230" },
  maroon: { label: "Maroon", hex: "#5a1f2a" },
  cream: { label: "Cream", hex: "#e8e1cf" },
  multi: { label: "Multi", hex: "multi" },
};

/** Canonical size order (tops, waist, shoes, one size). */
export const SIZE_ORDER = [
  "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL",
  "28", "30", "32", "34", "36", "38", "40",
  "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11",
  "One size",
];

export function sizeSlug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "-");
}

export function sizeRank(label: string): number {
  const i = SIZE_ORDER.indexOf(label);
  return i === -1 ? SIZE_ORDER.length : i;
}

/** Label for any filter value, used by chips. Unknown values fall back to the slug. */
export function valueLabel(key: MultiFilter, value: string): string {
  if (key === "size") return SIZE_ORDER.find((s) => sizeSlug(s) === value) ?? value.toUpperCase();
  if (key === "colour") return COLOUR_FAMILIES[value]?.label ?? value;
  return ATTRIBUTE_VALUES[key][value] ?? value;
}
