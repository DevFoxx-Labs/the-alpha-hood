import type { CredentialStore } from "@/lib/auth/passwords";
import type { MongoConn } from "../mongo";
import { isUniqueViolation, type SqlDb, toIso } from "../sql";

/** Customer password hashes on the own backend (one row per customer; upsert replaces it atomically). */
export function createSqlCredentialStore(db: SqlDb): CredentialStore {
  return {
    async get(customerId) {
      const r = await db.selectFrom("customer_credentials").select(["password_hash", "updated_at"]).where("customer_id", "=", customerId).executeTakeFirst();
      return r ? { hash: r.password_hash, updatedAt: toIso(r.updated_at) } : null;
    },
    async set(customerId, hash, now = new Date()) {
      // Portable upsert (MySQL + PostgreSQL): update; none → insert; a concurrent insert won → update again.
      const update = async () =>
        Number((await db.updateTable("customer_credentials").set({ password_hash: hash, updated_at: now }).where("customer_id", "=", customerId).executeTakeFirst()).numUpdatedRows);
      if ((await update()) > 0) return;
      try {
        await db.insertInto("customer_credentials").values({ customer_id: customerId, password_hash: hash, updated_at: now }).execute();
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        await update();
      }
    },
    async delete(customerId) {
      await db.deleteFrom("customer_credentials").where("customer_id", "=", customerId).execute();
    },
  };
}

export function createMongoCredentialStore(conn: Promise<MongoConn>): CredentialStore {
  type Doc = { _id: string; hash: string; updatedAt: Date };
  const col = async () => (await conn).db.collection<Doc>("customer_credentials");
  return {
    async get(customerId) {
      const d = await (await col()).findOne({ _id: customerId });
      return d ? { hash: d.hash, updatedAt: d.updatedAt.toISOString() } : null;
    },
    async set(customerId, hash, now = new Date()) {
      await (await col()).updateOne({ _id: customerId }, { $set: { hash, updatedAt: now } }, { upsert: true });
    },
    async delete(customerId) {
      await (await col()).deleteOne({ _id: customerId });
    },
  };
}
