import { randomToken } from "@/lib/auth/secrets";
import type { Challenge, OtpStore } from "@/lib/auth/otp";
import type { SessionRecord, SessionStore } from "@/lib/auth/session";
import type { MongoConn } from "../mongo";
import { type SqlDb, sqlTx, toBool } from "../sql";

/**
 * Sessions + OTP on SQL / MongoDB. Session rows are keyed by the token's SHA-256 (never the token). OTP attempts
 * and single use are CONDITIONAL updates checked by affected-row count, so concurrent requests can't both win.
 */
const ms = (d: Date | string | number) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

// ── SQL ──────────────────────────────────────────────────────────────────────────────────────────

export function createSqlSessionStore(db: SqlDb): SessionStore {
  return {
    async put(h, s) {
      await db.insertInto("sessions").values({ token_hash: h, customer_id: s.customerId, created_at: new Date(s.createdAt), expires_at: new Date(s.expiresAt) }).execute();
    },
    async get(h) {
      const r = await db.selectFrom("sessions").selectAll().where("token_hash", "=", h).executeTakeFirst();
      return r ? { customerId: r.customer_id, createdAt: ms(r.created_at), expiresAt: ms(r.expires_at) } : null;
    },
    async delete(h) {
      await db.deleteFrom("sessions").where("token_hash", "=", h).execute();
    },
    async deleteByCustomer(id) {
      const r = await db.deleteFrom("sessions").where("customer_id", "=", id).executeTakeFirst();
      return Number(r.numDeletedRows);
    },
  };
}

export function createSqlOtpStore(db: SqlDb): OtpStore {
  const toChallenge = (r: { id: string; phone: string; code_hash: string; expires_at: Date; attempts: number; used: boolean | number }): Challenge => ({
    id: r.id,
    phone: r.phone,
    codeHash: r.code_hash,
    expiresAt: ms(r.expires_at),
    attempts: Number(r.attempts),
    used: toBool(r.used),
  });
  return {
    async sendsSince(phone, since) {
      const rows = await db.selectFrom("otp_sends").select("sent_at").where("phone", "=", phone).where("sent_at", ">", new Date(since)).execute();
      return rows.map((r) => ms(r.sent_at));
    },
    async recordSend(phone, at) {
      await db.insertInto("otp_sends").values({ id: randomToken(12), phone, sent_at: new Date(at) }).execute();
      // Housekeeping: history older than a day is never needed (keeps the table small; bounded delete with WHERE).
      await db.deleteFrom("otp_sends").where("phone", "=", phone).where("sent_at", "<", new Date(at - 86_400_000)).execute();
    },
    async replaceChallenge(c) {
      await sqlTx(db, async (trx) => {
        await trx.deleteFrom("otp_challenges").where("phone", "=", c.phone).where("used", "=", false).execute();
        await trx.insertInto("otp_challenges").values({ id: c.id, phone: c.phone, code_hash: c.codeHash, expires_at: new Date(c.expiresAt), attempts: c.attempts, used: c.used }).execute();
      });
    },
    async getChallenge(id) {
      const r = await db.selectFrom("otp_challenges").selectAll().where("id", "=", id).executeTakeFirst();
      return r ? toChallenge(r) : null;
    },
    async deleteChallenge(id) {
      await db.deleteFrom("otp_challenges").where("id", "=", id).execute();
    },
    async bumpAttempt(id, max) {
      return sqlTx(db, async (trx) => {
        const r = await trx
          .updateTable("otp_challenges")
          .set((eb) => ({ attempts: eb("attempts", "+", 1) }))
          .where("id", "=", id)
          .where("used", "=", false)
          .where("attempts", "<", max)
          .executeTakeFirst();
        if (Number(r.numUpdatedRows) === 0) return null;
        const row = await trx.selectFrom("otp_challenges").select("attempts").where("id", "=", id).executeTakeFirst();
        return row ? Number(row.attempts) : null;
      });
    },
    async consume(id) {
      const r = await db.updateTable("otp_challenges").set({ used: true }).where("id", "=", id).where("used", "=", false).executeTakeFirst();
      return Number(r.numUpdatedRows) === 1;
    },
  };
}

// ── MongoDB ──────────────────────────────────────────────────────────────────────────────────────

type SessionDoc = { _id: string; customer_id: string; created_at: Date; expires_at: Date };
type ChallengeDoc = { _id: string; phone: string; code_hash: string; expires_at: Date; attempts: number; used: boolean };
type SendDoc = { _id: string; phone: string; sent_at: Date };

export function createMongoSessionStore(conn: Promise<MongoConn>): SessionStore {
  const col = async () => (await conn).db.collection<SessionDoc>("sessions");
  return {
    async put(h, s: SessionRecord) {
      await (await col()).insertOne({ _id: h, customer_id: s.customerId, created_at: new Date(s.createdAt), expires_at: new Date(s.expiresAt) });
    },
    async get(h) {
      const d = await (await col()).findOne({ _id: h });
      return d ? { customerId: d.customer_id, createdAt: ms(d.created_at), expiresAt: ms(d.expires_at) } : null;
    },
    async delete(h) {
      await (await col()).deleteOne({ _id: h });
    },
    async deleteByCustomer(id) {
      return (await (await col()).deleteMany({ customer_id: id })).deletedCount;
    },
  };
}

export function createMongoOtpStore(conn: Promise<MongoConn>): OtpStore {
  const challenges = async () => (await conn).db.collection<ChallengeDoc>("otp_challenges");
  const sends = async () => (await conn).db.collection<SendDoc>("otp_sends");
  const toChallenge = (d: ChallengeDoc): Challenge => ({ id: d._id, phone: d.phone, codeHash: d.code_hash, expiresAt: ms(d.expires_at), attempts: d.attempts, used: d.used });
  return {
    async sendsSince(phone, since) {
      return (await (await sends()).find({ phone, sent_at: { $gt: new Date(since) } }).toArray()).map((d) => ms(d.sent_at));
    },
    async recordSend(phone, at) {
      await (await sends()).insertOne({ _id: randomToken(12), phone, sent_at: new Date(at) });
    },
    async replaceChallenge(c) {
      const col = await challenges();
      await col.deleteMany({ phone: c.phone, used: false });
      await col.insertOne({ _id: c.id, phone: c.phone, code_hash: c.codeHash, expires_at: new Date(c.expiresAt), attempts: c.attempts, used: c.used });
    },
    async getChallenge(id) {
      const d = await (await challenges()).findOne({ _id: id });
      return d ? toChallenge(d) : null;
    },
    async deleteChallenge(id) {
      await (await challenges()).deleteOne({ _id: id });
    },
    async bumpAttempt(id, max) {
      const d = await (await challenges()).findOneAndUpdate({ _id: id, used: false, attempts: { $lt: max } }, { $inc: { attempts: 1 } }, { returnDocument: "after" });
      return d ? d.attempts : null;
    },
    async consume(id) {
      const r = await (await challenges()).updateOne({ _id: id, used: false }, { $set: { used: true } });
      return r.modifiedCount === 1;
    },
  };
}
