import { Binary } from "mongodb";
import type { NewsletterChannel, NewsletterStore, Subscriber } from "@/lib/newsletter/service";
import { type GrievanceInbox, newPrivacyRequest, type PrivacyRequest } from "@/lib/privacy/requests";
import { isPhotoId, type PhotoStore, type PhotoType, preparePhoto, type StoredPhoto } from "@/lib/returns/photos";
import type { ReturnRequest, ReturnStore } from "@/lib/returns/service";
import { isMongoDuplicate, type MongoConn, mongoTx } from "../mongo";
import { fromJson, isUniqueViolation, type SqlDb, sqlTx, toIso } from "../sql";

/**
 * Phase 3 — after-sales + DPDP stores on the own backend (contract-tested against the memory stores):
 * - returns: one document per return, updated under a row lock (SQL) or a version check (MongoDB);
 * - return photos: private bytes (metadata stripped before insert), owner-scoped reads, attach-to-return is
 *   all-or-nothing and a photo can never be moved to a second return;
 * - grievance inbox: status changes append to the request's log atomically;
 * - newsletter: UNIQUE (channel, contact) — racing sign-ups resolve to one current subscriber.
 */
const clone = <T>(v: T): T => structuredClone(v);
const MAX_LIST = 5000;

class AttachRefused extends Error {}

// ── SQL ──────────────────────────────────────────────────────────────────────────────────────────

export function createSqlReturnStore(db: SqlDb): ReturnStore {
  const read = (doc: unknown) => fromJson<ReturnRequest>(doc, null as unknown as ReturnRequest);
  const list = async (q: ReturnType<typeof base>) => (await q.execute()).map((r) => read(r.doc));
  const base = () => db.selectFrom("returns").select("doc");
  return {
    async create(r) {
      try {
        await db
          .insertInto("returns")
          .values({ number: r.number, order_number: r.orderNumber, customer_id: r.customerId, status: r.status, created_at: new Date(r.createdAt), doc: JSON.stringify(r), version: 1 })
          .execute();
      } catch (e) {
        if (isUniqueViolation(e)) throw new Error("Duplicate return number");
        throw e;
      }
      return clone(r);
    },
    async get(n) {
      const r = await base().where("number", "=", n).executeTakeFirst();
      return r ? read(r.doc) : null;
    },
    listByOrder: (o) => list(base().where("order_number", "=", o).orderBy("created_at")),
    listByCustomer: (c) => list(base().where("customer_id", "=", c).orderBy("created_at", "desc")),
    listRecent: (limit) => list(base().orderBy("created_at", "desc").limit(Math.max(1, Math.min(limit, MAX_LIST)))),
    async update(n, patch) {
      return sqlTx(db, async (trx) => {
        const row = await trx.selectFrom("returns").select(["doc", "version"]).where("number", "=", n).forUpdate().executeTakeFirst();
        if (!row) return null;
        const r = read(row.doc);
        patch(r);
        await trx.updateTable("returns").set({ doc: JSON.stringify(r), status: r.status, version: row.version + 1 }).where("number", "=", n).execute();
        return clone(r);
      });
    },
  };
}

export function createSqlPhotoStore(db: SqlDb): PhotoStore {
  return {
    async save(ownerId, raw, now = Date.now()) {
      const { id, type, bytes } = preparePhoto(raw);
      await db.insertInto("return_photos").values({ id, owner_id: ownerId, type, bytes: Buffer.from(bytes), created_at: new Date(now), attached_to: null }).execute();
      return { id, type };
    },
    async get(ownerId, id) {
      if (!isPhotoId(id)) return null;
      const r = await db.selectFrom("return_photos").selectAll().where("id", "=", id).where("owner_id", "=", ownerId).executeTakeFirst();
      if (!r) return null;
      return { id: r.id, ownerId: r.owner_id, type: r.type as PhotoType, bytes: new Uint8Array(r.bytes), createdAt: new Date(r.created_at).getTime(), attachedTo: r.attached_to } satisfies StoredPhoto;
    },
    async attach(ownerId, ids, returnNumber) {
      const unique = [...new Set(ids)];
      if (unique.some((id) => !isPhotoId(id))) return false;
      if (unique.length === 0) return true;
      try {
        return await sqlTx(db, async (trx) => {
          const rows = await trx.selectFrom("return_photos").select(["id", "owner_id", "attached_to"]).where("id", "in", unique).orderBy("id").forUpdate().execute();
          if (rows.length !== unique.length || rows.some((r) => r.owner_id !== ownerId || (r.attached_to && r.attached_to !== returnNumber))) throw new AttachRefused();
          await trx.updateTable("return_photos").set({ attached_to: returnNumber }).where("id", "in", unique).execute();
          return true;
        });
      } catch (e) {
        if (e instanceof AttachRefused) return false;
        throw e;
      }
    },
    async countRecent(ownerId, sinceMs, now = Date.now()) {
      const r = await db
        .selectFrom("return_photos")
        .select((eb) => eb.fn.countAll().as("n"))
        .where("owner_id", "=", ownerId)
        .where("created_at", ">", new Date(now - sinceMs))
        .executeTakeFirst();
      return Number(r?.n ?? 0);
    },
  };
}

export function createSqlInbox(db: SqlDb): GrievanceInbox {
  const read = (doc: unknown) => fromJson<PrivacyRequest>(doc, null as unknown as PrivacyRequest);
  return {
    async create(input, now) {
      for (let i = 0; i < 5; i++) {
        const request = newPrivacyRequest(input, now);
        try {
          await db
            .insertInto("privacy_requests")
            .values({ reference: request.reference, type: request.type, contact: request.contact, status: request.status, created_at: now, doc: JSON.stringify(request) })
            .execute();
          return clone(request);
        } catch (e) {
          if (!isUniqueViolation(e)) throw e; // reference collision (1 in 32^8) → new reference
        }
      }
      throw new Error("Could not allocate a request reference");
    },
    async countRecentByContact(contact, sinceMs, now) {
      const r = await db
        .selectFrom("privacy_requests")
        .select((eb) => eb.fn.countAll().as("n"))
        .where("contact", "=", contact)
        .where("created_at", ">=", new Date(now.getTime() - sinceMs))
        .executeTakeFirst();
      return Number(r?.n ?? 0);
    },
    async list() {
      return (await db.selectFrom("privacy_requests").select("doc").orderBy("created_at", "desc").limit(MAX_LIST).execute()).map((r) => read(r.doc));
    },
    async get(reference) {
      const r = await db.selectFrom("privacy_requests").select("doc").where("reference", "=", reference).executeTakeFirst();
      return r ? read(r.doc) : null;
    },
    async setStatus(reference, status, by, note, now = new Date()) {
      return sqlTx(db, async (trx) => {
        const row = await trx.selectFrom("privacy_requests").select("doc").where("reference", "=", reference).forUpdate().executeTakeFirst();
        if (!row) return null;
        const r = read(row.doc);
        r.status = status;
        r.log = [...(r.log ?? []), { at: now.toISOString(), by, status, note }];
        await trx.updateTable("privacy_requests").set({ status, doc: JSON.stringify(r) }).where("reference", "=", reference).execute();
        return clone(r);
      });
    },
  };
}

const freshSubscriber = (channel: NewsletterChannel, contact: string, now: Date): Subscriber => ({
  id: crypto.randomUUID(),
  channel,
  contact,
  status: "pending_confirmation",
  createdAt: now.toISOString(),
});

export function createSqlNewsletterStore(db: SqlDb): NewsletterStore {
  const toSub = (r: { id: string; channel: string; contact: string; status: string; created_at: Date }): Subscriber => ({
    id: r.id,
    channel: r.channel as NewsletterChannel,
    contact: r.contact,
    status: r.status as Subscriber["status"],
    createdAt: toIso(r.created_at),
  });
  return {
    async upsert(channel, contact, now) {
      for (let i = 0; i < 5; i++) {
        const existing = await db.selectFrom("newsletter_subscribers").selectAll().where("channel", "=", channel).where("contact", "=", contact).executeTakeFirst();
        if (existing && existing.status !== "unsubscribed") return toSub(existing);
        const sub = freshSubscriber(channel, contact, now);
        if (!existing) {
          try {
            await db.insertInto("newsletter_subscribers").values({ id: sub.id, channel, contact, status: sub.status, created_at: now }).execute();
            return sub;
          } catch (e) {
            if (!isUniqueViolation(e)) throw e;
            continue; // someone else signed this contact up a moment ago → read theirs
          }
        }
        // Re-subscribe after an unsubscribe: a new subscriber id (old consent rows stay linked to the old one).
        const r = await db
          .updateTable("newsletter_subscribers")
          .set({ id: sub.id, status: sub.status, created_at: now })
          .where("channel", "=", channel)
          .where("contact", "=", contact)
          .where("status", "=", "unsubscribed")
          .executeTakeFirst();
        if (Number(r.numUpdatedRows) === 1) return sub;
      }
      throw new Error("Newsletter sign-up is busy — try again");
    },
    async unsubscribe(id) {
      const r = await db.updateTable("newsletter_subscribers").set({ status: "unsubscribed" }).where("id", "=", id).where("status", "<>", "unsubscribed").executeTakeFirst();
      return Number(r.numUpdatedRows) === 1;
    },
  };
}

// ── MongoDB ──────────────────────────────────────────────────────────────────────────────────────

type ReturnDoc = ReturnRequest & { _id: string; _v: number };

export function createMongoReturnStore(conn: Promise<MongoConn>): ReturnStore {
  const col = async () => (await conn).db.collection<ReturnDoc>("returns");
  const strip = (d: ReturnDoc): ReturnRequest => {
    const r = clone(d) as Partial<ReturnDoc>;
    delete r._id;
    delete r._v;
    return r as ReturnRequest;
  };
  return {
    async create(r) {
      try {
        await (await col()).insertOne({ ...clone(r), _id: r.number, _v: 1 });
      } catch (e) {
        if (isMongoDuplicate(e)) throw new Error("Duplicate return number");
        throw e;
      }
      return clone(r);
    },
    async get(n) {
      const d = await (await col()).findOne({ _id: n });
      return d ? strip(d) : null;
    },
    async listByOrder(o) {
      return (await (await col()).find({ orderNumber: o }).sort({ createdAt: 1 }).toArray()).map(strip);
    },
    async listByCustomer(c) {
      return (await (await col()).find({ customerId: c }).sort({ createdAt: -1 }).toArray()).map(strip);
    },
    async listRecent(limit) {
      return (await (await col()).find().sort({ createdAt: -1 }).limit(Math.max(1, Math.min(limit, MAX_LIST))).toArray()).map(strip);
    },
    async update(n, patch) {
      const c = await col();
      for (let i = 0; i < 20; i++) {
        const d = await c.findOne({ _id: n });
        if (!d) return null;
        const r = strip(d);
        patch(r);
        const res = await c.replaceOne({ _id: n, _v: d._v }, { ...r, _v: d._v + 1 } as Omit<ReturnDoc, "_id">);
        if (res.matchedCount === 1) return clone(r);
        await new Promise((ok) => setTimeout(ok, 5 + Math.random() * 15));
      }
      throw new Error(`Return ${n} is busy — try again`);
    },
  };
}

interface PhotoDoc {
  _id: string;
  owner_id: string;
  type: PhotoType;
  bytes: Binary;
  created_at: Date;
  attached_to: string | null;
}

export function createMongoPhotoStore(conn: Promise<MongoConn>): PhotoStore {
  const col = async () => (await conn).db.collection<PhotoDoc>("return_photos");
  return {
    async save(ownerId, raw, now = Date.now()) {
      const { id, type, bytes } = preparePhoto(raw);
      await (await col()).insertOne({ _id: id, owner_id: ownerId, type, bytes: new Binary(bytes), created_at: new Date(now), attached_to: null });
      return { id, type };
    },
    async get(ownerId, id) {
      if (!isPhotoId(id)) return null;
      const d = await (await col()).findOne({ _id: id, owner_id: ownerId });
      if (!d) return null;
      return { id: d._id, ownerId: d.owner_id, type: d.type, bytes: new Uint8Array(d.bytes.buffer), createdAt: d.created_at.getTime(), attachedTo: d.attached_to };
    },
    async attach(ownerId, ids, returnNumber) {
      const unique = [...new Set(ids)];
      if (unique.some((id) => !isPhotoId(id))) return false;
      if (unique.length === 0) return true;
      const c = await col();
      try {
        return await mongoTx(await conn, async (session) => {
          // Conditional update: only this owner's photos that are free (or already on this return).
          const r = await c.updateMany(
            { _id: { $in: unique }, owner_id: ownerId, attached_to: { $in: [null, returnNumber] } },
            { $set: { attached_to: returnNumber } },
            { session },
          );
          if (r.matchedCount !== unique.length) throw new AttachRefused(); // aborts → nothing attached
          return true;
        });
      } catch (e) {
        if (e instanceof AttachRefused) return false;
        throw e;
      }
    },
    async countRecent(ownerId, sinceMs, now = Date.now()) {
      return (await col()).countDocuments({ owner_id: ownerId, created_at: { $gt: new Date(now - sinceMs) } });
    },
  };
}

type RequestDoc = PrivacyRequest & { _id: string };

export function createMongoInbox(conn: Promise<MongoConn>): GrievanceInbox {
  const col = async () => (await conn).db.collection<RequestDoc>("privacy_requests");
  const strip = (d: RequestDoc): PrivacyRequest => {
    const r = clone(d) as Partial<RequestDoc>;
    delete r._id;
    return r as PrivacyRequest;
  };
  return {
    async create(input, now) {
      const c = await col();
      for (let i = 0; i < 5; i++) {
        const request = newPrivacyRequest(input, now);
        try {
          await c.insertOne({ ...clone(request), _id: request.reference });
          return clone(request);
        } catch (e) {
          if (!isMongoDuplicate(e)) throw e;
        }
      }
      throw new Error("Could not allocate a request reference");
    },
    async countRecentByContact(contact, sinceMs, now) {
      return (await col()).countDocuments({ contact, createdAt: { $gte: new Date(now.getTime() - sinceMs).toISOString() } });
    },
    async list() {
      return (await (await col()).find().sort({ createdAt: -1 }).limit(MAX_LIST).toArray()).map(strip);
    },
    async get(reference) {
      const d = await (await col()).findOne({ _id: reference });
      return d ? strip(d) : null;
    },
    async setStatus(reference, status, by, note, now = new Date()) {
      // One atomic document update: the status and its log entry can't be split or lost under concurrency.
      const d = await (await col()).findOneAndUpdate(
        { _id: reference },
        { $set: { status }, $push: { log: { at: now.toISOString(), by, status, note } } },
        { returnDocument: "after" },
      );
      return d ? strip(d) : null;
    },
  };
}

interface SubscriberDoc extends Subscriber {
  /** `${channel}:${contact}` — one current subscriber per contact. */
  _id: string;
}

export function createMongoNewsletterStore(conn: Promise<MongoConn>): NewsletterStore {
  const col = async () => (await conn).db.collection<SubscriberDoc>("newsletter_subscribers");
  const strip = ({ id, channel, contact, status, createdAt }: SubscriberDoc): Subscriber => ({ id, channel, contact, status, createdAt });
  return {
    async upsert(channel, contact, now) {
      const c = await col();
      const key = `${channel}:${contact}`;
      for (let i = 0; i < 5; i++) {
        const existing = await c.findOne({ _id: key });
        if (existing && existing.status !== "unsubscribed") return strip(existing);
        const sub = freshSubscriber(channel, contact, now);
        if (!existing) {
          try {
            await c.insertOne({ ...sub, _id: key });
            return sub;
          } catch (e) {
            if (!isMongoDuplicate(e)) throw e;
            continue;
          }
        }
        const r = await c.updateOne({ _id: key, status: "unsubscribed" }, { $set: { id: sub.id, status: sub.status, createdAt: sub.createdAt } });
        if (r.modifiedCount === 1) return sub;
      }
      throw new Error("Newsletter sign-up is busy — try again");
    },
    async unsubscribe(id) {
      const r = await (await col()).updateOne({ id, status: { $ne: "unsubscribed" } }, { $set: { status: "unsubscribed" } });
      return r.modifiedCount === 1;
    },
  };
}
