import type { Category, CategoryNode, Collection, Product } from "@/lib/commerce/types";
import type { CatalogSnapshot } from "./reader";
import type { CollectionRule } from "./collection-rules";

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

export type ProductRecord = Omit<Product, "colours" | "rating"> & {
  status: ProductStatus;
  version: number;
  updatedAt: string;
};

export interface CatalogDocs {
  tree: CategoryNode[];
  featured: Category[];
  collections: (Collection & { rule: CollectionRule })[];
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
  /** `${productId}::${size}` → on hand, for SKUs the inventory has seen. */
  onHand(): Promise<Map<string, number>>;
}

export const skuKey = (productId: string, size: string) => `${productId}::${size}`;

export function recordFromProduct(p: Product, now: Date, status: ProductStatus = "active"): ProductRecord {
  const { colours: _c, rating: _r, ...rest } = structuredClone(p);
  void _c;
  void _r;
  return { ...rest, status, version: 1, updatedAt: now.toISOString() };
}

export function toProduct(r: ProductRecord, colours: Product["colours"], rating: Product["rating"], onHand: Map<string, number>): Product {
  const { status: _s, version: _v, updatedAt: _u, ...rest } = structuredClone(r);
  void _s;
  void _v;
  void _u;
  return {
    ...rest,
    rating,
    colour: colours.find((c) => c.handle === r.handle) ?? r.colour,
    colours,
    sizes: r.sizes.map((s) => ({ label: s.label, stock: Math.max(0, onHand.get(skuKey(r.id, s.label)) ?? s.stock) })),
  };
}

export function buildSnapshot(
  records: ProductRecord[],
  docs: CatalogDocs | null,
  onHand: Map<string, number>,
  ratings: Map<string, { average: number; count: number }>,
  now: number,
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
    products: active.map((r) => toProduct(r, swatches.get(r.styleId)!, ratings.get(r.styleId), onHand)),
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
    async onHand() {
      return new Map();
    },
  };
}
