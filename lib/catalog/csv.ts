import { ValidationError } from "@/lib/http/guard";
import { csvCell, uncsvCell } from "@/lib/security/csv-cell";
import { assertUniqueCodes, type CatalogAdminDeps, CatalogAdminError, photosFromImages } from "./admin";
import { ATTRIBUTE_VALUES } from "./attributes";
import { defaultArt } from "./product-options";
import { CatalogConflictError, type ProductRecord, skuKey } from "./store";
import { baseTitleOf, saveStyle, STYLE_ID_RE } from "./style";

/**
 * ADM-01 bulk CSV export / import of the catalogue. One row per SIZE (Shopify-style): style columns repeat on every
 * row of a product, colour columns on every row of a colour.
 *
 * Import = upsert through the SAME rules as the editor (`saveStyle`): a file can't store anything the editor couldn't.
 * - Plan first (dry run): every product validated, nothing written; the report lists create / update / unchanged and
 *   row-level errors. Apply only runs when the plan has no errors.
 * - Each product is written in one transaction (all its colours or none). A stopped import can be re-run: products
 *   are matched by `style_id`, else by a known `colour_sku`, else created.
 * - Columns left out of the file keep their current values; photos are never touched by CSV (editor only).
 * - `stock` is the opening stock of NEW sizes only; existing stock changes go through Inventory (audited).
 *
 * Threat model: a CSV is attacker-controllable input (a staff member may import a file from a supplier).
 * - Size and row caps; strict RFC 4180 parser; unknown columns refused; every value validated by the editor's
 *   allow-lists (`parseProductInput`).
 * - Formula injection: exported cells starting with = + - @ tab CR are prefixed with ' (`csvCell`), and that
 *   prefix is removed again on import so values round-trip.
 * - Cost price is exported only for staff who can edit the catalogue.
 * - Ids in the file (`style_id`) must exist; colours are matched inside that style only.
 */

export const MAX_CSV_BYTES = 2_500_000;
export const MAX_CSV_ROWS = 5000;
const MAX_STYLES = 1000;

const ATTRS = Object.keys(ATTRIBUTE_VALUES) as (keyof typeof ATTRIBUTE_VALUES)[];

export const CSV_COLUMNS = [
  "style_id",
  "product_name",
  "category",
  "subcategory",
  "description",
  "tags",
  ...ATTRS,
  "specs",
  "size_chart",
  "placeholder_art",
  "model_height",
  "model_size",
  "manufacturer",
  "packer",
  "importer",
  "country_of_origin",
  "net_quantity",
  "gst_class",
  "hsn",
  "weight_grams",
  "length_cm",
  "width_cm",
  "height_cm",
  "colour",
  "colour_hex",
  "colour_family",
  "status",
  "handle",
  "colour_sku",
  "price_inr",
  "mrp_inr",
  "cost_price_inr",
  "badge",
  "seo_title",
  "seo_description",
  "size",
  "size_sku",
  "barcode",
  "stock",
] as const;
type Column = (typeof CSV_COLUMNS)[number];
const REQUIRED: Column[] = ["product_name", "colour", "colour_sku", "size"];

// ── CSV text ─────────────────────────────────────────────────────────────────────────────────────

/** RFC 4180 parser (quoted fields, "" escapes, CRLF / LF, BOM). Throws on an unterminated quote. */
export function parseCsv(text: string, maxRows = MAX_CSV_ROWS + 1): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const endCell = () => {
    if (cell.length > 4000) throw new ValidationError(`Row ${rows.length + 1}: a cell is longer than 4000 characters.`);
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (row.length > 80) throw new ValidationError(`Row ${rows.length + 1}: too many columns.`);
    rows.push(row);
    row = [];
    if (rows.length > maxRows) throw new ValidationError(`At most ${maxRows - 1} rows per file — split it.`);
  };
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") endCell();
    else if (ch === "\n" || ch === "\r") {
      endRow();
      if (ch === "\r" && src[i + 1] === "\n") i++;
    } else cell += ch;
    i++;
  }
  if (quoted) throw new ValidationError("The file has an unclosed quote.");
  if (cell !== "" || row.length) endRow();
  return rows;
}

// ── Export ───────────────────────────────────────────────────────────────────────────────────────

const inr = (paise: number | undefined) => (paise === undefined ? "" : (paise / 100).toFixed(2));

export async function exportCatalogCsv(deps: CatalogAdminDeps, canSeeCost: boolean): Promise<{ csv: string; rows: number }> {
  const [records, onHand] = await Promise.all([deps.store.listRecords(), deps.store.onHand()]);
  const columns = CSV_COLUMNS.filter((c) => canSeeCost || c !== "cost_price_inr");
  const ordered = [...records].sort((a, b) => a.styleId.localeCompare(b.styleId) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const lines = [columns.join(",")];
  for (const r of ordered) {
    for (const s of r.sizes) {
      const v: Record<Column, unknown> = {
        style_id: r.styleId,
        product_name: baseTitleOf(r.title),
        category: r.category,
        subcategory: r.subcategory ?? "",
        description: r.description,
        tags: r.tags.join(" | "),
        fit: r.attributes.fit ?? "",
        fabric: r.attributes.fabric ?? "",
        sleeve: r.attributes.sleeve ?? "",
        pattern: r.attributes.pattern ?? "",
        occasion: r.attributes.occasion ?? "",
        specs: r.specs.map((x) => `${x.label}: ${x.value}`).join(" | "),
        size_chart: r.sizeChart,
        placeholder_art: r.images[0]?.art ?? "",
        model_height: r.model?.height ?? "",
        model_size: r.model?.size ?? "",
        manufacturer: r.legal.manufacturer,
        packer: r.legal.packer ?? "",
        importer: r.legal.importer ?? "",
        country_of_origin: r.legal.countryOfOrigin,
        net_quantity: r.legal.netQuantity,
        gst_class: r.gstClass ?? "",
        hsn: r.hsn ?? "",
        weight_grams: r.weightGrams ?? "",
        length_cm: r.dimensionsCm?.length ?? "",
        width_cm: r.dimensionsCm?.width ?? "",
        height_cm: r.dimensionsCm?.height ?? "",
        colour: r.colour.name,
        colour_hex: r.colour.hex,
        colour_family: r.colourFamily,
        status: r.status,
        handle: r.handle,
        colour_sku: r.sku,
        price_inr: inr(r.price),
        mrp_inr: inr(r.mrp),
        cost_price_inr: inr(r.costPrice),
        badge: r.badge ?? "",
        seo_title: r.seo?.title ?? "",
        seo_description: r.seo?.description ?? "",
        size: s.label,
        size_sku: s.sku ?? "",
        barcode: s.barcode ?? "",
        stock: Math.max(0, onHand.get(skuKey(r.id, s.label)) ?? s.stock),
      };
      lines.push(columns.map((c) => csvCell(v[c])).join(","));
    }
  }
  return { csv: `${lines.join("\r\n")}\r\n`, rows: lines.length - 1 };
}

// ── Import ───────────────────────────────────────────────────────────────────────────────────────

interface Row {
  line: number;
  cells: Partial<Record<Column, string>>;
}

export interface ImportGroupReport {
  rows: string;
  title: string;
  styleId: string | null;
  action: "create" | "update" | "unchanged" | "error";
  colours: number;
  sizes: number;
  error?: string;
}

export interface ImportReport {
  ok: boolean;
  applied: boolean;
  totals: { rows: number; create: number; update: number; unchanged: number; errors: number };
  errors: string[];
  groups: ImportGroupReport[];
}

function rupeesToPaise(v: string, field: string): number {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(v)) throw new ValidationError(`${field}: enter rupees like 1499 or 1499.50.`);
  const [r, p = ""] = v.split(".");
  return Number(r) * 100 + Number(p.padEnd(2, "0"));
}
function wholeNumber(v: string, field: string): number {
  if (!/^\d{1,6}$/.test(v)) throw new ValidationError(`${field}: enter a whole number.`);
  return Number(v);
}

/** Shared (style-level) part of a saveStyle body from a stored colour. */
function sharedFromRecord(r: ProductRecord): Record<string, unknown> {
  return {
    baseTitle: baseTitleOf(r.title),
    category: r.category,
    subcategory: r.subcategory,
    art: r.images[0]?.art ?? "tee",
    attributes: r.attributes,
    tags: r.tags,
    description: r.description,
    specs: r.specs,
    sizeChart: r.sizeChart,
    model: r.model,
    legal: r.legal,
    gstClass: r.gstClass,
    hsn: r.hsn,
    weightGrams: r.weightGrams,
    dimensionsCm: r.dimensionsCm,
  };
}

function variantFromRecord(r: ProductRecord): Record<string, unknown> {
  return {
    id: r.id,
    version: r.version,
    colour: { name: r.colour.name, hex: r.colour.hex },
    colourFamily: r.colourFamily,
    handle: r.handle,
    sku: r.sku,
    price: r.price,
    mrp: r.mrp,
    costPrice: r.costPrice,
    badge: r.badge,
    sizes: r.sizes.map((s) => ({ label: s.label, stock: s.stock, sku: s.sku, barcode: s.barcode })),
    photos: photosFromImages(r.images),
    status: r.status,
    seo: r.seo,
  };
}

/** One value for a group of rows: the first non-empty cell; a different non-empty cell later is an error. */
function pick(rows: Row[], col: Column, what: string): string | undefined {
  let value: string | undefined;
  let at = 0;
  for (const r of rows) {
    const v = r.cells[col];
    if (v === undefined || v === "") continue;
    if (value === undefined) {
      value = v;
      at = r.line;
    } else if (v !== value) {
      throw new ValidationError(`Row ${r.line}: ${col} “${v.slice(0, 40)}” differs from row ${at} of the same ${what} (“${value.slice(0, 40)}”).`);
    }
  }
  return value;
}

const lineRange = (rows: Row[]) => {
  const a = rows[0].line;
  const b = rows.at(-1)!.line;
  return a === b ? String(a) : `${a}–${b}`;
};

function buildBody(rows: Row[], has: Set<Column>, existing: ProductRecord[]): Record<string, unknown> {
  const sorted = [...existing].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const body: Record<string, unknown> = sorted.length ? sharedFromRecord(sorted[0]) : {};
  const get = (col: Column) => (has.has(col) ? (pick(rows, col, "product") ?? "") : undefined);
  const set = (key: string, col: Column, map: (v: string) => unknown = (v) => v) => {
    const v = get(col);
    if (v !== undefined) body[key] = v === "" ? undefined : map(v);
  };
  set("baseTitle", "product_name");
  set("category", "category");
  set("subcategory", "subcategory");
  set("description", "description");
  set("tags", "tags", (v) => v.split("|").map((t) => t.trim()).filter(Boolean));
  set("sizeChart", "size_chart");
  set("art", "placeholder_art");
  // A new product from a sheet without a `placeholder_art` cell still needs a drawing until photos are uploaded:
  // start from the category's usual one. An existing product keeps what it has.
  if (body.art === undefined) body.art = defaultArt(body.category, body.subcategory);
  set("gstClass", "gst_class");
  set("hsn", "hsn");
  set("weightGrams", "weight_grams", (v) => wholeNumber(v, "weight_grams"));
  set("specs", "specs", (v) =>
    v
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const i = x.indexOf(":");
        if (i < 1) throw new ValidationError(`specs: write “Name: value | Name: value”.`);
        return { label: x.slice(0, i).trim(), value: x.slice(i + 1).trim() };
      }),
  );
  if (ATTRS.some((a) => has.has(a))) {
    const attributes = { ...((body.attributes as Record<string, string>) ?? {}) };
    for (const a of ATTRS) {
      const v = get(a);
      if (v === undefined) continue;
      if (v === "") delete attributes[a];
      else attributes[a] = v;
    }
    body.attributes = attributes;
  }
  if (has.has("model_height") || has.has("model_size")) {
    const prev = body.model as { height: string; size: string } | undefined;
    const height = get("model_height") ?? prev?.height ?? "";
    const size = get("model_size") ?? prev?.size ?? "";
    body.model = height && size ? { height, size } : undefined;
  }
  const legalCols: [Column, string][] = [["manufacturer", "manufacturer"], ["packer", "packer"], ["importer", "importer"], ["country_of_origin", "countryOfOrigin"], ["net_quantity", "netQuantity"]];
  if (legalCols.some(([c]) => has.has(c))) {
    const legal = { ...((body.legal as Record<string, string>) ?? {}) };
    for (const [c, k] of legalCols) {
      const v = get(c);
      if (v === undefined) continue;
      if (v === "") delete legal[k];
      else legal[k] = v;
    }
    body.legal = legal;
  }
  if (has.has("length_cm") || has.has("width_cm") || has.has("height_cm")) {
    const prev = body.dimensionsCm as { length: number; width: number; height: number } | undefined;
    const dim = (c: Column, k: "length" | "width" | "height") => {
      const v = get(c);
      return v === undefined ? prev?.[k] : v === "" ? undefined : wholeNumber(v, c);
    };
    const d = { length: dim("length_cm", "length"), width: dim("width_cm", "width"), height: dim("height_cm", "height") };
    body.dimensionsCm = d.length === undefined && d.width === undefined && d.height === undefined ? undefined : d;
  }

  // Colours, in file order; existing colours missing from the file are kept unchanged.
  const byName = new Map<string, Row[]>();
  for (const r of rows) {
    const k = (r.cells.colour ?? "").trim().toLowerCase();
    byName.set(k, [...(byName.get(k) ?? []), r]);
  }
  const existingByName = new Map(existing.map((r) => [r.colour.name.toLowerCase(), r]));
  const variants: Record<string, unknown>[] = [];
  for (const [key, crow] of byName) {
    const prev = existingByName.get(key);
    existingByName.delete(key);
    const v: Record<string, unknown> = prev ? variantFromRecord(prev) : { photos: [], status: "draft" };
    const cget = (col: Column) => (has.has(col) ? (pick(crow, col, "colour") ?? "") : undefined);
    const cset = (k: string, col: Column, map: (x: string) => unknown = (x) => x) => {
      const x = cget(col);
      if (x !== undefined) v[k] = x === "" ? undefined : map(x);
    };
    const name = cget("colour") ?? "";
    v.colour = { name, hex: cget("colour_hex") || (prev?.colour.hex ?? "") };
    cset("colourFamily", "colour_family");
    cset("status", "status");
    cset("handle", "handle");
    cset("sku", "colour_sku");
    cset("price", "price_inr", (x) => rupeesToPaise(x, "price_inr"));
    cset("mrp", "mrp_inr", (x) => rupeesToPaise(x, "mrp_inr"));
    cset("costPrice", "cost_price_inr", (x) => rupeesToPaise(x, "cost_price_inr"));
    cset("badge", "badge");
    if (has.has("seo_title") || has.has("seo_description")) {
      const p = (v.seo as { title?: string; description?: string } | undefined) ?? {};
      const title = cget("seo_title") ?? p.title ?? "";
      const description = cget("seo_description") ?? p.description ?? "";
      v.seo = title || description ? { ...(title ? { title } : {}), ...(description ? { description } : {}) } : undefined;
    }
    const prevSizes = new Map(prev?.sizes.map((s) => [s.label, s]) ?? []);
    v.sizes = crow.map((r) => {
      const label = r.cells.size ?? "";
      const old = prevSizes.get(label);
      const code = (col: Column, prevValue: string | undefined) => (has.has(col) ? r.cells[col] || undefined : prevValue);
      return {
        label,
        stock: old ? old.stock : has.has("stock") && r.cells.stock ? wholeNumber(r.cells.stock, `Row ${r.line}: stock`) : 0,
        sku: code("size_sku", old?.sku),
        barcode: code("barcode", old?.barcode),
      };
    });
    variants.push(v);
  }
  for (const r of existingByName.values()) variants.push(variantFromRecord(r));
  body.variants = variants;
  return body;
}

/** Plans (and with `apply`, runs) a CSV import. */
export async function importCatalogCsv(deps: CatalogAdminDeps, text: string, apply: boolean, now = new Date()): Promise<ImportReport> {
  if (typeof text !== "string" || text.length === 0) throw new ValidationError("Choose a CSV file.");
  if (text.length > MAX_CSV_BYTES) throw new ValidationError("The file is larger than 2.5 MB — split it.");
  const table = parseCsv(text);
  if (table.length < 2) throw new ValidationError("The file has no product rows.");
  const header = table[0].map((h) => h.trim().toLowerCase());
  const known = new Set<string>(CSV_COLUMNS);
  const unknown = header.filter((h) => !known.has(h));
  if (unknown.length) throw new ValidationError(`Unknown column${unknown.length === 1 ? "" : "s"}: ${unknown.slice(0, 5).join(", ")}. Use the exported file as the template.`);
  if (new Set(header).size !== header.length) throw new ValidationError("A column appears twice.");
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) throw new ValidationError(`Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  const has = new Set(header as Column[]);

  const rows: Row[] = [];
  table.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c.trim() === "")) return;
    const r: Row = { line: i + 2, cells: {} };
    header.forEach((h, j) => (r.cells[h as Column] = uncsvCell((cells[j] ?? "").trim())));
    rows.push(r);
  });
  if (rows.length === 0) throw new ValidationError("The file has no product rows.");
  if (rows.length > MAX_CSV_ROWS) throw new ValidationError(`At most ${MAX_CSV_ROWS} rows per file — split it.`);

  const records = await deps.store.listRecords();
  const styleOfSku = new Map(records.map((r) => [r.sku, r.styleId]));
  const knownStyles = new Set(records.map((r) => r.styleId));
  const report: ImportReport = { ok: false, applied: false, totals: { rows: rows.length, create: 0, update: 0, unchanged: 0, errors: 0 }, errors: [], groups: [] };

  // Group rows into products: by style_id, else by product name.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    for (const c of REQUIRED) if (!r.cells[c]) report.errors.push(`Row ${r.line}: ${c} is empty.`);
    const sid = r.cells.style_id;
    if (sid && (!STYLE_ID_RE.test(sid) || !knownStyles.has(sid))) {
      report.errors.push(`Row ${r.line}: style_id “${sid.slice(0, 40)}” doesn't exist. Leave it empty to create a new product.`);
      continue;
    }
    const k = sid ? `id:${sid}` : `name:${(r.cells.product_name ?? "").toLowerCase()}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  if (groups.size > MAX_STYLES) report.errors.push(`At most ${MAX_STYLES} products per file — split it.`);

  const planned: { styleId: string | null; body: Record<string, unknown>; records: ProductRecord[]; report: ImportGroupReport }[] = [];
  const claimed = new Map<string, string>();
  for (const [k, grows] of groups) {
    const title = grows[0].cells.product_name ?? "";
    const g: ImportGroupReport = { rows: lineRange(grows), title, styleId: null, action: "create", colours: new Set(grows.map((r) => (r.cells.colour ?? "").toLowerCase())).size, sizes: grows.length };
    report.groups.push(g);
    try {
      let styleId: string | null = k.startsWith("id:") ? k.slice(3) : null;
      if (!styleId) {
        // Re-running a file: a known colour SKU identifies the product it was created as.
        const found = new Set(grows.map((r) => styleOfSku.get((r.cells.colour_sku ?? "").toUpperCase())).filter((x): x is string => !!x));
        if (found.size > 1) throw new ValidationError("its colour SKUs belong to different existing products. Add style_id to say which one.");
        styleId = found.size ? [...found][0] : null;
      }
      if (styleId) {
        if (claimed.has(styleId)) throw new ValidationError(`the same product as rows ${claimed.get(styleId)}. Keep a product's rows together under one style_id / name.`);
        claimed.set(styleId, g.rows);
      }
      g.styleId = styleId;
      const existing = styleId ? records.filter((r) => r.styleId === styleId) : [];
      const body = buildBody(grows, has, existing);
      const dry = await saveStyle(deps, styleId, body, now, { dryRun: true });
      g.action = !styleId ? "create" : dry.changed.length ? "update" : "unchanged";
      planned.push({ styleId, body, records: dry.records, report: g });
    } catch (e) {
      g.action = "error";
      g.error = e instanceof Error ? e.message : "invalid";
      report.errors.push(`Rows ${g.rows} (${title || "no name"}): ${g.error}`);
    }
  }

  // Codes and web addresses must also be unique ACROSS the products of this file.
  if (report.errors.length === 0) {
    try {
      const touched = new Set(planned.map((p) => p.styleId).filter(Boolean));
      const all = [...records.filter((r) => !touched.has(r.styleId)), ...planned.flatMap((p) => p.records)];
      assertUniqueCodes(all);
      const handles = new Map<string, string>();
      for (const r of all) {
        if (handles.has(r.handle) && handles.get(r.handle) !== r.id) throw new ValidationError(`Two products in the file use the web address “${r.handle}”.`);
        handles.set(r.handle, r.id);
      }
    } catch (e) {
      report.errors.push(e instanceof Error ? e.message : "Duplicate codes in the file.");
    }
  }

  count(report);
  if (!apply || !report.ok) return report;

  // Apply: one transaction per product. A failure (e.g. someone saved meanwhile) is reported; re-running is safe.
  for (const p of planned) {
    if (p.report.action === "unchanged") continue;
    try {
      const r = await saveStyle(deps, p.styleId, p.body, now);
      p.report.styleId = r.styleId;
    } catch (e) {
      const msg = e instanceof CatalogAdminError || e instanceof CatalogConflictError || e instanceof ValidationError ? e.message : "failed";
      p.report.action = "error";
      p.report.error = msg;
      report.errors.push(`Rows ${p.report.rows} (${p.report.title}): ${msg}`);
    }
  }
  report.applied = true;
  count(report);
  return report;
}

function count(report: ImportReport) {
  report.totals = { rows: report.totals.rows, create: 0, update: 0, unchanged: 0, errors: report.errors.length };
  for (const g of report.groups) if (g.action !== "error") report.totals[g.action]++;
  report.ok = report.errors.length === 0;
}
