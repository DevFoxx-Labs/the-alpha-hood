import { randomBytes } from "node:crypto";
import { ValidationError } from "@/lib/http/guard";
import { asObject, cleanText, rejectUnknownFields } from "@/lib/validation";
import { apply, assertUniqueCodes, type CatalogAdminDeps, CatalogAdminError, parseProductInput, type ProductInput, slugify } from "./admin";
import { CatalogConflictError, type ProductRecord, type ProductStatus, skuKey } from "./store";

/**
 * Style editor (ADM-01): one product = a STYLE with colour variants, each colour with its size variants.
 *
 * Storage stays one record per colour, grouped by `styleId`. Each colour keeps its own URL, photos, swatch, price and
 * status, which suits fashion product pages and search engines. Each size has its own SKU, barcode and stock. Fields
 * shared by the style (title, category, description, attributes, size chart, legal, tax, package) are written to
 * every colour in ONE transaction (`CatalogStore.writeMany`), so colours never disagree.
 *
 * Threat model (catalog.write staff, or a stolen session):
 * - every field goes through the same allow-list as a single product (`parseProductInput`);
 * - colour ids sent by the client must belong to THIS style (no editing other products through it); a colour can't be
 *   dropped (archive it instead: orders point at it);
 * - a live colour's URL handle can't change (links and search engines use it; there is no redirect manager yet);
 * - versions are checked for every colour inside the transaction (stale → 409, nothing written);
 * - cost price is returned only to staff who can edit the catalogue (`canSeeCost`).
 * Every save is audited by the route.
 */

export const STYLE_ID_RE = /^[a-z0-9_]{1,64}$/;
export const MAX_COLOURS = 12;
const SEP = " — ";

/** Fields every colour of a style shares. */
const SHARED_FIELDS = ["category", "subcategory", "art", "attributes", "tags", "description", "specs", "sizeChart", "model", "legal", "gstClass", "hsn", "weightGrams", "dimensionsCm"] as const;
/** Fields each colour has on its own. */
const VARIANT_FIELDS = ["id", "version", "colour", "colourFamily", "handle", "sku", "price", "mrp", "costPrice", "badge", "sizes", "photos", "status", "seo"] as const;

export interface VariantView {
  id: string;
  version: number;
  status: ProductStatus;
  handle: string;
  sku: string;
  colour: { name: string; hex: string };
  colourFamily: string;
  price: number;
  mrp: number;
  costPrice?: number;
  badge?: "NEW" | "BESTSELLER";
  sizes: { label: string; sku?: string; barcode?: string; stock: number }[];
  photos: { id: string; alt: string }[];
  seo?: { title?: string; description?: string };
  image: ProductRecord["images"][number];
  updatedAt: string;
}

export interface StyleView {
  styleId: string;
  baseTitle: string;
  shared: Pick<ProductRecord, "category" | "subcategory" | "attributes" | "tags" | "description" | "specs" | "sizeChart" | "model" | "legal" | "gstClass" | "hsn" | "weightGrams" | "dimensionsCm"> & { art: string };
  variants: VariantView[];
}

/** "Linen Shirt — Sand" → "Linen Shirt" (the demo data and the old editor use this convention). */
export const baseTitleOf = (title: string) => (title.includes(SEP) ? title.slice(0, title.lastIndexOf(SEP)) : title);

const byAge = (a: ProductRecord, b: ProductRecord) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

function variantView(r: ProductRecord, onHand: Map<string, number>, canSeeCost: boolean): VariantView {
  return {
    id: r.id,
    version: r.version,
    status: r.status,
    handle: r.handle,
    sku: r.sku,
    colour: { name: r.colour.name, hex: r.colour.hex },
    colourFamily: r.colourFamily,
    price: r.price,
    mrp: r.mrp,
    ...(canSeeCost && r.costPrice !== undefined ? { costPrice: r.costPrice } : {}),
    ...(r.badge ? { badge: r.badge } : {}),
    // Live stock from the inventory (read-only here; changed in Inventory, audited).
    sizes: r.sizes.map((s) => ({ label: s.label, ...(s.sku ? { sku: s.sku } : {}), ...(s.barcode ? { barcode: s.barcode } : {}), stock: Math.max(0, onHand.get(skuKey(r.id, s.label)) ?? s.stock) })),
    photos: r.images.filter((i) => i.url?.startsWith("/api/media/")).map((i) => ({ id: i.url!.slice("/api/media/".length), alt: i.alt })),
    ...(r.seo ? { seo: r.seo } : {}),
    image: r.images[0],
    updatedAt: r.updatedAt,
  };
}

export async function getStyle(deps: CatalogAdminDeps, styleId: string, canSeeCost: boolean): Promise<StyleView | null> {
  if (!STYLE_ID_RE.test(styleId)) return null;
  const [records, onHand] = await Promise.all([deps.store.listRecords(), deps.store.onHand()]);
  const colours = records.filter((r) => r.styleId === styleId).sort(byAge);
  if (!colours.length) return null;
  const first = colours[0];
  return {
    styleId,
    baseTitle: baseTitleOf(first.title),
    shared: {
      category: first.category,
      subcategory: first.subcategory,
      art: first.images[0]?.art ?? "tee",
      attributes: first.attributes,
      tags: first.tags,
      description: first.description,
      specs: first.specs,
      sizeChart: first.sizeChart,
      model: first.model,
      legal: first.legal,
      gstClass: first.gstClass,
      hsn: first.hsn,
      weightGrams: first.weightGrams,
      dimensionsCm: first.dimensionsCm,
    },
    variants: colours.map((r) => variantView(r, onHand, canSeeCost)),
  };
}

/** One row per style for the products list. */
export interface StyleRow {
  styleId: string;
  title: string;
  category: string;
  colours: { id: string; name: string; hex: string; status: ProductStatus }[];
  price: { min: number; max: number };
  stock: number;
  status: ProductStatus;
  image: ProductRecord["images"][number];
  updatedAt: string;
}

export function styleRows(records: ProductRecord[], onHand: Map<string, number>, q: string, status: ProductStatus | null): StyleRow[] {
  const groups = new Map<string, ProductRecord[]>();
  for (const r of records) groups.set(r.styleId, [...(groups.get(r.styleId) ?? []), r]);
  const needle = q.toLowerCase();
  const rows: StyleRow[] = [];
  for (const [styleId, all] of groups) {
    const rs = [...all].sort(byAge);
    if (status && !rs.some((r) => r.status === status)) continue;
    const text = rs.flatMap((r) => [r.title, r.sku, ...r.sizes.flatMap((s) => [s.sku ?? "", s.barcode ?? ""])]).join(" ").toLowerCase();
    if (needle && !text.includes(needle)) continue;
    const prices = rs.map((r) => r.price);
    rows.push({
      styleId,
      title: baseTitleOf(rs[0].title),
      category: rs[0].category,
      colours: rs.map((r) => ({ id: r.id, name: r.colour.name, hex: r.colour.hex, status: r.status })),
      price: { min: Math.min(...prices), max: Math.max(...prices) },
      stock: rs.reduce((n, r) => n + r.sizes.reduce((m, s) => m + Math.max(0, onHand.get(skuKey(r.id, s.label)) ?? s.stock), 0), 0),
      // A style is live when any colour is live.
      status: rs.some((r) => r.status === "active") ? "active" : rs.some((r) => r.status === "draft") ? "draft" : "archived",
      image: (rs.find((r) => r.status === "active") ?? rs[0]).images[0],
      updatedAt: rs.map((r) => r.updatedAt).sort().at(-1)!,
    });
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.styleId.localeCompare(b.styleId));
}

/** Prefixes a validation message with the colour it is about. */
function forColour<T>(name: string, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ValidationError) throw new ValidationError(`${name}: ${e.message}`);
    throw e;
  }
}

export interface SaveStyleResult {
  styleId: string;
  created: string[];
  updated: string[];
  records: ProductRecord[];
}

/**
 * Creates a style (`styleId` null) or saves an existing one. Body: `{ baseTitle, ...shared fields, variants: [...] }`.
 * All colours are written in one transaction or none is.
 */
export async function saveStyle(deps: CatalogAdminDeps, styleId: string | null, body: unknown, now = new Date()): Promise<SaveStyleResult> {
  const b = asObject(body);
  rejectUnknownFields(b, ["baseTitle", "variants", ...SHARED_FIELDS]);
  const baseTitle = cleanText(b.baseTitle, "Product name", { min: 3, max: 80 });
  if (!Array.isArray(b.variants) || b.variants.length < 1 || b.variants.length > MAX_COLOURS) throw new ValidationError(`Add 1–${MAX_COLOURS} colours.`);

  const [docs, records] = await Promise.all([deps.store.getDocs(), deps.store.listRecords()]);
  const current = styleId === null ? [] : records.filter((r) => r.styleId === styleId);
  if (styleId !== null && (!STYLE_ID_RE.test(styleId) || current.length === 0)) throw new CatalogAdminError("not_found", "Product not found.", 404);
  const currentById = new Map(current.map((r) => [r.id, r]));
  const sid = styleId ?? `style_${randomBytes(6).toString("hex")}`;

  const shared = Object.fromEntries(SHARED_FIELDS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const seenHandles = new Set<string>();

  const planned = b.variants.map((raw, i) => {
    const v = asObject(raw);
    rejectUnknownFields(v, [...VARIANT_FIELDS]);
    const colourIn = asObject(v.colour);
    const name = typeof colourIn.name === "string" && colourIn.name.trim() ? colourIn.name.trim() : `Colour ${i + 1}`;
    const key = name.toLowerCase();
    if (seenNames.has(key)) throw new ValidationError(`The colour “${name}” is listed twice.`);
    seenNames.add(key);

    let existing: ProductRecord | undefined;
    let expectedVersion = 0;
    if (v.id !== undefined && v.id !== null) {
      existing = typeof v.id === "string" ? currentById.get(v.id) : undefined;
      // Ownership: only colours of THIS style can be edited through it.
      if (!existing) throw new ValidationError(`${name}: this colour doesn't belong to this product. Reload the page.`);
      if (seenIds.has(existing.id)) throw new ValidationError(`${name}: listed twice.`);
      seenIds.add(existing.id);
      if (typeof v.version !== "number" || !Number.isSafeInteger(v.version) || v.version < 1) throw new ValidationError(`${name}: missing version — reload the page.`);
      expectedVersion = v.version;
    } else if (v.version !== undefined) {
      throw new ValidationError(`${name}: a new colour has no version.`);
    }

    const title = `${baseTitle}${SEP}${name}`;
    const requestedHandle = v.handle === undefined || v.handle === null || v.handle === "" ? undefined : v.handle;
    const handle = requestedHandle ?? existing?.handle ?? slugify(title);
    if (existing && existing.status !== "draft" && handle !== existing.handle) {
      throw new ValidationError(`${name}: the web address of a published colour can't change (links and search engines use it).`);
    }
    const input: ProductInput = forColour(name, () =>
      parseProductInput(
        {
          ...shared,
          title,
          handle,
          sku: v.sku,
          price: v.price,
          mrp: v.mrp,
          colour: v.colour,
          colourFamily: v.colourFamily,
          sizes: v.sizes,
          photos: v.photos,
          status: v.status,
          ...(v.badge !== undefined ? { badge: v.badge } : {}),
          ...(v.costPrice !== undefined ? { costPrice: v.costPrice } : {}),
          ...(v.seo !== undefined ? { seo: v.seo } : {}),
        },
        docs,
      ),
    );
    if (seenHandles.has(input.handle)) throw new ValidationError(`${name}: another colour uses the web address “${input.handle}”.`);
    seenHandles.add(input.handle);
    return { input, existing, expectedVersion };
  });

  // A colour can't silently disappear: orders, returns and reviews point at it.
  for (const r of current) {
    if (!seenIds.has(r.id)) throw new ValidationError(`“${r.colour.name}” is missing. Archive a colour instead of removing it.`);
  }

  // Every referenced photo must have been uploaded to our media store.
  const photoIds = [...new Set(planned.flatMap((p) => p.input.photos.map((ph) => ph.id)))];
  if (photoIds.length) {
    const found = deps.media ? await deps.media.existing(photoIds) : new Set<string>();
    if (photoIds.some((id) => !found.has(id))) throw new ValidationError("A photo wasn't found — upload it again.");
  }

  const inserts: ProductRecord[] = [];
  const replaces: { record: ProductRecord; expectedVersion: number }[] = [];
  for (const [i, p] of planned.entries()) {
    if (p.existing) {
      replaces.push({ record: apply(p.input, { ...p.existing, version: p.expectedVersion + 1 }, now), expectedVersion: p.expectedVersion });
    } else {
      inserts.push(apply(p.input, { id: `prd_${randomBytes(10).toString("hex")}`, styleId: sid, createdAt: new Date(now.getTime() + i).toISOString(), popularity: 0, version: 1, sizes: [] }, now));
      // +i ms keeps colours created together in the order the editor listed them (the editor sorts by createdAt).
    }
  }
  const written = [...replaces.map((x) => x.record), ...inserts];
  assertUniqueCodes([...records.filter((r) => !currentById.has(r.id)), ...written]);

  let ok: boolean;
  try {
    ok = await deps.store.writeMany(inserts, replaces);
  } catch (e) {
    if (e instanceof CatalogConflictError) throw new CatalogAdminError("conflict", e.message, 409);
    throw e;
  }
  if (!ok) throw new CatalogAdminError("version_conflict", "Someone else changed this product. Reload to see their changes.", 409);
  deps.invalidate();
  return { styleId: sid, created: inserts.map((r) => r.id), updated: replaces.map((x) => x.record.id), records: written };
}
