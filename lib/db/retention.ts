/**
 * Retention schedule (DPDP: keep personal data only as long as the purpose needs it; database-safety: never
 * delete what proves a transaction). One place that says what is deleted, when — used by the cron sweep through
 * `purgeExpired` and documented in docs/backend/go-live.md.
 *
 * KEPT (never purged here): orders, payments, invoices (GST: 8 years), ledgers (credit, coins, gift cards), the
 * consent ledger, the audit log, privacy requests, returns, webhook / restock / review markers (idempotency).
 * Account erasure is a separate, audited path (lib/account/service.ts).
 */
export const RETENTION = {
  /** Customer + staff sessions: as soon as they expire. */
  sessionsAfterExpiryMs: 0,
  /** OTP challenges: 1 h after expiry; OTP send log: 2 days (resend caps look back 1 day). */
  otpChallengeAfterExpiryMs: 3_600_000,
  otpSendLogMs: 2 * 86_400_000,
  /** Staff sign-in tickets: at expiry; used or expired invites: 7 days. */
  staffTicketAfterExpiryMs: 0,
  staffInviteAfterExpiryMs: 7 * 86_400_000,
  /** Rate-limit windows: when the window ends. Distributed locks: 1 h after expiry. */
  rateWindowAfterResetMs: 0,
  lockAfterExpiryMs: 3_600_000,
  /** Finished / expired stock holds: 30 days (kept a while for support questions). */
  reservationAfterEndMs: 30 * 86_400_000,
  /** Bags untouched for 90 days. */
  cartIdleMs: 90 * 86_400_000,
  /** Return / #WearTheHood photos uploaded but never attached to anything: 24 h. */
  orphanPhotoMs: 86_400_000,
  /** Abandoned-checkout state: 8 days (the flow gives up after 7). */
  checkoutFlowMs: 8 * 86_400_000,
} as const;

export interface PurgeResult {
  [table: string]: number;
}

export interface Maintenance {
  /** Deletes expired rows per RETENTION. Idempotent and safe to run at any time, on any environment. */
  purgeExpired(now?: Date): Promise<PurgeResult>;
}
