import type { SizeChartKind } from "@/lib/commerce/types";

/**
 * PDP-03 size guide tables, garment measurements in cm (inches derived). DEMO values — replace with the
 * brand's measured spec sheets per style before launch (sizing drives returns, PRD §14).
 */
export interface SizeChart {
  title: string;
  columns: string[];
  rows: { size: string; values: number[] }[];
  howToMeasure: { label: string; text: string }[];
  /** Shoes are not converted to inches. */
  unitless?: boolean;
}

export const SIZE_CHARTS: Record<Exclude<SizeChartKind, "none">, SizeChart> = {
  tops: {
    title: "Tops",
    columns: ["Chest", "Length", "Shoulder"],
    rows: [
      { size: "XS", values: [96, 68, 43] },
      { size: "S", values: [101, 70, 44.5] },
      { size: "M", values: [106, 72, 46] },
      { size: "L", values: [111, 74, 47.5] },
      { size: "XL", values: [116, 76, 49] },
      { size: "XXL", values: [121, 78, 50.5] },
      { size: "3XL", values: [127, 80, 52] },
    ],
    howToMeasure: [
      { label: "Chest", text: "Lay the garment flat and measure straight across, armpit to armpit, then double it." },
      { label: "Length", text: "From the highest point of the shoulder down to the hem." },
      { label: "Shoulder", text: "Straight across the back, from one shoulder seam to the other." },
    ],
  },
  bottoms: {
    title: "Bottoms",
    columns: ["Waist", "Hip", "Inseam"],
    rows: [
      { size: "28", values: [72, 96, 76] },
      { size: "30", values: [77, 101, 76] },
      { size: "32", values: [82, 106, 77] },
      { size: "34", values: [87, 111, 77] },
      { size: "36", values: [92, 116, 78] },
      { size: "38", values: [97, 121, 78] },
      { size: "40", values: [102, 126, 78] },
    ],
    howToMeasure: [
      { label: "Waist", text: "Measure across the waistband with the button closed, then double it." },
      { label: "Hip", text: "Across the widest part, about 20 cm below the waistband, then double it." },
      { label: "Inseam", text: "From the crotch seam down to the bottom of the leg." },
    ],
  },
  shoes: {
    title: "Footwear",
    columns: ["Foot length (cm)", "EU"],
    rows: [
      { size: "UK 6", values: [24.5, 40] },
      { size: "UK 7", values: [25.4, 41] },
      { size: "UK 8", values: [26.2, 42] },
      { size: "UK 9", values: [27.1, 43] },
      { size: "UK 10", values: [27.9, 44] },
      { size: "UK 11", values: [28.8, 45] },
    ],
    howToMeasure: [
      { label: "Foot length", text: "Stand on paper, mark heel and longest toe, and measure the distance. Between sizes? Go up." },
    ],
    unitless: true,
  },
};

export function toInches(cm: number): string {
  return (Math.round((cm / 2.54) * 10) / 10).toFixed(1);
}
