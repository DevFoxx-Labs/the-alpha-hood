import { newSubmissionId, type Submission, SubmissionConflictError, type SubmissionKind, type SubmissionStore } from "@/lib/submissions/store";
import { isMongoDuplicate, type MongoConn } from "../mongo";
import { fromJson, isUniqueViolation, type SqlDb, toIso } from "../sql";

/** Reviews + feedback on the own backend (lib/submissions/store.ts). Status changes are conditional updates. */
type Row = { id: string; kind: string; customer_id: string; status: string; unique_key: string | null; doc: unknown; created_at: Date | string; updated_at: Date | string };
const view = <T>(r: Row): Submission<T> => ({
  id: r.id,
  kind: r.kind as SubmissionKind,
  customerId: r.customer_id,
  status: r.status,
  uniqueKey: r.unique_key,
  doc: fromJson<T>(r.doc, {} as T),
  createdAt: toIso(r.created_at),
  updatedAt: toIso(r.updated_at),
});

export function createSqlSubmissionStore(db: SqlDb): SubmissionStore {
  return {
    async create(s, now = new Date()) {
      const id = newSubmissionId();
      try {
        await db
          .insertInto("customer_submissions")
          .values({ id, kind: s.kind, customer_id: s.customerId, status: s.status, unique_key: s.uniqueKey, doc: JSON.stringify(s.doc), created_at: now, updated_at: now })
          .execute();
      } catch (e) {
        if (isUniqueViolation(e)) throw new SubmissionConflictError();
        throw e;
      }
      return { ...s, id, createdAt: now.toISOString(), updatedAt: now.toISOString() };
    },
    async get(id) {
      const r = await db.selectFrom("customer_submissions").selectAll().where("id", "=", id).executeTakeFirst();
      return r ? view(r as Row) : null;
    },
    async listByCustomer(kind, customerId) {
      return (await db.selectFrom("customer_submissions").selectAll().where("kind", "=", kind).where("customer_id", "=", customerId).orderBy("created_at", "desc").execute()).map((r) => view(r as Row));
    },
    async listByStatus(kind, status, limit = 200) {
      let q = db.selectFrom("customer_submissions").selectAll().where("kind", "=", kind);
      if (status !== null) q = q.where("status", "=", status);
      return (await q.orderBy("created_at", "desc").orderBy("id", "desc").limit(Math.max(1, Math.min(limit, 1000))).execute()).map((r) => view(r as Row));
    },
    async update(id, expected, status, doc, now = new Date()) {
      if (!expected.length) return null;
      const r = await db.updateTable("customer_submissions").set({ status, doc: JSON.stringify(doc), updated_at: now }).where("id", "=", id).where("status", "in", expected).executeTakeFirst();
      if (Number(r.numUpdatedRows) !== 1) return null;
      const row = await db.selectFrom("customer_submissions").selectAll().where("id", "=", id).executeTakeFirst();
      return row ? view(row as Row) : null;
    },
    async remove(id, customerId) {
      const r = await db.deleteFrom("customer_submissions").where("id", "=", id).where("customer_id", "=", customerId).executeTakeFirst();
      return Number(r.numDeletedRows) === 1;
    },
    async eraseCustomer(customerId) {
      await db.deleteFrom("customer_submissions").where("customer_id", "=", customerId).execute();
    },
  };
}

export function createMongoSubmissionStore(conn: Promise<MongoConn>): SubmissionStore {
  type Doc = { _id: string; kind: SubmissionKind; customerId: string; status: string; uniqueKey?: string; doc: unknown; createdAt: Date; updatedAt: Date };
  const col = async () => (await conn).db.collection<Doc>("customer_submissions");
  const v = <T>(d: Doc): Submission<T> => ({ id: d._id, kind: d.kind, customerId: d.customerId, status: d.status, uniqueKey: d.uniqueKey ?? null, doc: d.doc as T, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() });
  return {
    async create(s, now = new Date()) {
      const id = newSubmissionId();
      try {
        await (await col()).insertOne({ _id: id, kind: s.kind, customerId: s.customerId, status: s.status, ...(s.uniqueKey ? { uniqueKey: s.uniqueKey } : {}), doc: s.doc, createdAt: now, updatedAt: now });
      } catch (e) {
        if (isMongoDuplicate(e)) throw new SubmissionConflictError();
        throw e;
      }
      return { ...s, id, createdAt: now.toISOString(), updatedAt: now.toISOString() };
    },
    async get(id) {
      const d = await (await col()).findOne({ _id: id });
      return d ? v(d) : null;
    },
    async listByCustomer(kind, customerId) {
      return (await (await col()).find({ kind, customerId }).sort({ createdAt: -1 }).toArray()).map((d) => v(d));
    },
    async listByStatus(kind, status, limit = 200) {
      return (await (await col()).find({ kind, ...(status === null ? {} : { status }) }).sort({ createdAt: -1, _id: -1 }).limit(Math.max(1, Math.min(limit, 1000))).toArray()).map((d) => v(d));
    },
    async update(id, expected, status, doc, now = new Date()) {
      const d = await (await col()).findOneAndUpdate({ _id: id, status: { $in: expected } }, { $set: { status, doc, updatedAt: now } }, { returnDocument: "after" });
      return d ? v(d) : null;
    },
    async remove(id, customerId) {
      return (await (await col()).deleteOne({ _id: id, customerId })).deletedCount === 1;
    },
    async eraseCustomer(customerId) {
      await (await col()).deleteMany({ customerId });
    },
  };
}
