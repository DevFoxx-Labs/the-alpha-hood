import { type CatalogDocs, CatalogConflictError, type CatalogStore, type ProductRecord, skuKey } from "@/lib/catalog/store";
import { type ReviewStore, roundAverage } from "@/lib/reviews/store";
import type { Review } from "@/lib/reviews/types";
import { isMongoDuplicate, type MongoConn, mongoTx } from "../mongo";
import { fromJson, isUniqueViolation, type SqlDb, sqlTx } from "../sql";

/**
 * Phase 4 — catalogue + reviews on the own backend.
 * Products: one JSON document per product plus indexed / UNIQUE columns (id, handle, SKU, style, status).
 * Edits are optimistic: written only if the version the editor loaded is still current (no lost updates when two
 * staff edit the same product). Reviews: one row each; a helpful vote is a UNIQUE (review, voter) row and the
 * counter moves in the same transaction.
 */
const DOCS_KEY = "catalog";
/** Thrown inside a transaction to roll the whole multi-colour write back when one version is stale. */
class StaleWrite extends Error {}
// MongoDB note: catalogue writes use `ignoreUndefined` so optional fields stay absent (the driver would store
// `undefined` as `null`, and the storefront would see `badge: null` instead of no badge).

// ── SQL ──────────────────────────────────────────────────────────────────────────────────────────

export function createSqlCatalogStore(db: SqlDb): CatalogStore {
  const read = (doc: unknown) => fromJson<ProductRecord>(doc, null as unknown as ProductRecord);
  const row = (r: ProductRecord) => ({
    id: r.id,
    handle: r.handle,
    sku: r.sku,
    style_id: r.styleId,
    category: r.category,
    status: r.status,
    created_at: new Date(r.createdAt),
    updated_at: new Date(r.updatedAt),
    version: r.version,
    doc: JSON.stringify(r),
  });
  async function conflictField(r: ProductRecord): Promise<CatalogConflictError> {
    const h = await db.selectFrom("products").select("id").where("handle", "=", r.handle).where("id", "!=", r.id).executeTakeFirst();
    if (h) return new CatalogConflictError("handle");
    const s = await db.selectFrom("products").select("id").where("sku", "=", r.sku).where("id", "!=", r.id).executeTakeFirst();
    return new CatalogConflictError(s ? "sku" : "id");
  }
  return {
    async listRecords() {
      return (await db.selectFrom("products").select("doc").orderBy("id").execute()).map((x) => read(x.doc));
    },
    async getRecord(id) {
      const x = await db.selectFrom("products").select("doc").where("id", "=", id).executeTakeFirst();
      return x ? read(x.doc) : null;
    },
    async insert(r) {
      try {
        await db.insertInto("products").values(row(r)).execute();
      } catch (e) {
        if (isUniqueViolation(e)) throw await conflictField(r);
        throw e;
      }
    },
    async replace(r, expectedVersion) {
      try {
        const res = await db.updateTable("products").set(row(r)).where("id", "=", r.id).where("version", "=", expectedVersion).executeTakeFirst();
        return Number(res.numUpdatedRows) === 1;
      } catch (e) {
        if (isUniqueViolation(e)) throw await conflictField(r);
        throw e;
      }
    },
    async getDocs() {
      const x = await db.selectFrom("catalog_documents").select("doc").where("name", "=", DOCS_KEY).executeTakeFirst();
      return x ? fromJson<CatalogDocs | null>(x.doc, null) : null;
    },
    async putDocs(d) {
      await sqlTx(db, async (trx) => {
        const has = await trx.selectFrom("catalog_documents").select("name").where("name", "=", DOCS_KEY).forUpdate().executeTakeFirst();
        if (has) await trx.updateTable("catalog_documents").set({ doc: JSON.stringify(d), updated_at: new Date() }).where("name", "=", DOCS_KEY).execute();
        else await trx.insertInto("catalog_documents").values({ name: DOCS_KEY, doc: JSON.stringify(d), updated_at: new Date() }).execute();
      });
    },
    async replaceDocs(d, expected) {
      try {
        return await sqlTx(db, async (trx) => {
          // Row lock: two saves of the same revision are serialised; the second sees the new revision and loses.
          const has = await trx.selectFrom("catalog_documents").select("doc").where("name", "=", DOCS_KEY).forUpdate().executeTakeFirst();
          const current = has ? (fromJson<CatalogDocs | null>(has.doc, null)?.revision ?? 0) : 0;
          if (current !== expected) return false;
          if (has) await trx.updateTable("catalog_documents").set({ doc: JSON.stringify(d), updated_at: new Date() }).where("name", "=", DOCS_KEY).execute();
          else await trx.insertInto("catalog_documents").values({ name: DOCS_KEY, doc: JSON.stringify(d), updated_at: new Date() }).execute();
          return true;
        });
      } catch (e) {
        if (isUniqueViolation(e)) return false; // two first-ever saves raced on the insert
        throw e;
      }
    },
    async onHand() {
      const rows = await db.selectFrom("inventory_skus").selectAll().execute();
      return new Map(rows.map((r) => [skuKey(r.product_id, r.size), Number(r.on_hand)]));
    },
    async writeMany(inserts, replaces) {
      try {
        await sqlTx(db, async (trx) => {
          for (const { record, expectedVersion } of replaces) {
            const res = await trx.updateTable("products").set(row(record)).where("id", "=", record.id).where("version", "=", expectedVersion).executeTakeFirst();
            if (Number(res.numUpdatedRows) !== 1) throw new StaleWrite();
          }
          for (const r of inserts) await trx.insertInto("products").values(row(r)).execute();
        });
        return true;
      } catch (e) {
        if (e instanceof StaleWrite) return false;
        if (isUniqueViolation(e)) {
          for (const r of [...inserts, ...replaces.map((x) => x.record)]) {
            const c = await conflictField(r);
            if (c.field !== "id") throw c;
          }
          throw new CatalogConflictError("id");
        }
        throw e;
      }
    },
  };
}

export function createSqlReviewStore(db: SqlDb): ReviewStore {
  const read = (x: { doc: unknown; helpful: number }) => ({ ...fromJson<Review>(x.doc, null as unknown as Review), helpful: Number(x.helpful) });
  return {
    async byStyle(styleId) {
      return (await db.selectFrom("reviews").select(["doc", "helpful"]).where("style_id", "=", styleId).execute()).map(read);
    },
    async byCategory(category) {
      return (await db.selectFrom("reviews").select(["doc", "helpful"]).where("category", "=", category).execute()).map(read);
    },
    async vote(reviewId, voterId) {
      try {
        return await sqlTx(db, async (trx) => {
          const exists = await trx.selectFrom("reviews").select("id").where("id", "=", reviewId).forUpdate().executeTakeFirst();
          if (!exists) return null;
          await trx.insertInto("review_votes").values({ review_id: reviewId, voter_id: voterId, created_at: new Date() }).execute();
          await trx.updateTable("reviews").set((eb) => ({ helpful: eb("helpful", "+", 1) })).where("id", "=", reviewId).execute();
          const r = await trx.selectFrom("reviews").select("helpful").where("id", "=", reviewId).executeTakeFirstOrThrow();
          return Number(r.helpful);
        });
      } catch (e) {
        if (isUniqueViolation(e)) return null; // this voter already voted
        throw e;
      }
    },
    async ratings() {
      const rows = await db
        .selectFrom("reviews")
        .select(["style_id", (eb) => eb.fn.sum<number>("rating").as("sum"), (eb) => eb.fn.countAll<number>().as("n")])
        .groupBy("style_id")
        .execute();
      return new Map(rows.map((r) => [r.style_id, { average: roundAverage(Number(r.sum), Number(r.n)), count: Number(r.n) }]));
    },
    async insertMany(list) {
      for (const r of list) {
        try {
          await db
            .insertInto("reviews")
            .values({ id: r.id, style_id: r.styleId, category: r.category, rating: r.rating, helpful: r.helpful, created_at: new Date(r.createdAt), doc: JSON.stringify(r) })
            .execute();
        } catch (e) {
          if (!isUniqueViolation(e)) throw e; // already seeded
        }
      }
    },
    async countByIdPrefix(prefix) {
      const safe = prefix.replace(/[^A-Za-z0-9_]/g, "");
      const r = await db.selectFrom("reviews").select((eb) => eb.fn.countAll<number>().as("c")).where("id", "like", `${safe.replace(/_/g, "\\_")}%`).executeTakeFirst();
      return Number(r?.c ?? 0);
    },
  };
}

// ── MongoDB ──────────────────────────────────────────────────────────────────────────────────────

type ProductDoc = ProductRecord & { _id: string };

export function createMongoCatalogStore(conn: Promise<MongoConn>): CatalogStore {
  const col = async () => (await conn).db.collection<ProductDoc>("products");
  const docs = async () => (await conn).db.collection<{ _id: string; doc: CatalogDocs; updated_at: Date }>("catalog_documents");
  const strip = (d: ProductDoc): ProductRecord => {
    const r = structuredClone(d) as Partial<ProductDoc>;
    delete r._id;
    return r as ProductRecord;
  };
  async function conflictField(r: ProductRecord): Promise<CatalogConflictError> {
    const c = await col();
    if (await c.findOne({ handle: r.handle, _id: { $ne: r.id } }, { projection: { _id: 1 } })) return new CatalogConflictError("handle");
    if (await c.findOne({ sku: r.sku, _id: { $ne: r.id } }, { projection: { _id: 1 } })) return new CatalogConflictError("sku");
    return new CatalogConflictError("id");
  }
  return {
    async listRecords() {
      return (await (await col()).find().sort({ _id: 1 }).toArray()).map(strip);
    },
    async getRecord(id) {
      const d = await (await col()).findOne({ _id: id });
      return d ? strip(d) : null;
    },
    async insert(r) {
      try {
        await (await col()).insertOne({ ...structuredClone(r), _id: r.id }, { ignoreUndefined: true });
      } catch (e) {
        if (isMongoDuplicate(e)) throw await conflictField(r);
        throw e;
      }
    },
    async replace(r, expectedVersion) {
      try {
        const res = await (await col()).replaceOne({ _id: r.id, version: expectedVersion }, structuredClone(r), { ignoreUndefined: true });
        return res.matchedCount === 1;
      } catch (e) {
        if (isMongoDuplicate(e)) throw await conflictField(r);
        throw e;
      }
    },
    async getDocs() {
      return (await (await docs()).findOne({ _id: DOCS_KEY }))?.doc ?? null;
    },
    async putDocs(d) {
      await (await docs()).updateOne({ _id: DOCS_KEY }, { $set: { doc: structuredClone(d), updated_at: new Date() } }, { upsert: true, ignoreUndefined: true });
    },
    async replaceDocs(d, expected) {
      // One-document compare-and-set: the filter only matches the expected revision (absent counts as 0).
      const filter =
        expected === 0
          ? { _id: DOCS_KEY, $or: [{ "doc.revision": 0 }, { "doc.revision": { $exists: false } }] }
          : { _id: DOCS_KEY, "doc.revision": expected };
      try {
        const res = await (await docs()).updateOne(filter, { $set: { doc: structuredClone(d), updated_at: new Date() } }, { upsert: expected === 0, ignoreUndefined: true });
        return res.matchedCount === 1 || res.upsertedCount === 1;
      } catch (e) {
        if (isMongoDuplicate(e)) return false; // a document with another revision exists (the upsert hit its _id)
        throw e;
      }
    },
    async onHand() {
      const rows = await (await conn).db.collection<{ _id: string; on_hand: number }>("inventory_skus").find().toArray();
      return new Map(rows.map((r) => [r._id, r.on_hand]));
    },
    async writeMany(inserts, replaces) {
      const c = await conn;
      try {
        await mongoTx(c, async (session) => {
          const products = c.db.collection<ProductDoc>("products");
          for (const { record, expectedVersion } of replaces) {
            const res = await products.replaceOne({ _id: record.id, version: expectedVersion }, structuredClone(record), { session, ignoreUndefined: true });
            if (res.matchedCount !== 1) throw new StaleWrite();
          }
          for (const r of inserts) await products.insertOne({ ...structuredClone(r), _id: r.id }, { session, ignoreUndefined: true });
        });
        return true;
      } catch (e) {
        if (e instanceof StaleWrite) return false;
        if (isMongoDuplicate(e)) {
          for (const r of [...inserts, ...replaces.map((x) => x.record)]) {
            const err = await conflictField(r);
            if (err.field !== "id") throw err;
          }
          throw new CatalogConflictError("id");
        }
        throw e;
      }
    },
  };
}

type ReviewDoc = Review & { _id: string };

export function createMongoReviewStore(conn: Promise<MongoConn>): ReviewStore {
  const col = async () => (await conn).db.collection<ReviewDoc>("reviews");
  const strip = (d: ReviewDoc): Review => {
    const r = { ...d } as Partial<ReviewDoc>;
    delete r._id;
    return r as Review;
  };
  return {
    async byStyle(styleId) {
      return (await (await col()).find({ styleId }).toArray()).map(strip);
    },
    async byCategory(category) {
      return (await (await col()).find({ category }).toArray()).map(strip);
    },
    async vote(reviewId, voterId) {
      const c = await conn;
      try {
        return await mongoTx(c, async (session) => {
          const reviews = c.db.collection<ReviewDoc>("reviews");
          if (!(await reviews.findOne({ _id: reviewId }, { session, projection: { _id: 1 } }))) return null;
          await c.db.collection<{ _id: string; created_at: Date }>("review_votes").insertOne({ _id: `${reviewId}|${voterId}`, created_at: new Date() }, { session });
          const d = await reviews.findOneAndUpdate({ _id: reviewId }, { $inc: { helpful: 1 } }, { session, returnDocument: "after" });
          return d ? d.helpful : null;
        });
      } catch (e) {
        if (isMongoDuplicate(e)) return null;
        throw e;
      }
    },
    async ratings() {
      const rows = await (await col()).aggregate<{ _id: string; sum: number; n: number }>([{ $group: { _id: "$styleId", sum: { $sum: "$rating" }, n: { $sum: 1 } } }]).toArray();
      return new Map(rows.map((r) => [r._id, { average: roundAverage(r.sum, r.n), count: r.n }]));
    },
    async insertMany(list) {
      if (!list.length) return;
      const ops = list.map((r) => ({ updateOne: { filter: { _id: r.id }, update: { $setOnInsert: { ...r } }, upsert: true } }));
      await (await col()).bulkWrite(ops, { ordered: false, ignoreUndefined: true });
    },
    async countByIdPrefix(prefix) {
      const safe = prefix.replace(/[^A-Za-z0-9_]/g, "");
      return (await col()).countDocuments({ _id: { $regex: `^${safe}` } });
    },
  };
}
