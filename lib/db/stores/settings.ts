import type { SettingRow, SettingsStore } from "@/lib/settings/store";
import { type MongoConn, mongoTx } from "../mongo";
import type { SecretBox } from "../secret-box";
import { type SqlDb, sqlTx, toIso } from "../sql";

/**
 * Admin settings on the own backend. Every value is sealed with the secret box before it is written, public or
 * not — the table is unreadable without SECRET_BOX_KEY. A row that can't be opened (the key changed without the
 * old one in SECRET_BOX_PREVIOUS_KEYS) reads as `value: null` so the caller falls back to the environment
 * instead of failing the whole request.
 */
function open(box: SecretBox, sealed: string): string | null {
  try {
    return box.open(sealed);
  } catch {
    return null;
  }
}

export function createSqlSettingsStore(db: SqlDb, box: SecretBox): SettingsStore {
  return {
    async all() {
      const rows = await db.selectFrom("app_settings").selectAll().orderBy("key").execute();
      return rows.map((r): SettingRow => ({ key: r.key, value: open(box, r.value), updatedBy: r.updated_by, updatedAt: toIso(r.updated_at) }));
    },
    async write(change, by, now = new Date()) {
      const set = Object.entries(change.set);
      const touched = [...new Set([...change.clear, ...set.map(([k]) => k)])];
      if (!touched.length) return;
      // One transaction: replace = delete + insert (portable across MySQL and PostgreSQL).
      await sqlTx(db, async (trx) => {
        await trx.deleteFrom("app_settings").where("key", "in", touched).execute();
        if (set.length) {
          await trx
            .insertInto("app_settings")
            .values(set.map(([key, value]) => ({ key, value: box.seal(value), updated_by: by.slice(0, 64), updated_at: now })))
            .execute();
        }
      });
    },
  };
}

export function createMongoSettingsStore(conn: Promise<MongoConn>, box: SecretBox): SettingsStore {
  type Doc = { _id: string; value: string; updatedBy: string; updatedAt: Date };
  const col = async () => (await conn).db.collection<Doc>("app_settings");
  return {
    async all() {
      const docs = await (await col()).find({}).sort({ _id: 1 }).toArray();
      return docs.map((d): SettingRow => ({ key: d._id, value: open(box, d.value), updatedBy: d.updatedBy, updatedAt: d.updatedAt.toISOString() }));
    },
    async write(change, by, now = new Date()) {
      const set = Object.entries(change.set);
      if (!set.length && !change.clear.length) return;
      const c = await col();
      await mongoTx(await conn, async (session) => {
        if (change.clear.length) await c.deleteMany({ _id: { $in: change.clear } }, { session });
        for (const [key, value] of set) {
          await c.updateOne({ _id: key }, { $set: { value: box.seal(value), updatedBy: by.slice(0, 64), updatedAt: now } }, { upsert: true, session });
        }
      });
    },
  };
}
