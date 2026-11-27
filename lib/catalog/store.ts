import type { Category, CategoryNode, Collection, Product, SizeOption } from "@/lib/commerce/types";
import type { Paise } from "@/lib/format";
import type { CatalogSnapshot } from "./reader";
import type { CollectionRule } from "./collection-rules";
import type { HomepageContent } from "@/lib/cms/homepage";

/**
 * Own-backend catalogue (phase 4). Products are stored as records with a status and a version; the storefront
 * reads an assembled snapshot:
 * - only `active` products;
 * - stock per size from the database inventory (`inventory_skus.on_hand`), or the record's initial stock if
 *   that SKU hasn't been touched yet;
 * - colour swatches derived from the active products sharing a `styleId` (never stored twice);
 * - rating from the reviews table.
 */
export type ProductStatus = "draft" | "active" | "archived";
export const PRODUCT_STATUSES: readonly ProductStatus[] = ["draft", "active", "archived"];

/** A size variant as stored: its own SKU and barcode (GTIN / EAN) next to the opening stock. */
export interface RecordSize extends SizeOption {
  sku?: string;
  barcode?: string;
}

/**
 * One colour of a style, as stored. Fields after `sizes` up to `status` are ADMIN-ONLY: cost price, shipping weight
 * and package size, per-size SKU / barcode. `toProduct` drops them, so they never reach the storefront, page props or
 * feeds (cost price is commercially sensitive).
 */
export type ProductRecord = Omit<Product, "colours" | "rating" | "sizes"> & {
  sizes: RecordSize[];
  /** What the item costs us (paise), for margin reports. Never shown to shoppers. */
  costPrice?: Paise;
  /** Packed weight in grams (courier rate / label). */
  weightGrams?: number;
  /** Packed size in cm (courier volumetric weight). */
  dimensionsCm?: { length: number; width: number; height: number };
  status: ProductStatus;
  /**
   * "Show as sold out" (lib/catalog/hold.ts): the store shows every size as sold out and refuses to sell it, while the
   * real stock stays untouched — customers can only ask to be told when it's on sale. Absent = normal.
   */
  soldOutHold?: boolean;
  version: number;
  updatedAt: string;
};

/** Record fields that must never leave the admin (see ProductRecord). */
export const ADMIN_ONLY_FIELDS = ["costPrice", "weightGrams", "dimensionsCm", "status", "soldOutHold", "version", "updatedAt"] as const;

export interface CatalogDocs {
  tree: CategoryNode[];
  featured: Category[];
  collections: (Collection & { rule: CollectionRule })[];
  /** Top-level category handles for the "Shop all" page (/men), in order. Absent / null = every category. */
  shopAll?: string[] | null;
  /** Admin → Homepage: hero slides, campaign band, SEO block (lib/cms/homepage.ts). Absent = the built-in content. */
  homepage?: HomepageContent;
  /** Bumped by every admin save (optimistic lock, `replaceDocs`); absent = 0 (seeded / imported). */
  revision?: number;
}

export class CatalogConflictError extends Error {
  constructor(public readonly field: "id" | "handle" | "sku") {
    super(field === "handle" ? "Another product already uses this URL handle." : field === "sku" ? "Another product already uses this SKU." : "Duplicate product id.");
    this.name = "CatalogConflictError";
  }
}

export interface CatalogStore {
  /** Every product, ordered by id (a stable order: listings break popularity ties by it). */
  listRecords(): Promise<ProductRecord[]>;
  getRecord(id: string): Promise<ProductRecord | null>;
  /** Throws CatalogConflictError when the id, handle or SKU is taken. */
  insert(record: ProductRecord): Promise<void>;
  /** Writes only if the stored version is `expectedVersion` (returns false otherwise). Conflicts throw. */
  replace(record: ProductRecord, expectedVersion: number): Promise<boolean>;
  getDocs(): Promise<CatalogDocs | null>;
  putDocs(docs: CatalogDocs): Promise<void>;
  /**
   * Writes the documents only if the stored revision (absent = 0, no document = 0) is `expectedRevision`.
   * Returns false when someone else saved first. The caller sets `docs.revision` to the new value.
   */
  replaceDocs(docs: CatalogDocs, expectedRevision: number): Promise<boolean>;
  /** `${productId}::${size}` → on hand, for SKUs the inventory has seen. */
  onHand(): Promise<Map<string, number>>;
  /**
   * All-or-nothing write of several colours of one style (one transaction): inserts new records and replaces existing
   * ones only if every stored version still matches. Returns false (nothing written) when any version is stale.
   * Throws CatalogConflictError when an id, handle or SKU is taken.
   */
  writeMany(inserts: ProductRecord[], replaces: { record: ProductRecord; expectedVersion: number }[]): Promise<boolean>;
}

export const skuKey = (productId: string, size: string) => `${productId}::${size}`;

export function recordFromProduct(p: Product, now: Date, status: ProductStatus = "active"): ProductRecord {
  const { colours: _c, rating: _r, ...rest } = structuredClone(p);
  void _c;
  void _r;
  return { ...rest, status, version: 1, updatedAt: now.toISOString() };
}

/**
 * The storefront shape of a record. A held record (`soldOutHold`) shows 0 per size — every listing, filter, sort, feed
 * and product page then treats it as sold out. `raw` keeps the real numbers: the inventory seeds a SKU from them, and
 * Admin → Inventory shows them (a hold must never turn into a real stock loss).
 */
export function toProduct(r: ProductRecord, colours: Product["colours"], rating: Product["rating"], onHand: Map<string, number>, opts: { raw?: boolean } = {}): Product {
  const rest: Partial<ProductRecord> = structuredClone(r);
  for (const k of ADMIN_ONLY_FIELDS) delete rest[k];
  const held = r.soldOutHold === true && !opts.raw;
  return {
    ...(rest as Omit<Product, "colours" | "rating" | "sizes">),
    rating,
    colour: colours.find((c) => c.handle === r.handle) ?? r.colour,
    colours,
    sizes: r.sizes.map((s) => ({ label: s.label, stock: held ? 0 : Math.max(0, onHand.get(skuKey(r.id, s.label)) ?? s.stock) })),
  };
}

export function buildSnapshot(
  records: ProductRecord[],
  docs: CatalogDocs | null,
  onHand: Map<string, number>,
  ratings: Map<string, { average: number; count: number }>,
  now: number,
  opts: { raw?: boolean } = {},
): CatalogSnapshot {
  const active = records.filter((r) => r.status === "active");
  const byStyle = new Map<string, ProductRecord[]>();
  for (const r of active) byStyle.set(r.styleId, [...(byStyle.get(r.styleId) ?? []), r]);
  const swatches = new Map<string, Product["colours"]>();
  for (const [style, rs] of byStyle) {
    const ordered = [...rs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    swatches.set(style, ordered.map((r) => ({ name: r.colour.name, hex: r.colour.hex, handle: r.handle })));
  }
  return {
    products: active.map((r) => toProduct(r, swatches.get(r.styleId)!, ratings.get(r.styleId), onHand, opts)),
    held: new Set(active.filter((r) => r.soldOutHold === true).map((r) => r.id)),
    tree: docs?.tree ?? [],
    featured: docs?.featured ?? [],
    collections: docs?.collections ?? [],
    now,
  };
}

/** In-memory store (tests and the memory contract target). */
export function createMemoryCatalogStore(): CatalogStore {
  const records = new Map<string, ProductRecord>();
  let docs: CatalogDocs | null = null;
  const clash = (r: ProductRecord) => {
    for (const x of records.values()) {
      if (x.id === r.id) continue;
      if (x.handle === r.handle) throw new CatalogConflictError("handle");
      if (x.sku === r.sku) throw new CatalogConflictError("sku");
    }
  };
  return {
    async listRecords() {
      return [...records.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((r) => structuredClone(r));
    },
    async getRecord(id) {
      const r = records.get(id);
      return r ? structuredClone(r) : null;
    },
    async insert(r) {
      if (records.has(r.id)) throw new CatalogConflictError("id");
      clash(r);
      records.set(r.id, structuredClone(r));
    },
    async replace(r, expectedVersion) {
      const cur = records.get(r.id);
      if (!cur || cur.version !== expectedVersion) return false;
      clash(r);
      records.set(r.id, structuredClone(r));
      return true;
    },
    async getDocs() {
      return docs ? structuredClone(docs) : null;
    },
    async putDocs(d) {
      docs = structuredClone(d);
    },
    async replaceDocs(d, expected) {
      if ((docs?.revision ?? 0) !== expected) return false;
      docs = structuredClone(d);
      return true;
    },
    async onHand() {
      return new Map();
    },
    async writeMany(inserts, replaces) {
      if (replaces.some(({ record, expectedVersion }) => records.get(record.id)?.version !== expectedVersion)) return false;
      if (inserts.some((r) => records.has(r.id))) throw new CatalogConflictError("id");
      // Check every clash against the result of the whole write before changing anything (all or nothing).
      const next = new Map(records);
      for (const r of [...inserts, ...replaces.map((x) => x.record)]) next.set(r.id, r);
      const seen = new Map<string, string>();
      for (const r of next.values()) {
        for (const [k, field] of [[`h:${r.handle}`, "handle"], [`s:${r.sku}`, "sku"]] as const) {
          if (seen.has(k) && seen.get(k) !== r.id) throw new CatalogConflictError(field);
          seen.set(k, r.id);
        }
      }
      for (const r of [...inserts, ...replaces.map((x) => x.record)]) records.set(r.id, structuredClone(r));
      return true;
    },
  };
}
