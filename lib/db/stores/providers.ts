import type { ProviderKind, ProviderRow, ProviderStore } from "@/lib/providers/store";
import { type MongoConn, mongoTx } from "../mongo";
import type { SecretBox } from "../secret-box";
import { type SqlDb, sqlTx, toBool, toIso } from "../sql";

/**
 * Admin-managed providers on the own backend. The document (credentials included) is sealed with the secret box.
 * "One active per kind" is a UNIQUE index: SQL `(kind, is_active)` where inactive rows hold NULL (NULLs never
 * collide), MongoDB a partial unique index on `active: true`. Switching runs in one transaction: old row off, new on.
 */
function open<T>(box: SecretBox, sealed: string): T | null {
  try {
    return JSON.parse(box.open(sealed)) as T;
  } catch {
    return null;
  }
}

export function createSqlProviderStore(db: SqlDb, box: SecretBox): ProviderStore {
  const view = <T>(r: { id: string; is_active: boolean | number | null; doc: string; updated_at: Date | string }): ProviderRow<T> => ({ id: r.id, active: toBool(r.is_active), doc: open<T>(box, r.doc), updatedAt: toIso(r.updated_at) });
  return {
    async list<T>(kind: ProviderKind) {
      return (await db.selectFrom("providers").selectAll().where("kind", "=", kind).orderBy("id").execute()).map((r) => view<T>(r));
    },
    async get<T>(kind: ProviderKind, id: string) {
      const r = await db.selectFrom("providers").selectAll().where("id", "=", id).where("kind", "=", kind).executeTakeFirst();
      return r ? view<T>(r) : null;
    },
    async put(kind, id, doc, now = new Date()) {
      const sealed = box.seal(JSON.stringify(doc));
      await sqlTx(db, async (trx) => {
        const old = await trx.selectFrom("providers").select("id").where("id", "=", id).where("kind", "=", kind).forUpdate().executeTakeFirst();
        if (old) await trx.updateTable("providers").set({ doc: sealed, updated_at: now }).where("id", "=", id).execute();
        else await trx.insertInto("providers").values({ id, kind, is_active: null, doc: sealed, updated_at: now }).execute();
      });
    },
    async remove(kind, id) {
      const r = await db.deleteFrom("providers").where("id", "=", id).where("kind", "=", kind).where("is_active", "is", null).executeTakeFirst();
      return Number(r.numDeletedRows) === 1;
    },
    async setActive(kind, id, now = new Date()) {
      return sqlTx(db, async (trx) => {
        // Lock every row of the kind: two owners activating different providers queue up here.
        const rows = await trx.selectFrom("providers").select("id").where("kind", "=", kind).forUpdate().execute();
        if (id !== null && !rows.some((r) => r.id === id)) return false;
        await trx.updateTable("providers").set({ is_active: null }).where("kind", "=", kind).where("is_active", "=", true).execute();
        if (id !== null) await trx.updateTable("providers").set({ is_active: true, updated_at: now }).where("id", "=", id).execute();
        return true;
      });
    },
  };
}

export function createMongoProviderStore(conn: Promise<MongoConn>, box: SecretBox): ProviderStore {
  type Doc = { _id: string; kind: ProviderKind; active?: true; doc: string; updatedAt: Date };
  const col = async () => (await conn).db.collection<Doc>("providers");
  const view = <T>(d: Doc): ProviderRow<T> => ({ id: d._id, active: d.active === true, doc: open<T>(box, d.doc), updatedAt: d.updatedAt.toISOString() });
  return {
    async list<T>(kind: ProviderKind) {
      return (await (await col()).find({ kind }).sort({ _id: 1 }).toArray()).map((d) => view<T>(d));
    },
    async get<T>(kind: ProviderKind, id: string) {
      const d = await (await col()).findOne({ _id: id, kind });
      return d ? view<T>(d) : null;
    },
    async put(kind, id, doc, now = new Date()) {
      await (await col()).updateOne({ _id: id, kind }, { $set: { doc: box.seal(JSON.stringify(doc)), updatedAt: now } }, { upsert: true });
    },
    async remove(kind, id) {
      return (await (await col()).deleteOne({ _id: id, kind, active: { $ne: true } })).deletedCount === 1;
    },
    async setActive(kind, id, now = new Date()) {
      const c = await col();
      return mongoTx(await conn, async (session) => {
        if (id !== null && !(await c.findOne({ _id: id, kind }, { session, projection: { _id: 1 } }))) return false;
        await c.updateMany({ kind, active: true }, { $unset: { active: "" } }, { session });
        if (id !== null) await c.updateOne({ _id: id, kind }, { $set: { active: true, updatedAt: now } }, { session });
        return true;
      });
    },
  };
}
