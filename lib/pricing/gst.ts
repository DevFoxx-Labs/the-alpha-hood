import { rupees, type Paise } from "@/lib/format";

/**
 * CHK-10 GST on tax-inclusive prices. Rate by HSN class and per-piece value slab; CGST+SGST when the
 * warehouse and ship-to states match, IGST otherwise.
 *
 * ⚠ DEMO rate table and warehouse state — GST rates on apparel/footwear depend on the per-piece sale value and
 * change with notifications. CONFIRM EVERY VALUE WITH THE CA before launch (PRD CHK-10, docs/owner-todo.md).
 */
export type GstClass = "apparel" | "footwear" | "eyewear" | "headwear";

export const GST_CONFIG: {
  warehouseState: string;
  classes: Record<GstClass, { hsn: string; slabs: { upTo: Paise | null; rate: number }[] }>;
} = {
  warehouseState: "Maharashtra",
  classes: {
    apparel: { hsn: "61/62", slabs: [{ upTo: rupees(2500), rate: 5 }, { upTo: null, rate: 18 }] },
    footwear: { hsn: "6404", slabs: [{ upTo: rupees(2500), rate: 5 }, { upTo: null, rate: 18 }] },
    eyewear: { hsn: "9004", slabs: [{ upTo: null, rate: 18 }] },
    headwear: { hsn: "6505", slabs: [{ upTo: null, rate: 5 }] },
  },
};

export function gstClassFor(category: string): GstClass {
  if (category === "sneakers") return "footwear";
  if (category === "sunglasses") return "eyewear";
  if (category === "accessories") return "headwear";
  return "apparel";
}

export function rateFor(cls: GstClass, perPieceValue: Paise): number {
  for (const slab of GST_CONFIG.classes[cls].slabs) {
    if (slab.upTo === null || perPieceValue <= slab.upTo) return slab.rate;
  }
  return GST_CONFIG.classes[cls].slabs.at(-1)!.rate;
}

/** Tax contained in a tax-inclusive amount: amount × r / (100 + r), rounded to the paisa. */
export function inclusiveTax(amount: Paise, rate: number): Paise {
  if (amount <= 0) return 0;
  return Math.round((amount * rate) / (100 + rate));
}

export function splitTax(tax: Paise, intraState: boolean) {
  if (!intraState) return { cgst: 0, sgst: 0, igst: tax };
  const cgst = Math.floor(tax / 2);
  return { cgst, sgst: tax - cgst, igst: 0 };
}

export function isIntraState(shipState: string | null | undefined): boolean {
  return !!shipState && shipState.toLowerCase() === GST_CONFIG.warehouseState.toLowerCase();
}
