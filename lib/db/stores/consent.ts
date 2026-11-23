import type { ConsentLedger, ConsentRecord, NewConsentRecord } from "@/lib/consent/ledger";
import type { ConsentMethod, ConsentPurpose, ConsentSource, ConsentStatus } from "@/lib/consent/purposes";
import type { MongoConn } from "../mongo";
import type { SqlDb } from "../sql";
import { toIso } from "../sql";

/** DPDP consent ledger on SQL / MongoDB — append-only: this module has no update or delete. */
type Row = Omit<ConsentRecord, "created_at" | "purpose" | "status" | "method" | "source"> & { purpose: string; status: string; method: string; source: string; created_at: Date | string };

const out = (r: Row): ConsentRecord =>
  Object.freeze({
    id: r.id,
    user_id: r.user_id,
    visitor_id: r.visitor_id,
    subscriber_id: r.subscriber_id,
    purpose: r.purpose as ConsentPurpose,
    status: r.status as ConsentStatus,
    method: r.method as ConsentMethod,
    source: r.source as ConsentSource,
    notice_version: r.notice_version,
    ip_address: r.ip_address,
    user_agent: r.user_agent,
    created_at: toIso(r.created_at),
  });

const build = (rows: NewConsentRecord[], now: Date) => rows.map((r) => ({ ...r, id: crypto.randomUUID(), created_at: now }));

export function createSqlLedger(db: SqlDb): ConsentLedger {
  const list = async (col: "user_id" | "visitor_id" | "subscriber_id", value: string) =>
    (await db.selectFrom("consent_records").selectAll().where(col, "=", value).orderBy("created_at").orderBy("id").execute()).map(out);
  return {
    async append(rows, now = new Date()) {
      if (rows.length === 0) return [];
      const created = build(rows, now);
      // One statement = atomic: either every row of this decision is recorded or none is.
      await db.insertInto("consent_records").values(created).execute();
      return created.map(out);
    },
    listByUser: (id) => list("user_id", id),
    listByVisitor: (id) => list("visitor_id", id),
    listBySubscriber: (id) => list("subscriber_id", id),
  };
}

export function createMongoLedger(conn: Promise<MongoConn>): ConsentLedger {
  const col = async () => (await conn).db.collection<Row & { _id: string }>("consent_records");
  const list = async (field: "user_id" | "visitor_id" | "subscriber_id", value: string) =>
    (await (await col()).find({ [field]: value }).sort({ created_at: 1, _id: 1 }).toArray()).map(out);
  return {
    async append(rows, now = new Date()) {
      if (rows.length === 0) return [];
      const created = build(rows, now);
      await (await col()).insertMany(created.map((r) => ({ ...r, _id: r.id })), { ordered: true });
      return created.map(out);
    },
    listByUser: (id) => list("user_id", id),
    listByVisitor: (id) => list("visitor_id", id),
    listBySubscriber: (id) => list("subscriber_id", id),
  };
}
