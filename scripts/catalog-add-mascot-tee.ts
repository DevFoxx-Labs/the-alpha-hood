/**
 * `pnpm catalog:add-mascot-tee [--apply] [--production] [--env-file=…]` — adds the owner's "Alpha Mascot Tee" (five
 * colours, real photos from assets/products/alpha-mascot-tee/photos) to the own-backend catalogue, through the same
 * services as Admin → Products: each photo goes through prepareProductPhoto (type sniffed, size-checked, metadata
 * stripped, random server-chosen id) into the media store, then saveStyle creates the style with every colour.
 *
 * Safety (database-safety): dry run unless --apply; prints the target first; a non-local database needs --production;
 * idempotent — does nothing if the style's SKUs already exist; audited as `system:catalog-add-mascot-tee`.
 * Price, stock and legal details are placeholders: set the real ones in Admin → Products afterwards.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { prepareProductPhoto } from "@/lib/catalog/media";
import { saveStyle } from "@/lib/catalog/style";
import { createDbStores } from "@/lib/db";
import { describeTarget, isLocalTarget, readDbConfig } from "@/lib/db/config";
import { closeMongo } from "@/lib/db/mongo";
import { closeSqlDb } from "@/lib/db/sql";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const production = args.includes("--production");
const envFile = args.find((a) => a.startsWith("--env-file="))?.split("=")[1] ?? ".env.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const cfg = readDbConfig();
if (!cfg) {
  console.error("No database configured: set DATABASE_DRIVER and DATABASE_URL.");
  process.exit(1);
}
const local = isLocalTarget(cfg);
console.log(`Target: ${describeTarget(cfg)} · ${local ? "local" : "REMOTE (treated as production)"} · ${apply ? "APPLY" : "dry run"}`);
if (apply && !local && !production) {
  console.error("Refusing to write to a non-local database without --production.");
  process.exit(1);
}

const DIR = path.join(process.cwd(), "assets/products/alpha-mascot-tee/photos");
const SKU = "AH-AMT";
const COLOURS = [
  { file: "black", name: "Black", hex: "#141414", family: "black", code: "BLK" },
  { file: "olive", name: "Olive", hex: "#556b2f", family: "olive", code: "OLV" },
  { file: "navy", name: "Navy", hex: "#1d2a5a", family: "navy", code: "NVY" },
  { file: "teal", name: "Teal", hex: "#0f6f74", family: "green", code: "TEL" },
  { file: "bone", name: "Bone", hex: "#ece8de", family: "cream", code: "BNE" },
] as const;
const SIZES = ["S", "M", "L", "XL", "XXL"] as const;
/** Placeholder price (₹2,499, no discount) — set the real one in Admin → Products. */
const PRICE = 249_900;
const STOCK_PER_SIZE = 20;

const stores = createDbStores(cfg);
const deps = { store: stores.catalog, media: stores.media, invalidate: () => {} };
try {
  const existing = (await deps.store.listRecords()).filter((r) => r.sku.startsWith(`${SKU}-`));
  if (existing.length) {
    console.log(`Already in the catalogue (${existing.length} colours, e.g. ${existing[0].sku}). Edit it in Admin → Products. Nothing to do.`);
  } else {
    const missing = COLOURS.flatMap((c) => ["front", "back", "poster"].map((v) => `${c.file}-${v}.jpg`)).filter((f) => !existsSync(path.join(DIR, f)));
    if (missing.length) throw new Error(`Missing photos in ${DIR}: ${missing.join(", ")}`);

    const variants = [];
    for (const c of COLOURS) {
      const photos = [];
      for (const [view, alt] of [
        ["front", `Alpha Mascot Tee in ${c.name.toLowerCase()}, front with the Alpha Hood mascot print, on a hanger`],
        ["back", `Alpha Mascot Tee in ${c.name.toLowerCase()}, back with The Alpha Hood logo, on a hanger`],
        ["poster", `Alpha Mascot Tee in ${c.name.toLowerCase()}: front, back, collar label, print and fabric details`],
      ] as const) {
        const bytes = new Uint8Array(readFileSync(path.join(DIR, `${c.file}-${view}.jpg`)));
        const item = prepareProductPhoto(bytes, "system:catalog-add-mascot-tee");
        if (apply) await deps.media!.save(item);
        photos.push({ id: item.id, alt, ...(view === "poster" ? {} : { view }) });
      }
      variants.push({
        colour: { name: c.name, hex: c.hex },
        colourFamily: c.family,
        sku: `${SKU}-${c.code}`,
        price: PRICE,
        mrp: PRICE,
        sizes: SIZES.map((s) => ({ label: s, stock: STOCK_PER_SIZE, sku: `${SKU}-${c.code}-${s}` })),
        photos,
        status: "active",
      });
    }
    const body = {
      baseTitle: "Alpha Mascot Tee",
      category: "t-shirts",
      subcategory: "oversized",
      art: "oversized",
      attributes: { fit: "oversized", fabric: "cotton", sleeve: "half", pattern: "printed", occasion: "casual" },
      tags: ["mascot", "graphic", "oversized", "signed", "exclusive"],
      description: "Premium oversized tee with the Alpha Hood mascot printed on the front and The Alpha Hood logo across the back. Premium cotton blend, high-quality print and durable stitching, with our woven neck label.",
      specs: [
        { label: "Fit", value: "Premium oversized" },
        { label: "Fabric", value: "Premium cotton blend" },
        { label: "Print", value: "Front mascot print, back logo print" },
        { label: "Collar", value: "Ribbed crew neck with woven label" },
      ],
      sizeChart: "tops",
      legal: { manufacturer: "The Alpha Hood — manufacturer name and address to be confirmed", countryOfOrigin: "India", netQuantity: "1 N (one piece)" },
      hsn: "6109",
      weightGrams: 300,
      dimensionsCm: { length: 32, width: 26, height: 3 },
      variants,
    };
    if (!apply) {
      console.log(`Dry run OK: would create "Alpha Mascot Tee" with ${variants.length} colours (${COLOURS.map((c) => c.name).join(", ")}), ${variants.length * 3} photos. Re-run with --apply.`);
    } else {
      const r = await saveStyle(deps, null, body);
      await stores.audit.append({ actorId: "system:catalog-add-mascot-tee", actorEmail: "system", action: "catalog.style_create", target: r.styleId, details: { colours: r.created.length }, ip: "127.0.0.1" });
      console.log(`Created style ${r.styleId}: ${r.created.length} colours. Edit it in Admin → Products.`);
    }
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  if (cfg.driver === "mongodb") await closeMongo(cfg);
  else await closeSqlDb(cfg);
}
