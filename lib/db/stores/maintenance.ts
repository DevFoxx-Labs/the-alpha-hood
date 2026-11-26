import { securityPolicy } from "@/lib/security/policy";
import type { MongoConn } from "../mongo";
import { type Maintenance, RETENTION as R } from "../retention";
import type { SqlDb } from "../sql";

/**
 * Scheduled clean-up (cron sweep) — deletes only what RETENTION lists, always with a WHERE on an expiry column.
 * Each statement is independent and idempotent: a failure or a second run just leaves less to delete next time.
 */
export function createSqlMaintenance(db: SqlDb): Maintenance {
  return {
    async purgeExpired(now = new Date()) {
      const t = now.getTime();
      const at = (ms: number) => new Date(t - ms);
      const out: Record<string, number> = {};
      const del = async (name: string, q: { executeTakeFirst(): Promise<{ numDeletedRows: bigint }> }) => {
        out[name] = Number((await q.executeTakeFirst()).numDeletedRows);
      };
      await del("sessions", db.deleteFrom("sessions").where("expires_at", "<=", at(R.sessionsAfterExpiryMs)));
      await del("otp_challenges", db.deleteFrom("otp_challenges").where("expires_at", "<=", at(R.otpChallengeAfterExpiryMs)));
      await del("otp_sends", db.deleteFrom("otp_sends").where("sent_at", "<=", at(R.otpSendLogMs)));
      await del("staff_sessions", db.deleteFrom("staff_sessions").where((eb) => eb.or([eb("expires_at", "<=", t), eb("last_seen", "<=", t - securityPolicy().staffIdleMs)])));
      await del("staff_tickets", db.deleteFrom("staff_tickets").where("expires_at", "<=", t - R.staffTicketAfterExpiryMs));
      await del("staff_invites", db.deleteFrom("staff_invites").where("expires_at", "<=", t - R.staffInviteAfterExpiryMs));
      await del("rate_limits", db.deleteFrom("rate_limits").where("reset_at", "<=", t - R.rateWindowAfterResetMs));
      await del("app_locks", db.deleteFrom("app_locks").where("expires_at", "<=", at(R.lockAfterExpiryMs)));
      // Items go with their reservation (FK ON DELETE CASCADE).
      await del("inventory_reservations", db.deleteFrom("inventory_reservations").where("expires_at", "<=", at(R.reservationAfterEndMs)));
      await del("carts", db.deleteFrom("carts").where("updated_at", "<=", at(R.cartIdleMs)));
      await del("return_photos", db.deleteFrom("return_photos").where("attached_to", "is", null).where("created_at", "<=", at(R.orphanPhotoMs)));
      await del("flow_checkouts", db.deleteFrom("flow_checkouts").where("started_at", "<=", at(R.checkoutFlowMs).toISOString()));
      return out;
    },
  };
}

export function createMongoMaintenance(conn: Promise<MongoConn>): Maintenance {
  return {
    async purgeExpired(now = new Date()) {
      const t = now.getTime();
      const at = (ms: number) => new Date(t - ms);
      const db = (await conn).db;
      const out: Record<string, number> = {};
      const del = async (name: string, filter: Record<string, unknown>) => {
        out[name] = (await db.collection(name).deleteMany(filter)).deletedCount;
      };
      // TTL indexes already remove most of these; running it here makes the timing exact and testable.
      await del("sessions", { expires_at: { $lte: at(R.sessionsAfterExpiryMs) } });
      await del("otp_challenges", { expires_at: { $lte: at(R.otpChallengeAfterExpiryMs) } });
      await del("otp_sends", { sent_at: { $lte: at(R.otpSendLogMs) } });
      await del("staff_sessions", { $or: [{ expiresAt: { $lte: t } }, { lastSeen: { $lte: t - securityPolicy().staffIdleMs } }] });
      await del("staff_tickets", { expiresAt: { $lte: t - R.staffTicketAfterExpiryMs } });
      await del("staff_invites", { expiresAt: { $lte: t - R.staffInviteAfterExpiryMs } });
      await del("rate_limits", { resetAt: { $lte: t - R.rateWindowAfterResetMs } });
      await del("app_locks", { expires_at: { $lte: at(R.lockAfterExpiryMs) } });
      await del("inventory_reservations", { expires_at: { $lte: at(R.reservationAfterEndMs) } });
      await del("carts", { updated_at: { $lte: at(R.cartIdleMs) } });
      await del("return_photos", { attached_to: null, created_at: { $lte: at(R.orphanPhotoMs) } });
      await del("flow_checkouts", { startedAt: { $lte: at(R.checkoutFlowMs).toISOString() } });
      return out;
    },
  };
}

/** Nothing to clean in memory stores (they live only as long as the process). */
export const noMaintenance: Maintenance = { purgeExpired: async () => ({}) };
