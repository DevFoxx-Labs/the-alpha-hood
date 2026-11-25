import { randomBytes } from "node:crypto";
import type { AuditEntry, AuditLog } from "@/lib/admin/audit";
import type { Role } from "@/lib/admin/permissions";
import { type AdminSession, type Invite, type LoginTicket, type Staff, StaffConflictError, type StaffStore } from "@/lib/admin/staff";
import type { RateCounterStore } from "@/lib/http/rate-limit";
import { isMongoDuplicate, type MongoConn } from "../mongo";
import type { SecretBox } from "../secret-box";
import { fromJson, isUniqueViolation, type SqlDb, sqlTx, toBool, toIso } from "../sql";

/**
 * Phase 5 — staff + MFA, audit log, shared rate limits on the own backend.
 * - TOTP secrets (and pending enrolment secrets) are sealed with AES-256-GCM before they touch the database.
 * - Every security counter is a conditional update evaluated by the database: failed-login lockout, TOTP step
 *   (a code is accepted once, only if newer — no replay across servers), single-use invites, ticket attempts.
 * - The audit log is insert-only; there is no update or delete path.
 */
const n = (v: number | string | null | undefined) => Number(v ?? 0);

// ── SQL ──────────────────────────────────────────────────────────────────────────────────────────

type StaffRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string | null;
  totp_secret_sealed: string | null;
  totp_enabled: boolean | number;
  last_totp_step: number | string;
  disabled: boolean | number;
  failed_logins: number;
  locked_until: number | string;
  created_at: Date;
  last_login_at: Date | null;
};

export function createSqlStaffStore(db: SqlDb, box: SecretBox): StaffStore {
  const fromRow = (r: StaffRow): Staff => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role as Role,
    passwordHash: r.password_hash,
    totpSecret: r.totp_secret_sealed ? box.open(r.totp_secret_sealed) : null,
    totpEnabled: toBool(r.totp_enabled),
    lastTotpStep: n(r.last_totp_step),
    disabled: toBool(r.disabled),
    failedLogins: n(r.failed_logins),
    lockedUntil: n(r.locked_until),
    createdAt: toIso(r.created_at),
    lastLoginAt: r.last_login_at ? toIso(r.last_login_at) : null,
  });
  const toRow = (s: Staff) => ({
    id: s.id,
    email: s.email,
    name: s.name,
    role: s.role,
    password_hash: s.passwordHash,
    totp_secret_sealed: s.totpSecret ? box.seal(s.totpSecret) : null,
    totp_enabled: s.totpEnabled,
    last_totp_step: s.lastTotpStep,
    disabled: s.disabled,
    failed_logins: s.failedLogins,
    locked_until: s.lockedUntil,
    created_at: new Date(s.createdAt),
    last_login_at: s.lastLoginAt ? new Date(s.lastLoginAt) : null,
  });
  const one = async (q: Promise<StaffRow | undefined>) => {
    const r = await q;
    return r ? fromRow(r) : null;
  };
  return {
    async count() {
      const r = await db.selectFrom("staff").select((eb) => eb.fn.countAll<number>().as("c")).executeTakeFirst();
      return n(r?.c);
    },
    async list() {
      return (await db.selectFrom("staff").selectAll().orderBy("created_at").execute()).map(fromRow);
    },
    get: (id) => one(db.selectFrom("staff").selectAll().where("id", "=", id).executeTakeFirst()),
    byEmail: (email) => one(db.selectFrom("staff").selectAll().where("email", "=", email).executeTakeFirst()),
    async insert(s) {
      try {
        await db.insertInto("staff").values(toRow(s)).execute();
      } catch (e) {
        if (isUniqueViolation(e)) throw new StaffConflictError();
        throw e;
      }
    },
    async update(id, patch) {
      return sqlTx(db, async (trx) => {
        const r = await trx.selectFrom("staff").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
        if (!r) return null;
        const s = fromRow(r);
        if (patch(s) === false) return s;
        const { id: _id, ...rest } = toRow(s);
        void _id;
        await trx.updateTable("staff").set(rest).where("id", "=", id).execute();
        return s;
      });
    },
    async recordFailedLogin(id, max, lockUntil) {
      await db.updateTable("staff").set((eb) => ({ failed_logins: eb("failed_logins", "+", 1) })).where("id", "=", id).execute();
      // Only the request that crosses the limit locks (conditional on the counter it saw).
      const r = await db.updateTable("staff").set({ failed_logins: 0, locked_until: lockUntil }).where("id", "=", id).where("failed_logins", ">=", max).executeTakeFirst();
      return Number(r.numUpdatedRows) === 1;
    },
    async useTotpStep(id, step, at, enrolSecret) {
      let q = db
        .updateTable("staff")
        .set({ last_totp_step: step, last_login_at: new Date(at), failed_logins: 0, ...(enrolSecret !== null ? { totp_secret_sealed: box.seal(enrolSecret), totp_enabled: true } : {}) })
        .where("id", "=", id)
        .where("last_totp_step", "<", step);
      if (enrolSecret !== null) q = q.where("totp_enabled", "=", false);
      const r = await q.executeTakeFirst();
      return Number(r.numUpdatedRows) === 1;
    },
    async putInvite(i) {
      await db.insertInto("staff_invites").values({ token_hash: i.tokenHash, email: i.email, name: i.name, role: i.role, invited_by: i.invitedBy, expires_at: i.expiresAt, used: i.used, reset_for: i.resetFor ?? null }).execute();
    },
    async listInvites(now) {
      const rows = await db.selectFrom("staff_invites").selectAll().where("used", "=", false).where("expires_at", ">", now).execute();
      return rows.map(inviteFromRow);
    },
    async getInvite(h) {
      const r = await db.selectFrom("staff_invites").selectAll().where("token_hash", "=", h).executeTakeFirst();
      return r ? inviteFromRow(r) : null;
    },
    async consumeInvite(h, now) {
      const r = await db.updateTable("staff_invites").set({ used: true }).where("token_hash", "=", h).where("used", "=", false).where("expires_at", ">", now).executeTakeFirst();
      if (Number(r.numUpdatedRows) !== 1) return null;
      const row = await db.selectFrom("staff_invites").selectAll().where("token_hash", "=", h).executeTakeFirst();
      return row ? inviteFromRow(row) : null;
    },
    async putTicket(h, t) {
      await db.insertInto("staff_tickets").values({ token_hash: h, staff_id: t.staffId, expires_at: t.expiresAt, attempts: t.attempts, pending_secret_sealed: t.pendingSecret ? box.seal(t.pendingSecret) : null }).execute();
    },
    async getTicket(h) {
      const r = await db.selectFrom("staff_tickets").selectAll().where("token_hash", "=", h).executeTakeFirst();
      return r ? ({ staffId: r.staff_id, expiresAt: n(r.expires_at), attempts: n(r.attempts), pendingSecret: r.pending_secret_sealed ? box.open(r.pending_secret_sealed) : null } satisfies LoginTicket) : null;
    },
    async bumpTicket(h) {
      const r = await db.updateTable("staff_tickets").set((eb) => ({ attempts: eb("attempts", "+", 1) })).where("token_hash", "=", h).executeTakeFirst();
      if (Number(r.numUpdatedRows) !== 1) return null;
      const row = await db.selectFrom("staff_tickets").select("attempts").where("token_hash", "=", h).executeTakeFirst();
      return row ? n(row.attempts) : null;
    },
    async setTicketSecret(h, secret) {
      await db.updateTable("staff_tickets").set({ pending_secret_sealed: box.seal(secret) }).where("token_hash", "=", h).where("pending_secret_sealed", "is", null).execute();
      const row = await db.selectFrom("staff_tickets").select("pending_secret_sealed").where("token_hash", "=", h).executeTakeFirst();
      return row?.pending_secret_sealed ? box.open(row.pending_secret_sealed) : null;
    },
    async deleteTicket(h) {
      await db.deleteFrom("staff_tickets").where("token_hash", "=", h).execute();
    },
    async putSession(h, s) {
      await db.insertInto("staff_sessions").values({ token_hash: h, staff_id: s.staffId, created_at: s.createdAt, last_seen: s.lastSeen, expires_at: s.expiresAt }).execute();
    },
    async getSession(h) {
      const r = await db.selectFrom("staff_sessions").selectAll().where("token_hash", "=", h).executeTakeFirst();
      return r ? ({ staffId: r.staff_id, createdAt: n(r.created_at), lastSeen: n(r.last_seen), expiresAt: n(r.expires_at) } satisfies AdminSession) : null;
    },
    async touchSession(h, now) {
      await db.updateTable("staff_sessions").set({ last_seen: now }).where("token_hash", "=", h).execute();
    },
    async deleteSession(h) {
      await db.deleteFrom("staff_sessions").where("token_hash", "=", h).execute();
    },
    async deleteSessionsOf(staffId) {
      const r = await db.deleteFrom("staff_sessions").where("staff_id", "=", staffId).executeTakeFirst();
      return Number(r.numDeletedRows);
    },
  };
}

function inviteFromRow(r: { token_hash: string; email: string; name: string; role: string; invited_by: string; expires_at: number | string; used: boolean | number; reset_for?: string | null }): Invite {
  return { tokenHash: r.token_hash, email: r.email, name: r.name, role: r.role as Role, invitedBy: r.invited_by, expiresAt: n(r.expires_at), used: toBool(r.used), resetFor: r.reset_for ?? null };
}

const newAuditId = () => `aud_${randomBytes(8).toString("hex")}`;

export function createSqlAudit(db: SqlDb): AuditLog {
  return {
    async append(entry, now = new Date()) {
      const row: AuditEntry = { ...entry, details: { ...entry.details }, id: newAuditId(), at: now.toISOString() };
      await db
        .insertInto("audit_log")
        .values({ id: row.id, at: now, actor_id: row.actorId, actor_email: row.actorEmail, action: row.action.slice(0, 60), target: row.target.slice(0, 190), details: JSON.stringify(row.details), ip: row.ip.slice(0, 45) })
        .execute();
      return Object.freeze(row);
    },
    async list(filter = {}) {
      let q = db.selectFrom("audit_log").selectAll().orderBy("at", "desc").orderBy("id", "desc").limit(Math.max(1, Math.min(filter.limit ?? 200, 5000)));
      if (filter.actorId) q = q.where("actor_id", "=", filter.actorId);
      if (filter.target) q = q.where("target", "=", filter.target);
      return (await q.execute()).map((r) => ({ id: r.id, at: toIso(r.at), actorId: r.actor_id, actorEmail: r.actor_email, action: r.action, target: r.target, details: fromJson(r.details, {}), ip: r.ip }));
    },
  };
}

export function createSqlRateCounters(db: SqlDb): RateCounterStore {
  return {
    async hit(key, windowMs, now) {
      for (let i = 0; i < 3; i++) {
        // Atomic per row: a new window when the old one ended, else +1.
        const r = await db
          .updateTable("rate_limits")
          .set((eb) => ({
            count: eb.case().when("reset_at", "<=", now).then(1).else(eb("count", "+", 1)).end(),
            reset_at: eb.case().when("reset_at", "<=", now).then(now + windowMs).else(eb.ref("reset_at")).end(),
          }))
          .where("key_hash", "=", key)
          .executeTakeFirst();
        if (Number(r.numUpdatedRows) === 0) {
          try {
            await db.insertInto("rate_limits").values({ key_hash: key, count: 1, reset_at: now + windowMs }).execute();
            return { count: 1, resetAt: now + windowMs };
          } catch (e) {
            if (!isUniqueViolation(e)) throw e;
            continue; // created by a parallel request → count on it
          }
        }
        const row = await db.selectFrom("rate_limits").select(["count", "reset_at"]).where("key_hash", "=", key).executeTakeFirst();
        if (row) return { count: n(row.count), resetAt: n(row.reset_at) };
      }
      throw new Error("rate limit counter busy");
    },
    async peek(key, now) {
      const row = await db.selectFrom("rate_limits").select(["count", "reset_at"]).where("key_hash", "=", key).executeTakeFirst();
      return row && n(row.reset_at) > now ? { count: n(row.count), resetAt: n(row.reset_at) } : null;
    },
  };
}

// ── MongoDB ──────────────────────────────────────────────────────────────────────────────────────

type StaffDoc = Omit<Staff, "id" | "totpSecret"> & { _id: string; totpSecretSealed: string | null; _v: number };

export function createMongoStaffStore(conn: Promise<MongoConn>, box: SecretBox): StaffStore {
  const db = async () => (await conn).db;
  const staffCol = async () => (await db()).collection<StaffDoc>("staff");
  const fromDoc = (d: StaffDoc): Staff => {
    const { _id, totpSecretSealed, _v, ...rest } = d;
    void _v;
    return { ...rest, id: _id, totpSecret: totpSecretSealed ? box.open(totpSecretSealed) : null };
  };
  const toDoc = (s: Staff, v: number): StaffDoc => {
    const { id, totpSecret, ...rest } = s;
    return { ...rest, _id: id, totpSecretSealed: totpSecret ? box.seal(totpSecret) : null, _v: v };
  };
  type InviteDoc = Omit<Invite, "tokenHash"> & { _id: string };
  type TicketDoc = { _id: string; staffId: string; expiresAt: number; expiresAtDate: Date; attempts: number; pendingSecretSealed: string | null };
  type SessionDoc = AdminSession & { _id: string; expiresAtDate: Date };
  const invites = async () => (await db()).collection<InviteDoc>("staff_invites");
  const tickets = async () => (await db()).collection<TicketDoc>("staff_tickets");
  const sessions = async () => (await db()).collection<SessionDoc>("staff_sessions");
  const inv = (d: InviteDoc): Invite => {
    const { _id, ...rest } = d;
    return { ...rest, tokenHash: _id, resetFor: rest.resetFor ?? null };
  };
  return {
    async count() {
      return (await staffCol()).countDocuments();
    },
    async list() {
      return (await (await staffCol()).find().sort({ createdAt: 1 }).toArray()).map(fromDoc);
    },
    async get(id) {
      const d = await (await staffCol()).findOne({ _id: id });
      return d ? fromDoc(d) : null;
    },
    async byEmail(email) {
      const d = await (await staffCol()).findOne({ email });
      return d ? fromDoc(d) : null;
    },
    async insert(s) {
      try {
        await (await staffCol()).insertOne(toDoc(s, 1));
      } catch (e) {
        if (isMongoDuplicate(e)) throw new StaffConflictError();
        throw e;
      }
    },
    async update(id, patch) {
      const c = await staffCol();
      for (let i = 0; i < 20; i++) {
        const d = await c.findOne({ _id: id });
        if (!d) return null;
        const s = fromDoc(d);
        if (patch(s) === false) return s;
        const r = await c.replaceOne({ _id: id, _v: d._v }, toDoc(s, d._v + 1));
        if (r.matchedCount === 1) return s;
      }
      throw new Error("Staff record is busy — try again");
    },
    async recordFailedLogin(id, max, lockUntil) {
      const c = await staffCol();
      await c.updateOne({ _id: id }, { $inc: { failedLogins: 1, _v: 1 } });
      const r = await c.updateOne({ _id: id, failedLogins: { $gte: max } }, { $set: { failedLogins: 0, lockedUntil: lockUntil }, $inc: { _v: 1 } });
      return r.modifiedCount === 1;
    },
    async useTotpStep(id, step, at, enrolSecret) {
      const filter: Record<string, unknown> = { _id: id, lastTotpStep: { $lt: step } };
      if (enrolSecret !== null) filter.totpEnabled = false;
      const r = await (await staffCol()).updateOne(filter, {
        $set: { lastTotpStep: step, lastLoginAt: at, failedLogins: 0, ...(enrolSecret !== null ? { totpSecretSealed: box.seal(enrolSecret), totpEnabled: true } : {}) },
        $inc: { _v: 1 },
      });
      return r.modifiedCount === 1;
    },
    async putInvite(i) {
      const { tokenHash, ...rest } = i;
      await (await invites()).insertOne({ ...rest, _id: tokenHash });
    },
    async listInvites(now) {
      return (await (await invites()).find({ used: false, expiresAt: { $gt: now } }).toArray()).map(inv);
    },
    async getInvite(h) {
      const d = await (await invites()).findOne({ _id: h });
      return d ? inv(d) : null;
    },
    async consumeInvite(h, now) {
      const d = await (await invites()).findOneAndUpdate({ _id: h, used: false, expiresAt: { $gt: now } }, { $set: { used: true } }, { returnDocument: "after" });
      return d ? inv(d) : null;
    },
    async putTicket(h, t) {
      await (await tickets()).insertOne({ _id: h, staffId: t.staffId, expiresAt: t.expiresAt, expiresAtDate: new Date(t.expiresAt), attempts: t.attempts, pendingSecretSealed: t.pendingSecret ? box.seal(t.pendingSecret) : null });
    },
    async getTicket(h) {
      const d = await (await tickets()).findOne({ _id: h });
      return d ? { staffId: d.staffId, expiresAt: d.expiresAt, attempts: d.attempts, pendingSecret: d.pendingSecretSealed ? box.open(d.pendingSecretSealed) : null } : null;
    },
    async bumpTicket(h) {
      const d = await (await tickets()).findOneAndUpdate({ _id: h }, { $inc: { attempts: 1 } }, { returnDocument: "after" });
      return d ? d.attempts : null;
    },
    async setTicketSecret(h, secret) {
      const c = await tickets();
      await c.updateOne({ _id: h, pendingSecretSealed: null }, { $set: { pendingSecretSealed: box.seal(secret) } });
      const d = await c.findOne({ _id: h });
      return d?.pendingSecretSealed ? box.open(d.pendingSecretSealed) : null;
    },
    async deleteTicket(h) {
      await (await tickets()).deleteOne({ _id: h });
    },
    async putSession(h, s) {
      await (await sessions()).insertOne({ ...s, _id: h, expiresAtDate: new Date(s.expiresAt) });
    },
    async getSession(h) {
      const d = await (await sessions()).findOne({ _id: h });
      return d ? { staffId: d.staffId, createdAt: d.createdAt, lastSeen: d.lastSeen, expiresAt: d.expiresAt } : null;
    },
    async touchSession(h, now) {
      await (await sessions()).updateOne({ _id: h }, { $set: { lastSeen: now } });
    },
    async deleteSession(h) {
      await (await sessions()).deleteOne({ _id: h });
    },
    async deleteSessionsOf(staffId) {
      return (await (await sessions()).deleteMany({ staffId })).deletedCount;
    },
  };
}

export function createMongoAudit(conn: Promise<MongoConn>): AuditLog {
  type Doc = Omit<AuditEntry, "id"> & { _id: string; seq: number };
  const col = async () => (await conn).db.collection<Doc>("audit_log");
  let seq = 0;
  return {
    async append(entry, now = new Date()) {
      const row: AuditEntry = { ...entry, details: { ...entry.details }, id: newAuditId(), at: now.toISOString() };
      const { id, ...rest } = row;
      await (await col()).insertOne({ ...rest, _id: id, seq: now.getTime() * 1000 + (seq++ % 1000) });
      return Object.freeze(row);
    },
    async list(filter = {}) {
      const q: Record<string, unknown> = {};
      if (filter.actorId) q.actorId = filter.actorId;
      if (filter.target) q.target = filter.target;
      const docs = await (await col()).find(q).sort({ seq: -1 }).limit(Math.max(1, Math.min(filter.limit ?? 200, 5000))).toArray();
      return docs.map(({ _id, seq: _s, ...rest }) => {
        void _s;
        return { ...rest, id: _id };
      });
    },
  };
}

export function createMongoRateCounters(conn: Promise<MongoConn>): RateCounterStore {
  type Doc = { _id: string; count: number; resetAt: number; resetAtDate: Date };
  const col = async () => (await conn).db.collection<Doc>("rate_limits");
  return {
    async hit(key, windowMs, now) {
      const expired = { $lte: [{ $ifNull: ["$resetAt", 0] }, now] };
      const d = await (await col()).findOneAndUpdate(
        { _id: key },
        [
          {
            $set: {
              count: { $cond: [expired, 1, { $add: ["$count", 1] }] },
              resetAt: { $cond: [expired, now + windowMs, "$resetAt"] },
              resetAtDate: { $cond: [expired, new Date(now + windowMs), "$resetAtDate"] },
            },
          },
        ],
        { upsert: true, returnDocument: "after" },
      );
      return { count: d?.count ?? 1, resetAt: d?.resetAt ?? now + windowMs };
    },
    async peek(key, now) {
      const d = await (await col()).findOne({ _id: key });
      return d && d.resetAt > now ? { count: d.count, resetAt: d.resetAt } : null;
    },
  };
}
