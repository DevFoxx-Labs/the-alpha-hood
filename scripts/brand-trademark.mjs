// Builds the trademark filing images in docs/brand/trademark/ from the vector logo masters in
// docs/brand/logo-kit/logo/. The logo is never redrawn: each SVG master is rasterised, trimmed,
// placed on white with a small margin and saved. B&W files only stretch the master's #0A0A0A to #000.
//
//   node scripts/brand-trademark.mjs
//
// Uses sharp (installed with Next.js). Re-run after the masters change; don't hand-edit the outputs.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function loadSharp() {
  try {
    return require("sharp");
  } catch {
    // sharp is a dependency of next, not of this project: find it in the pnpm store
    const store = path.join(root, "node_modules/.pnpm");
    const dir = fs.readdirSync(store).find((d) => d.startsWith("sharp@"));
    if (!dir) throw new Error("sharp not found — run pnpm install");
    return require(path.join(store, dir, "node_modules/sharp"));
  }
}
const sharp = loadSharp();

const SRC = path.join(root, "docs/brand/logo-kit/logo");
const OUT = path.join(root, "docs/brand/trademark");
const SLUG = "the-alpha-hood";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const JPG_SIDE = 944; // 944 px at 300 dpi = 7.99 cm: fits the 8 × 8 cm TM-A box and USPTO's 250–944 px rule
const HIRES_SIDE = 2400;
const MARGIN = 0.04;

/** [mark, variant, master SVG]. The wordmark is black in the colour logo, so it has no separate colour file. */
const SETS = [
  ["wordmark", "bw", "wordmark_black.svg"],
  ["logomark", "bw", "mark_black.svg"],
  ["logomark", "color", "mark_color.svg"],
  ["composite", "bw", "primary-horizontal_black.svg"],
  ["composite", "color", "primary-horizontal_color.svg"],
];

async function place(big, variant, side) {
  const inner = Math.round(side * (1 - 2 * MARGIN));
  let s = sharp(big).resize(inner, inner, { fit: "inside" }).flatten({ background: WHITE });
  if (variant === "bw") s = s.greyscale().linear(255 / 245, -10 * (255 / 245));
  const img = await s.png().toBuffer();
  const p = Math.round(side * MARGIN);
  return sharp(img).extend({ top: p, bottom: p, left: p, right: p, background: WHITE });
}

fs.mkdirSync(OUT, { recursive: true });
for (const [mark, variant, file] of SETS) {
  const svg = fs.readFileSync(path.join(SRC, file));
  const meta = await sharp(svg).metadata();
  const density = Math.ceil((72 * (HIRES_SIDE + 200)) / Math.max(meta.width, meta.height));
  const big = await sharp(svg, { density }).trim({ threshold: 1 }).png().toBuffer();
  const base = path.join(OUT, `${SLUG}-tm-${mark}-${variant}`);
  await (await place(big, variant, JPG_SIDE))
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .withMetadata({ density: 300 })
    .toFile(`${base}.jpg`);
  await (await place(big, variant, HIRES_SIDE)).png().withMetadata({ density: 300 }).toFile(`${base}-hires.png`);
  const j = await sharp(`${base}.jpg`).metadata();
  console.log(`${path.basename(base)}.jpg  ${j.width}×${j.height} px @ ${j.density} dpi  ← ${file}`);
}
fs.writeFileSync(path.join(OUT, "word-mark.txt"), "THE ALPHA HOOD\n");
console.log("word-mark.txt");
