import type { GarmentKind } from "@/lib/commerce/types";
import type { FitVote, Review } from "./types";

/**
 * Deterministic DEMO reviews for the mock catalogue (fictional people and text). The live store shows
 * only real reviews from verified buyers (PRD §14, consumer law) — never generated ones.
 */

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ["Aarav S.", "Rohan M.", "Kabir J.", "Ishaan P.", "Vihaan R.", "Arjun K.", "Dev T.", "Aditya N.", "Karan B.", "Rahul D.", "Siddharth G.", "Neel V.", "Yash C.", "Manav L.", "Pranav H.", "Ayaan F."];

const TEXT: Record<"high" | "mid" | "low", { title: string; body: string }[]> = {
  high: [
    { title: "Exactly as shown", body: "Fabric feels premium and the colour is spot on. Got compliments the first day I wore it." },
    { title: "Great fit, great price", body: "Fits well through the shoulders and the length is right. Washed twice, no shrinking so far." },
    { title: "My new favourite", body: "Comfortable all day and looks sharp. Already ordered another colour." },
    { title: "Solid quality", body: "Stitching is clean and the material is thicker than I expected for the price." },
    { title: "Worth it", body: "Delivery was quick and the packaging was neat. The piece itself is even better in person." },
  ],
  mid: [
    { title: "Good, but check the size", body: "Nice material, but it runs slightly different from my usual size. Exchange was easy though." },
    { title: "Decent", body: "Looks good. The colour is a shade lighter than the photos on my screen." },
  ],
  low: [
    { title: "Not for me", body: "The fit didn't suit my build. Returned it without any hassle." },
    { title: "Expected more", body: "Okay for the price, but the fabric is thinner than I hoped." },
  ],
};

export interface GenerateInput {
  styleId: string;
  category: string;
  /** Colour variants: handle + colour hex for photo placeholders. */
  variants: { handle: string; hex: string }[];
  art: GarmentKind;
  sizes: string[];
  count: number;
  targetAverage: number;
  seed: number;
  now: number;
}

export function generateReviews(input: GenerateInput): Review[] {
  const rand = prng(input.seed);
  const out: Review[] = [];
  for (let i = 0; i < input.count; i++) {
    const roll = rand();
    // Skewed towards the target average; a small tail of low ratings.
    let rating = Math.round(input.targetAverage + (rand() - 0.45) * 1.6);
    if (roll < 0.05) rating -= 2;
    rating = Math.min(5, Math.max(1, rating));
    const bucket = rating >= 4 ? "high" : rating === 3 ? "mid" : "low";
    const text = TEXT[bucket][Math.floor(rand() * TEXT[bucket].length)];
    const variant = input.variants[Math.floor(rand() * input.variants.length)];
    const fitRoll = rand();
    const fit: FitVote = fitRoll < 0.72 ? "true" : fitRoll < 0.86 ? "small" : "large";
    const photoCount = rand() < 0.22 ? 1 + Math.floor(rand() * 2) : 0;
    out.push({
      id: `rv_${input.styleId}_${i + 1}`,
      styleId: input.styleId,
      category: input.category,
      productHandle: variant.handle,
      rating: rating as Review["rating"],
      title: text.title,
      body: text.body,
      author: NAMES[Math.floor(rand() * NAMES.length)],
      size: input.sizes[Math.floor(rand() * input.sizes.length)],
      fit,
      photos: Array.from({ length: photoCount }, (_, p) => ({
        art: input.art,
        colour: variant.hex,
        alt: `Customer photo ${p + 1}`,
      })),
      verified: true,
      createdAt: new Date(input.now - Math.floor(rand() * 120) * 86_400_000 - i * 3_600_000).toISOString(),
      helpful: Math.floor(rand() * 24),
    });
  }
  return out;
}
