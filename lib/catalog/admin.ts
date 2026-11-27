import { randomBytes } from "node:crypto";
import { ATTRIBUTE_VALUES, COLOUR_FAMILIES, SIZE_ORDER } from "@/lib/catalog/attributes";
import type { GarmentKind, Product, ProductAttributes, SizeChartKind } from "@/lib/commerce/types";
import { GST_CONFIG, type GstClass } from "@/lib/pricing/gst";
import { ValidationError } from "@/lib/http/guard";
import { asObject, cleanText, rejectUnknownFields } from "@/lib/validation";
import { MEDIA_ID_RE, type MediaStore, mediaUrl } from "./media";
import { GARMENT_KINDS, SIZE_CHARTS } from "./product-options";
import { HANDLE_RE } from "./reader";
import { CatalogConflictError, type CatalogDocs, type CatalogStore, PRODUCT_STATUSES, type ProductRecord, type ProductStatus, type RecordSize } from "./store";

/**
 * ADM-01 product editing on the own backend. Every field is validated on the server against an allow-list:
 * - money is integer paise (price ≤ MRP, ₹1 – ₹1,00,000), computed nowhere else;
 * - category / sub-category must exist in the category tree; attribute values, colour family, sizes, size chart and
 *   placeholder art come from fixed lists;
 * - text is plain (rendered escaped by React; JSON-LD goes through `toJsonLd`), length-capped, control chars removed;
 * - no image URLs yet (no fetching of user-supplied URLs; photo upload is a later step — docs/known-gaps.md).
 * Edits carry the version the editor loaded; a stale version is refused (409) so two editors can't overwrite each
 * other. Stock is NOT edited here after creation: it lives in the inventory (adjusted, audited, never below zero).
 */
const SKU_RE = /^[A-Z0-9][A-Z0-9-]{2,39}$/;
const STYLE_RE = /^[a-z0-9_]{1,64}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const TAG_RE = /^[a-z0-9][a-z0-9 -]{0,29}$/;
/** HSN: 4, 6 or 8 digits (CBIC). */
export const HSN_RE = /^\d{4}(?:\d{2}){0,2}$/;
/** GTIN-8 / UPC-12 / EAN-13 / GTIN-14 digits (check digit verified separately). */
const BARCODE_RE = /^(?:\d{8}|\d{12,14})$/;
export const GST_CLASSES = Object.keys(GST_CONFIG.classes) as GstClass[];

/** GS1 check digit (mod 10, weights 3/1 from the right). Catches most mistyped barcodes. */
export function validGtin(code: string): boolean {
  if (!BARCODE_RE.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((n, d, i) => n + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
export const MAX_PRICE = 10_000_000; // ₹1,00,000 in paise

export class CatalogAdminError extends Error {
  constructor(
    public readonly code: "catalog_readonly" | "not_found" | "version_conflict" | "conflict",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CatalogAdminError";
  }
}

/** Views a staff member can tag a photo with (rail turn: side → front; dialog adds back). */
export const PHOTO_VIEWS = ["front", "back", "side"] as const;
export type PhotoView = (typeof PHOTO_VIEWS)[number];

export interface ProductPhotoInput {
  id: string;
  alt: string;
  view?: PhotoView;
}

/** The uploaded photos of a stored record, back in editor shape (style editor, CSV export, import round-trip). */
export function photosFromImages(images: Product["images"]): ProductPhotoInput[] {
  const photos = images.filter((i) => i.url?.startsWith("/api/media/"));
  // Records saved before tags existed carry an automatic "front" on photo 1 and no other tag: that's not a hanger shot.
  const legacy = photos.length > 0 && photos[0].view === "front" && photos.slice(1).every((i) => !i.view);
  return photos.map((i, n) => {
    const view = !(legacy && n === 0) && (PHOTO_VIEWS as readonly string[]).includes(i.view ?? "") ? (i.view as PhotoView) : undefined;
    return { id: i.url!.slice("/api/media/".length), alt: i.alt, ...(view ? { view } : {}) };
  });
}

export interface ProductInput {
  title: string;
  handle: string;
  sku: string;
  category: string;
  subcategory?: string;
  price: number;
  mrp: number;
  badge?: Product["badge"];
  colour: { name: string; hex: string };
  colourFamily: string;
  styleId: string | null;
  sizes: RecordSize[];
  art: GarmentKind;
  attributes: ProductAttributes;
  tags: string[];
  description: string;
  specs: { label: string; value: string }[];
  sizeChart: SizeChartKind;
  model?: { height: string; size: string };
  legal: Product["legal"];
  status: ProductStatus;
  /**
   * Uploaded photos in display order (first = card + LCP image); empty = placeholder drawings. `view` tags an
   * on-hanger cutout as front / back / side (each at most once) — the collection rail uses them (PLP-08).
   */
  photos: ProductPhotoInput[];
  gstClass?: GstClass;
  hsn?: string;
  costPrice?: number;
  weightGrams?: number;
  dimensionsCm?: { length: number; width: number; height: number };
  seo?: { title?: string; description?: string };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120);
}

const int = (v: unknown, field: string, min: number, max: number) => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) throw new ValidationError(`${field} must be a whole number between ${min} and ${max}.`);
  return v;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], field: string): T => {
  if (typeof v !== "string" || !list.includes(v as T)) throw new ValidationError(`Choose a valid ${field}.`);
  return v as T;
};
const optText = (v: unknown, field: string, max: number) => (v === undefined || v === null || v === "" ? undefined : cleanText(v, field, { max }));

const FIELDS = ["title", "handle", "sku", "category", "subcategory", "price", "mrp", "badge", "colour", "colourFamily", "styleId", "sizes", "art", "attributes", "tags", "description", "specs", "sizeChart", "model", "legal", "status", "photos", "version", "gstClass", "hsn", "costPrice", "weightGrams", "dimensionsCm", "seo"];
const absent = (v: unknown) => v === undefined || v === null || v === "";

/** Strict parse of the product form (create and edit share it). `docs` supplies the category tree. */
export function parseProductInput(body: unknown, docs: CatalogDocs | null): ProductInput {
  const b = asObject(body);
  rejectUnknownFields(b, FIELDS);
  const title = cleanText(b.title, "Title", { min: 3, max: 120 });

  const handle = b.handle === undefined || b.handle === "" ? slugify(title) : typeof b.handle === "string" ? b.handle : "";
  if (!HANDLE_RE.test(handle)) throw new ValidationError("URL handle: lower-case letters, digits and dashes only.");
  const sku = typeof b.sku === "string" ? b.sku.trim().toUpperCase() : "";
  if (!SKU_RE.test(sku)) throw new ValidationError("SKU: 3–40 capital letters, digits and dashes.");

  const tree = docs?.tree ?? [];
  const cat = tree.find((c) => c.handle === b.category);
  if (!cat) throw new ValidationError("Choose a category.");
  let subcategory: string | undefined;
  if (b.subcategory !== undefined && b.subcategory !== null && b.subcategory !== "") {
    if (!cat.subcategories.some((s) => s.handle === b.subcategory)) throw new ValidationError("Choose a sub-category of this category.");
    subcategory = b.subcategory as string;
  }

  const price = int(b.price, "Price (paise)", 100, MAX_PRICE);
  const mrp = int(b.mrp, "MRP (paise)", 100, MAX_PRICE);
  if (price > mrp) throw new ValidationError("Price can't be higher than the MRP.");
  const badge = b.badge === undefined || b.badge === null || b.badge === "" ? undefined : oneOf(b.badge, ["NEW", "BESTSELLER"] as const, "badge");

  const colourIn = asObject(b.colour);
  rejectUnknownFields(colourIn, ["name", "hex"]);
  const colour = { name: cleanText(colourIn.name, "Colour name", { min: 1, max: 40 }), hex: typeof colourIn.hex === "string" && HEX_RE.test(colourIn.hex) ? colourIn.hex.toLowerCase() : "" };
  if (!colour.hex) throw new ValidationError("Colour: pick a hex colour like #1b1b1b.");
  const colourFamily = oneOf(b.colourFamily, Object.keys(COLOUR_FAMILIES), "colour family");

  let styleId: string | null = null;
  if (b.styleId !== undefined && b.styleId !== null && b.styleId !== "") {
    if (typeof b.styleId !== "string" || !STYLE_RE.test(b.styleId)) throw new ValidationError("Invalid style.");
    styleId = b.styleId;
  }

  if (!Array.isArray(b.sizes) || b.sizes.length < 1 || b.sizes.length > 12) throw new ValidationError("Add 1–12 sizes.");
  const seen = new Set<string>();
  const codes = new Set<string>();
  const sizes = b.sizes.map((raw) => {
    const s = asObject(raw);
    rejectUnknownFields(s, ["label", "stock", "sku", "barcode"]);
    const label = oneOf(s.label, SIZE_ORDER, "size");
    if (seen.has(label)) throw new ValidationError(`Size ${label} is listed twice.`);
    seen.add(label);
    const size: RecordSize = { label, stock: int(s.stock, `Stock for ${label}`, 0, 10_000) };
    if (!absent(s.sku)) {
      const code = typeof s.sku === "string" ? s.sku.trim().toUpperCase() : "";
      if (!SKU_RE.test(code)) throw new ValidationError(`SKU for size ${label}: 3–40 capital letters, digits and dashes.`);
      if (codes.has(`s:${code}`)) throw new ValidationError(`SKU ${code} is used twice.`);
      codes.add(`s:${code}`);
      size.sku = code;
    }
    if (!absent(s.barcode)) {
      const code = typeof s.barcode === "string" ? s.barcode.trim() : "";
      if (!validGtin(code)) throw new ValidationError(`Barcode for size ${label}: 8, 12, 13 or 14 digits with a valid check digit.`);
      if (codes.has(`b:${code}`)) throw new ValidationError(`Barcode ${code} is used twice.`);
      codes.add(`b:${code}`);
      size.barcode = code;
    }
    return size;
  });

  const art = oneOf(b.art, GARMENT_KINDS, "placeholder drawing");
  const attrsIn = b.attributes === undefined ? {} : asObject(b.attributes);
  rejectUnknownFields(attrsIn, Object.keys(ATTRIBUTE_VALUES));
  const attributes: ProductAttributes = {};
  for (const [k, v] of Object.entries(attrsIn)) {
    if (v === "" || v === null || v === undefined) continue;
    attributes[k as keyof ProductAttributes] = oneOf(v, Object.keys(ATTRIBUTE_VALUES[k as keyof typeof ATTRIBUTE_VALUES]), k);
  }

  const tagsIn = b.tags === undefined ? [] : b.tags;
  if (!Array.isArray(tagsIn) || tagsIn.length > 12) throw new ValidationError("Up to 12 search tags.");
  const tags = [...new Set(tagsIn.map((t) => (typeof t === "string" ? t.trim().toLowerCase() : "")))].filter(Boolean);
  if (tags.some((t) => !TAG_RE.test(t))) throw new ValidationError("Tags: letters, digits, spaces and dashes (max 30 characters).");

  const description = cleanText(b.description, "Description", { min: 10, max: 2000, multiline: true });
  const specsIn = b.specs === undefined ? [] : b.specs;
  if (!Array.isArray(specsIn) || specsIn.length > 12) throw new ValidationError("Up to 12 specification rows.");
  const specs = specsIn.map((raw) => {
    const s = asObject(raw);
    rejectUnknownFields(s, ["label", "value"]);
    return { label: cleanText(s.label, "Specification name", { min: 1, max: 40 }), value: cleanText(s.value, "Specification value", { min: 1, max: 120 }) };
  });
  const sizeChart = oneOf(b.sizeChart, SIZE_CHARTS, "size chart");

  let model: ProductInput["model"];
  if (b.model !== undefined && b.model !== null) {
    const m = asObject(b.model);
    rejectUnknownFields(m, ["height", "size"]);
    const height = optText(m.height, "Model height", 12);
    const size = optText(m.size, "Model size", 12);
    if (height && size) model = { height, size };
  }

  const l = asObject(b.legal);
  rejectUnknownFields(l, ["manufacturer", "packer", "importer", "countryOfOrigin", "netQuantity"]);
  const legal: Product["legal"] = {
    manufacturer: cleanText(l.manufacturer, "Manufacturer", { min: 3, max: 300 }),
    packer: optText(l.packer, "Packer", 300),
    importer: optText(l.importer, "Importer", 300),
    countryOfOrigin: cleanText(l.countryOfOrigin, "Country of origin", { min: 2, max: 60 }),
    netQuantity: cleanText(l.netQuantity, "Net quantity", { min: 1, max: 60 }),
  };
  const status = oneOf(b.status, PRODUCT_STATUSES, "status");

  const photosIn = b.photos === undefined || b.photos === null ? [] : b.photos;
  if (!Array.isArray(photosIn) || photosIn.length > 8) throw new ValidationError("Up to 8 photos.");
  const seenPhotos = new Set<string>();
  const seenViews = new Set<string>();
  const photos = photosIn.map((raw): ProductPhotoInput => {
    const ph = asObject(raw);
    rejectUnknownFields(ph, ["id", "alt", "view"]);
    if (typeof ph.id !== "string" || !MEDIA_ID_RE.test(ph.id)) throw new ValidationError("Unknown photo.");
    if (seenPhotos.has(ph.id)) throw new ValidationError("The same photo is listed twice.");
    seenPhotos.add(ph.id);
    const alt = cleanText(ph.alt, "Photo description", { min: 3, max: 140 });
    if (absent(ph.view)) return { id: ph.id, alt };
    const view = oneOf(ph.view, PHOTO_VIEWS, "photo view");
    if (seenViews.has(view)) throw new ValidationError(`Only one photo can be the ${view} view.`);
    seenViews.add(view);
    return { id: ph.id, alt, view };
  });

  const gstClass = absent(b.gstClass) ? undefined : oneOf(b.gstClass, GST_CLASSES, "GST class");
  let hsn: string | undefined;
  if (!absent(b.hsn)) {
    if (typeof b.hsn !== "string" || !HSN_RE.test(b.hsn.trim())) throw new ValidationError("HSN code: 4, 6 or 8 digits.");
    hsn = b.hsn.trim();
  }
  const costPrice = absent(b.costPrice) ? undefined : int(b.costPrice, "Cost price (paise)", 0, MAX_PRICE);
  const weightGrams = absent(b.weightGrams) ? undefined : int(b.weightGrams, "Weight (grams)", 1, 50_000);
  let dimensionsCm: ProductInput["dimensionsCm"];
  if (!absent(b.dimensionsCm)) {
    const d = asObject(b.dimensionsCm);
    rejectUnknownFields(d, ["length", "width", "height"]);
    dimensionsCm = { length: int(d.length, "Length (cm)", 1, 200), width: int(d.width, "Width (cm)", 1, 200), height: int(d.height, "Height (cm)", 1, 200) };
  }
  let seo: ProductInput["seo"];
  if (!absent(b.seo)) {
    const o = asObject(b.seo);
    rejectUnknownFields(o, ["title", "description"]);
    const t = optText(o.title, "SEO title", 70);
    const d = optText(o.description, "SEO description", 160);
    if (t || d) seo = { ...(t ? { title: t } : {}), ...(d ? { description: d } : {}) };
  }

  return {
    title, handle, sku, category: cat.handle, subcategory, price, mrp, badge, colour, colourFamily, styleId, sizes, art, attributes, tags, description, specs, sizeChart, model, legal, status, photos,
    ...(gstClass ? { gstClass } : {}),
    ...(hsn ? { hsn } : {}),
    ...(costPrice !== undefined ? { costPrice } : {}),
    ...(weightGrams ? { weightGrams } : {}),
    ...(dimensionsCm ? { dimensionsCm } : {}),
    ...(seo ? { seo } : {}),
  };
}

/**
 * Size SKUs and barcodes must be unique across the whole catalogue (and must not reuse another colour's main SKU).
 * `records` = the catalogue as it will be after the write. Checked in the service: the codes live inside the product
 * document, so the database can't index them (docs/known-gaps.md).
 */
export function assertUniqueCodes(records: Pick<ProductRecord, "id" | "sku" | "sizes" | "title">[]) {
  const owner = new Map<string, string>();
  const claim = (key: string, id: string, label: string, title: string) => {
    const prev = owner.get(key);
    if (prev !== undefined && prev !== id) throw new CatalogAdminError("conflict", `${label} is already used by another product (${title}).`, 409);
    owner.set(key, id);
  };
  for (const r of records) claim(`s:${r.sku}`, r.id, `SKU ${r.sku}`, r.title);
  for (const r of records) {
    for (const s of r.sizes) {
      if (s.sku && s.sku !== r.sku) claim(`s:${s.sku}`, r.id, `SKU ${s.sku}`, r.title);
      if (s.barcode) claim(`b:${s.barcode}`, r.id, `Barcode ${s.barcode}`, r.title);
    }
  }
}

export interface CatalogAdminDeps {
  store: CatalogStore;
  /** Product photos; when absent, products can't reference uploaded photos. */
  media?: MediaStore;
  /** Clears cached catalogue snapshots / pages after a write. */
  invalidate(): void;
}

const imagesFor = (title: string, art: GarmentKind, hex: string): Product["images"] =>
  (["front", "model", "back", "detail"] as const).map((view) => ({
    art,
    colour: hex,
    view,
    alt: `${title}, ${view === "model" ? "on model" : view === "detail" ? "fabric close-up" : view}`,
  }));

export function apply(input: ProductInput, base: { id: string; styleId: string; createdAt: string; popularity: number; version: number; sizes: { label: string; stock: number }[]; images?: Product["images"]; soldOutHold?: boolean }, now: Date): ProductRecord {
  // Seeded DEMO photos (public/demo/products/, never accepted from a request) survive an edit that uploads none,
  // so saving a demo product in the editor or re-importing its CSV doesn't swap its photos for drawings.
  const demoImages = !input.photos.length && base.images?.some((i) => i.url?.startsWith("/demo/products/")) ? base.images : null;
  // Existing sizes keep their recorded stock (live stock is the inventory's); only new sizes take the given number.
  const prior = new Map(base.sizes.map((s) => [s.label, s.stock]));
  return {
    id: base.id,
    handle: input.handle,
    title: input.title,
    category: input.category,
    subcategory: input.subcategory,
    price: input.price,
    mrp: input.mrp,
    badge: input.badge,
    colour: { ...input.colour, handle: input.handle },
    sizes: input.sizes.map((s) => ({ ...s, stock: prior.has(s.label) ? prior.get(s.label)! : s.stock })),
    images: demoImages
      ? demoImages
      : input.photos.length
      ? input.photos.map((ph) => ({
          url: mediaUrl(ph.id),
          alt: ph.alt,
          art: input.art,
          colour: input.colour.hex,
          // Only what staff tagged (cards and the PDP lead with photo 1 regardless of tags).
          ...(ph.view ? { view: ph.view } : {}),
        }))
      : imagesFor(input.title, input.art, input.colour.hex),
    attributes: input.attributes,
    colourFamily: input.colourFamily,
    createdAt: base.createdAt,
    popularity: base.popularity,
    tags: input.tags,
    styleId: base.styleId,
    sku: input.sku,
    description: input.description,
    specs: input.specs,
    sizeChart: input.sizeChart,
    model: input.model,
    legal: input.legal,
    ...(input.gstClass ? { gstClass: input.gstClass } : {}),
    ...(input.hsn ? { hsn: input.hsn } : {}),
    ...(input.seo ? { seo: input.seo } : {}),
    ...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {}),
    ...(input.weightGrams ? { weightGrams: input.weightGrams } : {}),
    ...(input.dimensionsCm ? { dimensionsCm: input.dimensionsCm } : {}),
    status: input.status,
    // "Show as sold out" is switched only through lib/catalog/hold.ts; a product save or CSV import keeps it.
    ...(base.soldOutHold === true ? { soldOutHold: true } : {}),
    version: base.version,
    updatedAt: now.toISOString(),
  };
}

function conflict(e: unknown): never {
  if (e instanceof CatalogConflictError) throw new CatalogAdminError("conflict", e.message, 409);
  throw e;
}

/** Every referenced photo must have been uploaded (no linking to made-up or foreign files). */
async function checkPhotos(deps: CatalogAdminDeps, input: ProductInput) {
  if (input.photos.length === 0) return;
  const found = deps.media ? await deps.media.existing(input.photos.map((p) => p.id)) : new Set<string>();
  if (input.photos.some((p) => !found.has(p.id))) throw new ValidationError("A photo wasn't found — upload it again.");
}

export async function createProduct(deps: CatalogAdminDeps, body: unknown, now = new Date()): Promise<ProductRecord> {
  const input = parseProductInput(body, await deps.store.getDocs());
  await checkPhotos(deps, input);
  let styleId = `style_${randomBytes(6).toString("hex")}`;
  if (input.styleId) {
    // Adding a colour to an existing style: the style must exist (no attaching to made-up groups).
    const exists = (await deps.store.listRecords()).some((r) => r.styleId === input.styleId);
    if (!exists) throw new ValidationError("That style doesn't exist.");
    styleId = input.styleId;
  }
  const record = apply(input, { id: `prd_${randomBytes(10).toString("hex")}`, styleId, createdAt: now.toISOString(), popularity: 0, version: 1, sizes: [] }, now);
  assertUniqueCodes([...(await deps.store.listRecords()), record]);
  await deps.store.insert(record).catch(conflict);
  deps.invalidate();
  return record;
}

export async function updateProduct(deps: CatalogAdminDeps, id: string, body: unknown, now = new Date()): Promise<ProductRecord> {
  const b = asObject(body);
  const version = b.version;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) throw new ValidationError("Missing version — reload the product.");
  const current = await deps.store.getRecord(id);
  if (!current) throw new CatalogAdminError("not_found", "Product not found.", 404);
  const input = parseProductInput(b, await deps.store.getDocs());
  await checkPhotos(deps, input);
  // The style can't be moved on edit (it would silently change another product's colour swatches).
  const next = apply(input, { ...current, version: version + 1 }, now);
  assertUniqueCodes([...(await deps.store.listRecords()).filter((r) => r.id !== id), next]);
  const ok = await deps.store.replace(next, version).catch(conflict);
  if (!ok) throw new CatalogAdminError("version_conflict", "Someone else changed this product. Reload to see their changes.", 409);
  deps.invalidate();
  return next;
}

/** The fields the admin list needs (no internal ids beyond the product id). */
export function adminRow(r: ProductRecord, onHand: Map<string, number>) {
  return {
    id: r.id,
    handle: r.handle,
    title: r.title,
    sku: r.sku,
    category: r.category,
    price: r.price,
    mrp: r.mrp,
    status: r.status,
    stock: r.sizes.reduce((n, s) => n + Math.max(0, onHand.get(`${r.id}::${s.label}`) ?? s.stock), 0),
    image: r.images[0],
    updatedAt: r.updatedAt,
  };
}
