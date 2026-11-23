import { randomBytes } from "node:crypto";
import type { AlertKind, AlertStore, ProductAlert } from "@/lib/alerts/service";
import type { CheckoutSession, FlowStore } from "@/lib/flows/service";
import { isMarketing, type OutboxMessage, type OutboxStore, type Template } from "@/lib/notify/outbox";
import type { UgcPost, UgcStore } from "@/lib/ugc/service";
import { isMongoDuplicate, type MongoConn } from "../mongo";
import type { Primitives } from "../primitives";
import { fromJson, isUniqueViolation, type SqlDb, sqlTx, toBool, toIso } from "../sql";

/**
 * Phase 5 — product alerts, #WearTheHood posts, notification outbox and scheduled-flow state on the own backend.
 * - Alerts: one OPEN alert per (customer, product, kind, size) — a UNIQUE "open key" cleared when the alert fires,
 *   and `fire` is conditional (fires once, even if two sweeps run together).
 * - UGC: moderation is a conditional status change (only from an allowed state).
 * - Outbox: template + references only, never message bodies or personal data.
 * - Flows: reminder steps and review requests are claimed with conditional writes / markers (sent at most once).
 */
const ALERT_ID_RE = /^al_[a-f0-9]{18}$/;
const UGC_ID_RE = /^ugc_[a-f0-9]{18}$/;
const openKey = (a: { customerId: string; productId: string; kind: string; size: string | null }) => `${a.customerId}|${a.productId}|${a.kind}|${a.size ?? ""}`;

// ── SQL ──────────────────────────────────────────────────────────────────────────────────────────

type AlertRow = { id: string; customer_id: string; product_id: string; size: string | null; kind: string; price_at_set: number; created_at: Date; fired_at: Date | null };
const alertFromRow = (r: AlertRow): ProductAlert => ({
  id: r.id,
  customerId: r.customer_id,
  productId: r.product_id,
  size: r.size,
  kind: r.kind as AlertKind,
  priceAtSet: Number(r.price_at_set),
  createdAt: toIso(r.created_at),
  firedAt: r.fired_at ? toIso(r.fired_at) : null,
});
const ALERT_COLS = ["id", "customer_id", "product_id", "size", "kind", "price_at_set", "created_at", "fired_at"] as const;

export function createSqlAlertStore(db: SqlDb): AlertStore {
  return {
    async create(a, now = new Date()) {
      const id = `al_${randomBytes(9).toString("hex")}`;
      try {
        await db
          .insertInto("product_alerts")
          .values({ id, customer_id: a.customerId, product_id: a.productId, size: a.size, kind: a.kind, price_at_set: a.priceAtSet, created_at: now, fired_at: null, open_key: openKey(a) })
          .execute();
        return { ...a, id, createdAt: now.toISOString(), firedAt: null };
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        const dup = await db.selectFrom("product_alerts").select(ALERT_COLS).where("open_key", "=", openKey(a)).executeTakeFirst();
        if (!dup) throw e;
        return alertFromRow(dup);
      }
    },
    async listByCustomer(id) {
      return (await db.selectFrom("product_alerts").select(ALERT_COLS).where("customer_id", "=", id).orderBy("created_at", "desc").execute()).map(alertFromRow);
    },
    async open(productId) {
      let q = db.selectFrom("product_alerts").select(ALERT_COLS).where("fired_at", "is", null);
      if (productId) q = q.where("product_id", "=", productId);
      return (await q.execute()).map(alertFromRow);
    },
    async fire(id, now = new Date()) {
      const r = await db.updateTable("product_alerts").set({ fired_at: now, open_key: null }).where("id", "=", id).where("fired_at", "is", null).executeTakeFirst();
      return Number(r.numUpdatedRows) === 1;
    },
    async remove(customerId, id) {
      if (!ALERT_ID_RE.test(id)) return false;
      const r = await db.deleteFrom("product_alerts").where("id", "=", id).where("customer_id", "=", customerId).executeTakeFirst();
      return Number(r.numDeletedRows) === 1;
    },
    async erase(customerId) {
      await db.deleteFrom("product_alerts").where("customer_id", "=", customerId).execute();
    },
  };
}

export function createSqlUgcStore(db: SqlDb): UgcStore {
  const read = (doc: unknown) => fromJson<UgcPost>(doc, null as unknown as UgcPost);
  return {
    async create(p, now = new Date()) {
      const post: UgcPost = { ...p, id: `ugc_${randomBytes(9).toString("hex")}`, status: "pending", createdAt: now.toISOString(), moderatedAt: null, moderatedBy: null };
      await db.insertInto("ugc_posts").values({ id: post.id, customer_id: post.customerId, status: post.status, created_at: now, doc: JSON.stringify(post) }).execute();
      return post;
    },
    async get(id) {
      if (!UGC_ID_RE.test(id)) return null;
      const r = await db.selectFrom("ugc_posts").select("doc").where("id", "=", id).executeTakeFirst();
      return r ? read(r.doc) : null;
    },
    async list(status, limit = 100) {
      let q = db.selectFrom("ugc_posts").select("doc").orderBy("created_at", "desc").limit(Math.max(1, Math.min(limit, 1000)));
      if (status) q = q.where("status", "=", status);
      return (await q.execute()).map((r) => read(r.doc));
    },
    async listByCustomer(id) {
      return (await db.selectFrom("ugc_posts").select("doc").where("customer_id", "=", id).where("status", "!=", "removed").execute()).map((r) => read(r.doc));
    },
    async setStatus(id, from, to, by, now = new Date()) {
      if (!UGC_ID_RE.test(id)) return null;
      return sqlTx(db, async (trx) => {
        const r = await trx.selectFrom("ugc_posts").select("doc").where("id", "=", id).forUpdate().executeTakeFirst();
        if (!r) return null;
        const p = read(r.doc);
        if (!from.includes(p.status)) return null; // conditional: only from an allowed state
        p.status = to;
        p.moderatedAt = now.toISOString();
        p.moderatedBy = by;
        await trx.updateTable("ugc_posts").set({ status: to, doc: JSON.stringify(p) }).where("id", "=", id).execute();
        return p;
      });
    },
    async erase(customerId) {
      await db.deleteFrom("ugc_posts").where("customer_id", "=", customerId).execute();
    },
  };
}

export function createSqlOutbox(db: SqlDb): OutboxStore {
  return {
    async push(m) {
      await db
        .insertInto("notify_outbox")
        .values({ id: `msg_${randomBytes(10).toString("hex")}`, customer_id: m.customerId, template: m.template, marketing: isMarketing(m.template), status: m.status, created_at: new Date(m.createdAt), doc: JSON.stringify(m) })
        .execute();
    },
    async marketingSince(customerId, since) {
      const r = await db
        .selectFrom("notify_outbox")
        .select((eb) => eb.fn.countAll<number>().as("c"))
        .where("customer_id", "=", customerId)
        .where("marketing", "=", true)
        .where("created_at", ">=", new Date(since))
        .executeTakeFirst();
      return Number(r?.c ?? 0);
    },
    async listFor(customerId) {
      return (await db.selectFrom("notify_outbox").select("doc").where("customer_id", "=", customerId).orderBy("created_at").orderBy("id").execute()).map((r) => fromJson<OutboxMessage>(r.doc, null as unknown as OutboxMessage));
    },
    async erase(customerId) {
      await db.deleteFrom("notify_outbox").where("customer_id", "=", customerId).execute();
    },
  };
}

export function createSqlFlowStore(db: SqlDb, p: Primitives): FlowStore {
  const fromRow = (r: { customer_id: string; cart_id: string; started_at: string; sent_h1: boolean | number; sent_h24: boolean | number }): CheckoutSession => ({
    customerId: r.customer_id,
    cartId: r.cart_id,
    startedAt: r.started_at,
    sent: { h1: toBool(r.sent_h1), h24: toBool(r.sent_h24) },
  });
  return {
    async getCheckout(id) {
      const r = await db.selectFrom("flow_checkouts").selectAll().where("customer_id", "=", id).executeTakeFirst();
      return r ? fromRow(r) : null;
    },
    async putCheckout(s) {
      await sqlTx(db, async (trx) => {
        await trx.deleteFrom("flow_checkouts").where("customer_id", "=", s.customerId).execute();
        await trx.insertInto("flow_checkouts").values({ customer_id: s.customerId, cart_id: s.cartId, started_at: s.startedAt, sent_h1: s.sent.h1, sent_h24: s.sent.h24 }).execute();
      });
    },
    async listCheckouts() {
      return (await db.selectFrom("flow_checkouts").selectAll().limit(10_000).execute()).map(fromRow);
    },
    async deleteCheckout(id) {
      await db.deleteFrom("flow_checkouts").where("customer_id", "=", id).execute();
    },
    async claimStep(id, startedAt, step) {
      const q = db.updateTable("flow_checkouts").set(step === "h24" ? { sent_h24: true, sent_h1: true } : { sent_h1: true }).where("customer_id", "=", id).where("started_at", "=", startedAt);
      const r = await (step === "h24" ? q.where("sent_h24", "=", false) : q.where("sent_h1", "=", false)).executeTakeFirst();
      return Number(r.numUpdatedRows) === 1;
    },
    claimReview: (orderNumber) => p.marker("flow_review", orderNumber),
  };
}

// ── MongoDB ──────────────────────────────────────────────────────────────────────────────────────

export function createMongoAlertStore(conn: Promise<MongoConn>): AlertStore {
  type Doc = Omit<ProductAlert, "id"> & { _id: string; openKey?: string };
  const col = async () => (await conn).db.collection<Doc>("product_alerts");
  const strip = ({ _id, openKey: _k, ...rest }: Doc): ProductAlert => {
    void _k;
    return { ...rest, id: _id };
  };
  return {
    async create(a, now = new Date()) {
      const id = `al_${randomBytes(9).toString("hex")}`;
      const doc: Doc = { ...a, _id: id, createdAt: now.toISOString(), firedAt: null, openKey: openKey(a) };
      try {
        await (await col()).insertOne(doc);
        return strip(doc);
      } catch (e) {
        if (!isMongoDuplicate(e)) throw e;
        const dup = await (await col()).findOne({ openKey: openKey(a) });
        if (!dup) throw e;
        return strip(dup);
      }
    },
    async listByCustomer(id) {
      return (await (await col()).find({ customerId: id }).sort({ createdAt: -1 }).toArray()).map(strip);
    },
    async open(productId) {
      return (await (await col()).find({ firedAt: null, ...(productId ? { productId } : {}) }).toArray()).map(strip);
    },
    async fire(id, now = new Date()) {
      const r = await (await col()).updateOne({ _id: id, firedAt: null }, { $set: { firedAt: now.toISOString() }, $unset: { openKey: "" } });
      return r.modifiedCount === 1;
    },
    async remove(customerId, id) {
      if (!ALERT_ID_RE.test(id)) return false;
      return (await (await col()).deleteOne({ _id: id, customerId })).deletedCount === 1;
    },
    async erase(customerId) {
      await (await col()).deleteMany({ customerId });
    },
  };
}

export function createMongoUgcStore(conn: Promise<MongoConn>): UgcStore {
  type Doc = Omit<UgcPost, "id"> & { _id: string };
  const col = async () => (await conn).db.collection<Doc>("ugc_posts");
  const strip = ({ _id, ...rest }: Doc): UgcPost => ({ ...rest, id: _id });
  return {
    async create(p, now = new Date()) {
      const id = `ugc_${randomBytes(9).toString("hex")}`;
      const doc: Doc = { ...p, _id: id, status: "pending", createdAt: now.toISOString(), moderatedAt: null, moderatedBy: null };
      await (await col()).insertOne(doc);
      return strip(doc);
    },
    async get(id) {
      if (!UGC_ID_RE.test(id)) return null;
      const d = await (await col()).findOne({ _id: id });
      return d ? strip(d) : null;
    },
    async list(status, limit = 100) {
      return (await (await col()).find(status ? { status } : {}).sort({ createdAt: -1 }).limit(Math.max(1, Math.min(limit, 1000))).toArray()).map(strip);
    },
    async listByCustomer(id) {
      return (await (await col()).find({ customerId: id, status: { $ne: "removed" } }).toArray()).map(strip);
    },
    async setStatus(id, from, to, by, now = new Date()) {
      if (!UGC_ID_RE.test(id)) return null;
      const d = await (await col()).findOneAndUpdate({ _id: id, status: { $in: from } }, { $set: { status: to, moderatedAt: now.toISOString(), moderatedBy: by } }, { returnDocument: "after" });
      return d ? strip(d) : null;
    },
    async erase(customerId) {
      await (await col()).deleteMany({ customerId });
    },
  };
}

export function createMongoOutbox(conn: Promise<MongoConn>): OutboxStore {
  type Doc = OutboxMessage & { _id: string; marketing: boolean; seq: number };
  const col = async () => (await conn).db.collection<Doc>("notify_outbox");
  let seq = 0;
  return {
    async push(m) {
      await (await col()).insertOne({ ...m, _id: `msg_${randomBytes(10).toString("hex")}`, marketing: isMarketing(m.template as Template), seq: Date.now() * 1000 + (seq++ % 1000) });
    },
    async marketingSince(customerId, since) {
      return (await col()).countDocuments({ customerId, marketing: true, createdAt: { $gte: since } });
    },
    async listFor(customerId) {
      return (await (await col()).find({ customerId }).sort({ createdAt: 1, seq: 1 }).toArray()).map(({ _id, marketing: _m, seq: _s, ...rest }) => {
        void _id;
        void _m;
        void _s;
        return rest;
      });
    },
    async erase(customerId) {
      await (await col()).deleteMany({ customerId });
    },
  };
}

export function createMongoFlowStore(conn: Promise<MongoConn>, p: Primitives): FlowStore {
  type Doc = Omit<CheckoutSession, "customerId"> & { _id: string };
  const col = async () => (await conn).db.collection<Doc>("flow_checkouts");
  const strip = ({ _id, ...rest }: Doc): CheckoutSession => ({ ...rest, customerId: _id });
  return {
    async getCheckout(id) {
      const d = await (await col()).findOne({ _id: id });
      return d ? strip(d) : null;
    },
    async putCheckout(s) {
      const { customerId, ...rest } = s;
      await (await col()).replaceOne({ _id: customerId }, rest, { upsert: true });
    },
    async listCheckouts() {
      return (await (await col()).find().limit(10_000).toArray()).map(strip);
    },
    async deleteCheckout(id) {
      await (await col()).deleteOne({ _id: id });
    },
    async claimStep(id, startedAt, step) {
      const filter = { _id: id, startedAt, [`sent.${step}`]: false };
      const set = step === "h24" ? { "sent.h24": true, "sent.h1": true } : { "sent.h1": true };
      return (await (await col()).updateOne(filter, { $set: set })).modifiedCount === 1;
    },
    claimReview: (orderNumber) => p.marker("flow_review", orderNumber),
  };
}
