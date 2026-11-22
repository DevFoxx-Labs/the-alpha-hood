/**
 * Mascot "ALPHA" image registry (docs/alpha-hood-store-kit/MASCOT_PROMPTS.md). Generated from the owner's images
 * by the build script described in docs/brand/mascot/README.md: WebP in /public/mascot, intrinsic sizes and the
 * sampled background colour (so a non-transparent image blends into its container with no visible box).
 *
 * Brand rule (MASCOT_PROMPTS §0): product photography leads; the mascot owns the moments in between.
 * AI-generated: never use these as product photos, reviews or merch for sale.
 */
export interface MascotImage {
  src: string;
  width: number;
  height: number;
  /** Background colour baked into the image; null = true transparency. */
  bg: string | null;
}

export const MASCOT = {
  /** #1 Hero stance — About page */
  "alpha-01-hero-stance": { src: "/mascot/alpha-01-hero-stance.webp", width: 1122, height: 1402, bg: null },
  /** #2 Lean back — Alpha Club band (M9) */
  "alpha-02-lean-back": { src: "/mascot/alpha-02-lean-back.webp", width: 1122, height: 1402, bg: null },
  /** #4 Pointing — newsletter CTA */
  "alpha-04-pointing": { src: "/mascot/alpha-04-pointing.webp", width: 1122, height: 1402, bg: null },
  /** #5 Welcome salute — sign-in */
  "alpha-05-welcome": { src: "/mascot/alpha-05-welcome.webp", width: 1122, height: 1402, bg: "#ebe9ea" },
  /** #6 Shopping haul — sale promo band */
  "alpha-06-shopping-haul": { src: "/mascot/alpha-06-shopping-haul.webp", width: 1122, height: 1402, bg: "#eeecec" },
  /** #7 Sneaker-box throne — empty category / listing */
  "alpha-07-sneaker-boxes": { src: "/mascot/alpha-07-sneaker-boxes.webp", width: 1122, height: 1402, bg: "#ebe8e9" },
  /** #8 Measuring tape — size guide */
  "alpha-08-measuring": { src: "/mascot/alpha-08-measuring.webp", width: 1122, height: 1402, bg: "#ebe9e9" },
  /** #9 Mirror selfie — #WearTheHood (M9) */
  "alpha-09-mirror-selfie": { src: "/mascot/alpha-09-mirror-selfie.webp", width: 1122, height: 1402, bg: "#847874" },
  /** #10 Delivery run — track order, shipping */
  "alpha-10-delivery-run": { src: "/mascot/alpha-10-delivery-run.webp", width: 1122, height: 1402, bg: null },
  /** #11 Thinking stylist — Ask Alpha (M9) */
  "alpha-11-thinking": { src: "/mascot/alpha-11-thinking.webp", width: 1122, height: 1402, bg: "#ebe9e9" },
  /** #12 Celebration — order success */
  "alpha-12-celebration": { src: "/mascot/alpha-12-celebration.webp", width: 1122, height: 1402, bg: "#ebe8e8" },
  /** #13 Sleeping on hoodies — empty bag / wishlist */
  "alpha-13-sleeping": { src: "/mascot/alpha-13-sleeping.webp", width: 1200, height: 800, bg: null },
  /** #14 Peek — 404 page */
  "alpha-14-peek": { src: "/mascot/alpha-14-peek.webp", width: 1200, height: 800, bg: "#eeebeb" },
  /** #15 Hood-up drop — coming soon page */
  "alpha-15-hood-up": { src: "/mascot/alpha-15-hood-up.webp", width: 1122, height: 1402, bg: "#2b2726" },
  /** #16 Winter — Puffer season tile, About seasons */
  "season-16-winter": { src: "/mascot/season-16-winter.webp", width: 1122, height: 1402, bg: "#e4e1e3" },
  /** #17 Summer linen — Smart casuals tile, About seasons */
  "season-17-linen": { src: "/mascot/season-17-linen.webp", width: 1122, height: 1402, bg: "#efecec" },
  /** #18 Festive — About seasons */
  "season-18-festive": { src: "/mascot/season-18-festive.webp", width: 1122, height: 1402, bg: "#edeaea" },
  /** #19 Denim — Denim days tile, About seasons */
  "season-19-denim": { src: "/mascot/season-19-denim.webp", width: 1122, height: 1402, bg: "#eceaea" },
  /** #20 Monsoon — About seasons */
  "season-20-monsoon": { src: "/mascot/season-20-monsoon.webp", width: 1122, height: 1402, bg: "#eae8e8" },
  /** #22 The Pack — homepage band, About */
  "scene-22-the-pack": { src: "/mascot/scene-22-the-pack.webp", width: 1122, height: 1402, bg: "#565055" },
  /** #23 Sale poster — sale campaigns */
  "scene-23-sale": { src: "/mascot/scene-23-sale.webp", width: 1122, height: 1402, bg: "#c60321" },
  /** #24 Alpha Club card art (M9) */
  "scene-24-club-card": { src: "/mascot/scene-24-club-card.webp", width: 1200, height: 751, bg: "#050401" },
  /** #25 Lookbook grid — #WearTheHood (M9) */
  "scene-25-lookbook": { src: "/mascot/scene-25-lookbook.webp", width: 1122, height: 1402, bg: "#dcdbdc" },
  /** Sticker sheet — social / WhatsApp, review prompts */
  "stickers": { src: "/mascot/stickers.webp", width: 1536, height: 1024, bg: null },
} as const satisfies Record<string, MascotImage>;

export type MascotName = keyof typeof MASCOT;

/** Hero slides: art-directed 16:7 desktop and 4:5 mobile composites. */
export const MASCOT_HERO = {
  "rooftop": { desktop: "/mascot/hero-rooftop-desktop.webp", mobile: "/mascot/hero-rooftop-mobile.webp" },
  "hood-up": { desktop: "/mascot/hero-hood-up-desktop.webp", mobile: "/mascot/hero-hood-up-mobile.webp" },
  "run": { desktop: "/mascot/hero-run-desktop.webp", mobile: "/mascot/hero-run-mobile.webp" },
} as const;
