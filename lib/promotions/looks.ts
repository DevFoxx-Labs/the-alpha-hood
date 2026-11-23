import type { FigureLook } from "@/lib/cms/types";
import type { Paise } from "@/lib/format";

/**
 * PROMO-05 / HOME-07 Shop the Look: a curated outfit. When the bag holds every item of a look, one unit of each
 * gets `percent` off (after automatic discounts). Units already in a combo are not used for a look, and a line
 * belongs to at most one look. DEMO looks — the CMS / platform will own them. The image is placeholder art
 * until the campaign shoot (never mascot art: these are real products).
 */
export interface Look {
  id: string;
  title: string;
  percent: number;
  productIds: string[];
  /** Hotspot positions (percent of the image) in the same order as productIds. */
  hotspots: { x: number; y: number }[];
  placeholder: { fill: string; look: FigureLook };
  startsAt?: string;
  endsAt?: string;
}

export const LOOKS: Look[] = [
  {
    id: "street-uniform",
    title: "The street uniform",
    percent: 10,
    productIds: ["mock_011", "mock_111", "mock_251"],
    hotspots: [
      { x: 52, y: 32 },
      { x: 48, y: 62 },
      { x: 44, y: 90 },
    ],
    placeholder: { fill: "#d9d5cc", look: { top: "#1b1b1b", bottom: "#8fb3d1", skin: "#C9946B" } },
  },
  {
    id: "winter-layers",
    title: "Winter layers",
    percent: 10,
    productIds: ["mock_201", "mock_161", "mock_221"],
    hotspots: [
      { x: 50, y: 36 },
      { x: 47, y: 66 },
      { x: 58, y: 24 },
    ],
    placeholder: { fill: "#8a8c90", look: { top: "#202020", bottom: "#59603f", skin: "#B98563" } },
  },
];

export function findLook(id: string, looks: Look[] = LOOKS): Look | null {
  return looks.find((l) => l.id === id) ?? null;
}

function live(l: Look, now: Date) {
  const t = now.getTime();
  return !(l.startsAt && t < Date.parse(l.startsAt)) && !(l.endsAt && t >= Date.parse(l.endsAt));
}

export interface LookLine {
  lineId: string;
  productId: string;
  /** Per-unit price after automatic discounts. */
  unitPrice: Paise;
  quantity: number;
  /** Units of this line already used by a combo. */
  bundledUnits: number;
}

export interface LookApplication {
  lookId: string;
  title: string;
  discount: Paise;
}

/** Discount per line (one unit per look item) for every complete look in the bag. Integer paise, floor. */
export function applyLooks(lines: LookLine[], now: Date, looks: Look[] = LOOKS) {
  const lineDiscounts = new Map<string, Paise>();
  const lookUnits = new Map<string, number>();
  const applications: LookApplication[] = [];
  for (const look of looks) {
    if (!live(look, now) || look.percent <= 0 || look.percent > 50) continue;
    const picked: LookLine[] = [];
    for (const pid of look.productIds) {
      const line = lines.find((l) => l.productId === pid && !lookUnits.has(l.lineId) && l.quantity - l.bundledUnits >= 1 && !picked.includes(l));
      if (!line) break;
      picked.push(line);
    }
    if (picked.length !== look.productIds.length) continue;
    let total = 0;
    for (const l of picked) {
      const d = Math.floor((l.unitPrice * look.percent) / 100);
      lineDiscounts.set(l.lineId, d);
      lookUnits.set(l.lineId, 1);
      total += d;
    }
    applications.push({ lookId: look.id, title: look.title, discount: total });
  }
  return { lineDiscounts, lookUnits, applications };
}
