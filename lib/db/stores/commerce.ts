import { type CartRepo, createCartOps, type StoredCart } from "@/lib/commerce/cart-engine";
import { CommerceError, type CommerceAdapter, type Product } from "@/lib/commerce/types";
import type { MongoConn } from "../mongo";
import { mongoTx } from "../mongo";
import type { Primitives } from "../primitives";
import { fromJson, isUniqueViolation, type SqlDb, sqlTx } from "../sql";

/**
 * Bag + stock on the own backend. The catalogue still comes from the given adapter (products move to the
 * database in phase 4); carts and inventory are persisted here.
 *
 * Inventory model: `on_hand` per SKU (initialised once from the catalogue's stock, then owned by the database)
 * minus units held by live reservations. Every check-and-hold is atomic:
 * - SQL: SKU rows locked `FOR UPDATE` in a fixed order (no deadlocks), inside one transaction;
 * - MongoDB: the SKU documents are touched inside the transaction, so two concurrent holds conflict and one retries.
 * Commit / release / restock are conditional and idempotent per reference (UNIQUE markers).
 */
type Item = { productId: string; size: string; quantity: number };
type Inventory = CommerceAdapter["inventory"];
const skuKey = (productId: string, size: string) => `${productId}::${size}`;

function baseStock(catalog: CommerceAdapter) {
  return async (productId: string, size: string): Promise<number | null> => {
    const p = await catalog.getProductById(productId);
    const s = p?.sizes.find((x) => x.label === size);
    return s ? s.stock : null;
  };
}

function needed(items: Item[]) {
  const m = new Map<string, Item>();
  for (const i of items) {
    if (!Number.isInteger(i.quantity) || i.quantity < 1) throw new CommerceError("invalid_input", "Invalid quantity");
    const k = skuKey(i.productId, i.size);
    const prev = m.get(k);
    m.set(k, { productId: i.productId, size: i.size, quantity: (prev?.quantity ?? 0) + i.quantity });
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v); // fixed lock order
}

async function snapshotFrom(catalog: CommerceAdapter, read: (skus: { productId: string; size: string }[]) => Promise<Map<string, { onHand: number; held: number }>>) {
  const all: Product[] = [];
  for (let offset = 0; offset < 10_000; offset += 60) {
    const { products, total } = await catalog.listProducts({ limit: 60, offset });
    all.push(...products);
    if (products.length === 0 || all.length >= total) break;
  }
  const skus = all.flatMap((p) => p.sizes.map((s) => ({ productId: p.id, size: s.label, base: s.stock })));
  const state = await read(skus);
  return skus.map((s) => {
    const st = state.get(skuKey(s.productId, s.size));
    const onHand = st ? st.onHand : s.base;
    const held = Math.min(onHand, st?.held ?? 0);
    return { productId: s.productId, size: s.size, onHand, held, available: Math.max(0, onHand - held) };
  });
}

// ── SQL ──────────────────────────────────────────────────────────────────────────────────────────

export function createSqlInventory(db: SqlDb, p: Primitives, catalog: CommerceAdapter): Inventory {
  const base = baseStock(catalog);

  /** Makes sure the SKU row exists (seeded from the catalogue once); returns false for an unknown SKU. */
  async function ensureSku(q: SqlDb, productId: string, size: string): Promise<boolean> {
    const has = await q.selectFrom("inventory_skus").select("on_hand").where("product_id", "=", productId).where("size", "=", size).executeTakeFirst();
    if (has) return true;
    const stock = await base(productId, size);
    if (stock === null) return false;
    try {
      await q.insertInto("inventory_skus").values({ product_id: productId, size, on_hand: stock }).execute();
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // seeded concurrently — fine
    }
    return true;
  }

  async function heldFor(q: SqlDb, productId: string, size: string, now: Date, ignore?: string) {
    let sel = q
      .selectFrom("inventory_reservation_items as i")
      .innerJoin("inventory_reservations as r", "r.reference", "i.reference")
      .select((eb) => eb.fn.coalesce(eb.fn.sum<number>("i.quantity"), eb.lit(0)).as("held"))
      .where("i.product_id", "=", productId)
      .where("i.size", "=", size)
      .where("r.state", "=", "held")
      .where("r.expires_at", ">", now);
    if (ignore) sel = sel.where("r.reference", "!=", ignore);
    const r = await sel.executeTakeFirst();
    return Number(r?.held ?? 0);
  }

  async function onHandLocked(q: SqlDb, productId: string, size: string) {
    const r = await q.selectFrom("inventory_skus").select("on_hand").where("product_id", "=", productId).where("size", "=", size).forUpdate().executeTakeFirst();
    return r ? Number(r.on_hand) : null;
  }

  return {
    async available(productId, size, now = new Date()) {
      if (!(await ensureSku(db, productId, size))) return 0;
      const r = await db.selectFrom("inventory_skus").select("on_hand").where("product_id", "=", productId).where("size", "=", size).executeTakeFirst();
      return Math.max(0, Number(r?.on_hand ?? 0) - (await heldFor(db, productId, size, now)));
    },

    async reserve(reference, items, ttlMs, now = new Date()) {
      const list = needed(items);
      for (const i of list) await ensureSku(db, i.productId, i.size);
      await sqlTx(db, async (trx) => {
        const existing = await trx.selectFrom("inventory_reservations").select(["state", "expires_at"]).where("reference", "=", reference).forUpdate().executeTakeFirst();
        if (existing && existing.state === "held" && new Date(existing.expires_at).getTime() > now.getTime()) return;
        for (const i of list) {
          const onHand = await onHandLocked(trx, i.productId, i.size);
          if (onHand === null || onHand - (await heldFor(trx, i.productId, i.size, now, reference)) < i.quantity) {
            throw new CommerceError("out_of_stock", "Not enough stock");
          }
        }
        await trx.deleteFrom("inventory_reservation_items").where("reference", "=", reference).execute();
        await trx.deleteFrom("inventory_reservations").where("reference", "=", reference).execute();
        await trx.insertInto("inventory_reservations").values({ reference, state: "held", expires_at: new Date(now.getTime() + ttlMs) }).execute();
        await trx.insertInto("inventory_reservation_items").values(list.map((i) => ({ reference, product_id: i.productId, size: i.size, quantity: i.quantity }))).execute();
      });
    },

    async commit(reference) {
      await sqlTx(db, async (trx) => {
        const r = await trx.updateTable("inventory_reservations").set({ state: "committed" }).where("reference", "=", reference).where("state", "=", "held").executeTakeFirst();
        if (Number(r.numUpdatedRows) !== 1) return; // already committed / released / unknown → no-op
        const lines = await trx.selectFrom("inventory_reservation_items").selectAll().where("reference", "=", reference).orderBy("product_id").orderBy("size").execute();
        for (const l of lines) {
          await onHandLocked(trx, l.product_id, l.size);
          await trx.updateTable("inventory_skus").set((eb) => ({ on_hand: eb("on_hand", "-", l.quantity) })).where("product_id", "=", l.product_id).where("size", "=", l.size).execute();
        }
      });
    },

    async release(reference) {
      await db.updateTable("inventory_reservations").set({ state: "released" }).where("reference", "=", reference).where("state", "=", "held").execute();
    },

    async restock(reference, items) {
      const list = items.filter((i) => Number.isInteger(i.quantity) && i.quantity >= 1);
      for (const i of list) await ensureSku(db, i.productId, i.size);
      await sqlTx(db, async (trx) => {
        try {
          await trx.insertInto("markers").values({ namespace: "restock", marker_key: reference, created_at: new Date() }).execute();
        } catch (e) {
          if (isUniqueViolation(e)) return; // this reference was already restocked
          throw e;
        }
        for (const i of needed(list)) {
          await trx.updateTable("inventory_skus").set((eb) => ({ on_hand: eb("on_hand", "+", i.quantity) })).where("product_id", "=", i.productId).where("size", "=", i.size).execute();
        }
      });
    },

    async adjust(productId, size, delta) {
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10_000) throw new CommerceError("invalid_input", "Invalid adjustment");
      if (!(await ensureSku(db, productId, size))) throw new CommerceError("not_found", "SKU not found");
      return sqlTx(db, async (trx) => {
        const onHand = (await onHandLocked(trx, productId, size))!;
        if (onHand + delta < 0) throw new CommerceError("invalid_input", "Stock can't go below zero");
        await trx.updateTable("inventory_skus").set({ on_hand: onHand + delta }).where("product_id", "=", productId).where("size", "=", size).execute();
        return onHand + delta;
      });
    },

    snapshot(now = new Date()) {
      return snapshotFrom(catalog, async () => {
        const rows = await db.selectFrom("inventory_skus").selectAll().execute();
        const held = await db
          .selectFrom("inventory_reservation_items as i")
          .innerJoin("inventory_reservations as r", "r.reference", "i.reference")
          .select(["i.product_id", "i.size", (eb) => eb.fn.sum<number>("i.quantity").as("held")])
          .where("r.state", "=", "held")
          .where("r.expires_at", ">", now)
          .groupBy(["i.product_id", "i.size"])
          .execute();
        const m = new Map<string, { onHand: number; held: number }>();
        for (const r of rows) m.set(skuKey(r.product_id, r.size), { onHand: Number(r.on_hand), held: 0 });
        for (const h of held) {
          const k = skuKey(h.product_id, h.size);
          const cur = m.get(k);
          if (cur) cur.held = Number(h.held);
        }
        return m;
      });
    },

    async isHeld(reference, now = new Date()) {
      const r = await db.selectFrom("inventory_reservations").select(["state", "expires_at"]).where("reference", "=", reference).executeTakeFirst();
      return !!r && r.state === "held" && new Date(r.expires_at).getTime() > now.getTime();
    },
  };
}

export function createSqlCartRepo(db: SqlDb): CartRepo {
  return {
    async get(id) {
      const r = await db.selectFrom("carts").select(["doc", "version"]).where("id", "=", id).executeTakeFirst();
      return r ? { cart: fromJson<StoredCart>(r.doc, { lines: [], couponCode: null }), version: Number(r.version) } : null;
    },
    async create(id, cart) {
      await db.insertInto("carts").values({ id, doc: JSON.stringify(cart), version: 1, updated_at: new Date() }).execute();
    },
    async save(id, cart, version) {
      const r = await db.updateTable("carts").set({ doc: JSON.stringify(cart), version: version + 1, updated_at: new Date() }).where("id", "=", id).where("version", "=", version).executeTakeFirst();
      return Number(r.numUpdatedRows) === 1;
    },
    async delete(id) {
      await db.deleteFrom("carts").where("id", "=", id).execute();
    },
  };
}

// ── MongoDB ──────────────────────────────────────────────────────────────────────────────────────

type SkuDoc = { _id: string; product_id: string; size: string; on_hand: number; v?: number };
type ResDoc = { _id: string; state: "held" | "committed" | "released"; expires_at: Date; items: { key: string; product_id: string; size: string; quantity: number }[] };

export function createMongoInventory(conn: Promise<MongoConn>, p: Primitives, catalog: CommerceAdapter): Inventory {
  const base = baseStock(catalog);
  const skus = async () => (await conn).db.collection<SkuDoc>("inventory_skus");
  const res = async () => (await conn).db.collection<ResDoc>("inventory_reservations");

  async function ensureSku(productId: string, size: string): Promise<boolean> {
    const c = await skus();
    if (await c.findOne({ _id: skuKey(productId, size) }, { projection: { _id: 1 } })) return true;
    const stock = await base(productId, size);
    if (stock === null) return false;
    // Insert-if-absent (an existing row is never overwritten).
    await c.updateOne({ _id: skuKey(productId, size) }, { $setOnInsert: { product_id: productId, size, on_hand: stock } }, { upsert: true });
    return true;
  }

  async function heldMap(keys: string[], now: Date, ignore?: string, session?: import("mongodb").ClientSession) {
    const out = new Map<string, number>(keys.map((k) => [k, 0]));
    const filter: Record<string, unknown> = { state: "held", expires_at: { $gt: now }, "items.key": { $in: keys } };
    if (ignore) filter._id = { $ne: ignore };
    for (const r of await (await res()).find(filter, { session }).toArray()) {
      for (const i of r.items) if (out.has(i.key)) out.set(i.key, out.get(i.key)! + i.quantity);
    }
    return out;
  }

  return {
    async available(productId, size, now = new Date()) {
      if (!(await ensureSku(productId, size))) return 0;
      const k = skuKey(productId, size);
      const d = await (await skus()).findOne({ _id: k });
      return Math.max(0, (d?.on_hand ?? 0) - (await heldMap([k], now)).get(k)!);
    },

    async reserve(reference, items, ttlMs, now = new Date()) {
      const list = needed(items);
      for (const i of list) await ensureSku(i.productId, i.size);
      const c = await conn;
      await mongoTx(c, async (session) => {
        const r = c.db.collection<ResDoc>("inventory_reservations");
        const existing = await r.findOne({ _id: reference }, { session });
        if (existing && existing.state === "held" && existing.expires_at.getTime() > now.getTime()) return;
        const keys = list.map((i) => skuKey(i.productId, i.size));
        // Touch every SKU first: concurrent holds on the same SKU now write-conflict, and one retries.
        for (const k of keys) await c.db.collection<SkuDoc>("inventory_skus").updateOne({ _id: k }, { $inc: { v: 1 } }, { session });
        const held = await heldMap(keys, now, reference, session);
        for (const i of list) {
          const k = skuKey(i.productId, i.size);
          const sku = await c.db.collection<SkuDoc>("inventory_skus").findOne({ _id: k }, { session });
          if (!sku || sku.on_hand - held.get(k)! < i.quantity) throw new CommerceError("out_of_stock", "Not enough stock");
        }
        await r.replaceOne(
          { _id: reference },
          { state: "held", expires_at: new Date(now.getTime() + ttlMs), items: list.map((i) => ({ key: skuKey(i.productId, i.size), product_id: i.productId, size: i.size, quantity: i.quantity })) },
          { upsert: true, session },
        );
      });
    },

    async commit(reference) {
      const c = await conn;
      await mongoTx(c, async (session) => {
        const r = await c.db.collection<ResDoc>("inventory_reservations").findOneAndUpdate({ _id: reference, state: "held" }, { $set: { state: "committed" } }, { session, returnDocument: "after" });
        if (!r) return;
        for (const i of r.items) await c.db.collection<SkuDoc>("inventory_skus").updateOne({ _id: i.key }, { $inc: { on_hand: -i.quantity, v: 1 } }, { session });
      });
    },

    async release(reference) {
      await (await res()).updateOne({ _id: reference, state: "held" }, { $set: { state: "released" } });
    },

    async restock(reference, items) {
      const list = needed(items.filter((i) => Number.isInteger(i.quantity) && i.quantity >= 1));
      for (const i of list) await ensureSku(i.productId, i.size);
      const c = await conn;
      await mongoTx(c, async (session) => {
        const markers = c.db.collection<{ _id: string; created_at: Date }>("markers");
        if (await markers.findOne({ _id: `restock:${reference}` }, { session })) return;
        await markers.insertOne({ _id: `restock:${reference}`, created_at: new Date() }, { session });
        for (const i of list) await c.db.collection<SkuDoc>("inventory_skus").updateOne({ _id: skuKey(i.productId, i.size) }, { $inc: { on_hand: i.quantity, v: 1 } }, { session });
      });
    },

    async adjust(productId, size, delta) {
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10_000) throw new CommerceError("invalid_input", "Invalid adjustment");
      if (!(await ensureSku(productId, size))) throw new CommerceError("not_found", "SKU not found");
      const filter = delta < 0 ? { _id: skuKey(productId, size), on_hand: { $gte: -delta } } : { _id: skuKey(productId, size) };
      const d = await (await skus()).findOneAndUpdate(filter, { $inc: { on_hand: delta, v: 1 } }, { returnDocument: "after" });
      if (!d) throw new CommerceError("invalid_input", "Stock can't go below zero");
      return d.on_hand;
    },

    snapshot(now = new Date()) {
      return snapshotFrom(catalog, async () => {
        const m = new Map<string, { onHand: number; held: number }>();
        for (const d of await (await skus()).find().toArray()) m.set(d._id, { onHand: d.on_hand, held: 0 });
        for (const r of await (await res()).find({ state: "held", expires_at: { $gt: now } }).toArray()) {
          for (const i of r.items) {
            const cur = m.get(i.key);
            if (cur) cur.held += i.quantity;
          }
        }
        return m;
      });
    },

    async isHeld(reference, now = new Date()) {
      const r = await (await res()).findOne({ _id: reference });
      return !!r && r.state === "held" && r.expires_at.getTime() > now.getTime();
    },
  };
}

export function createMongoCartRepo(conn: Promise<MongoConn>): CartRepo {
  type CartDoc = { _id: string; doc: StoredCart; version: number; updated_at: Date };
  const col = async () => (await conn).db.collection<CartDoc>("carts");
  return {
    async get(id) {
      const d = await (await col()).findOne({ _id: id });
      return d ? { cart: d.doc, version: d.version } : null;
    },
    async create(id, cart) {
      await (await col()).insertOne({ _id: id, doc: cart, version: 1, updated_at: new Date() });
    },
    async save(id, cart, version) {
      const r = await (await col()).updateOne({ _id: id, version }, { $set: { doc: cart, version: version + 1, updated_at: new Date() } });
      return r.matchedCount === 1;
    },
    async delete(id) {
      await (await col()).deleteOne({ _id: id });
    },
  };
}

/** The own-backend commerce adapter: catalogue from `catalog`, bag + stock from the database. */
export function createDbCommerce(catalog: CommerceAdapter, repo: CartRepo, inventory: Inventory): CommerceAdapter {
  return {
    ...catalog,
    name: `db+${catalog.name}`,
    cart: createCartOps({
      repo,
      product: (id) => catalog.getProductById(id),
      available: (productId, size) => inventory.available(productId, size),
    }),
    inventory,
  };
}
