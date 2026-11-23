import { randomBytes } from "node:crypto";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * Alpha Club storage (LOY-01/02). Two parts:
 * - memberships: who joined (and when), their referral code, and who referred them;
 * - the Hood Coins ledger: append-only, one entry per unique `reference` (a retried earn / reversal can never
 *   apply twice). Entries become spendable at `availableAt` (after the return window) and expire at `expiresAt`.
 * Memory implementation for dev/preview; production refuses until the database exists (fail closed).
 */
export interface Membership {
  customerId: string;
  joinedAt: string;
  referralCode: string;
  /** Random visitor id (ah_vid) at joining — only used to spot self-referrals from the same browser. */
  visitorId: string | null;
}

export type CoinKind = "earn" | "earn_reversal" | "referral" | "referral_reversal" | "ugc" | "adjustment" | "expired";

export interface CoinEntry {
  id: string;
  customerId: string;
  /** Whole coins; negative for reversals / adjustments down. */
  coins: number;
  kind: CoinKind;
  reference: string;
  createdAt: string;
  /** When the coins can be used (earned coins wait for the return window). */
  availableAt: string;
  expiresAt: string | null;
}

export interface ReferralRecord {
  code: string;
  referrerId: string;
  friendId: string;
  orderNumber: string;
  createdAt: string;
}

export interface LoyaltyStore {
  getMember(customerId: string): Promise<Membership | null>;
  join(customerId: string, now?: Date, visitorId?: string | null): Promise<Membership>;
  leave(customerId: string): Promise<boolean>;
  memberByCode(code: string): Promise<Membership | null>;
  /** Idempotent per reference; refuses an entry that would make the customer's total negative. */
  addCoins(entry: Omit<CoinEntry, "id" | "createdAt">, now?: Date): Promise<CoinEntry>;
  entry(reference: string): Promise<CoinEntry | null>;
  coins(customerId: string): Promise<CoinEntry[]>;
  recordReferral(r: Omit<ReferralRecord, "createdAt">, now?: Date): Promise<boolean>;
  referralFor(orderNumber: string): Promise<ReferralRecord | null>;
  referralsBy(referrerId: string): Promise<ReferralRecord[]>;
  /** Erasure: drops the membership and coins (account deletion). */
  erase(customerId: string): Promise<void>;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_RE = /^REF[A-HJ-NP-Z2-9]{6}$/;

export function newReferralCode(): string {
  const bytes = randomBytes(6);
  return `REF${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

export function createMemoryLoyaltyStore(): LoyaltyStore {
  const members = new Map<string, Membership>();
  const byCode = new Map<string, string>();
  const entries: CoinEntry[] = [];
  const byRef = new Map<string, CoinEntry>();
  const referrals = new Map<string, ReferralRecord>();
  return {
    async getMember(id) {
      return members.get(id) ?? null;
    },
    async join(id, now = new Date(), visitorId = null) {
      const existing = members.get(id);
      if (existing) return existing;
      let code = newReferralCode();
      while (byCode.has(code)) code = newReferralCode();
      const m = { customerId: id, joinedAt: now.toISOString(), referralCode: code, visitorId };
      members.set(id, m);
      byCode.set(code, id);
      return m;
    },
    async leave(id) {
      const m = members.get(id);
      if (!m) return false;
      members.delete(id);
      byCode.delete(m.referralCode);
      return true;
    },
    async memberByCode(code) {
      const id = byCode.get(code);
      return id ? (members.get(id) ?? null) : null;
    },
    async addCoins(entry, now = new Date()) {
      const existing = byRef.get(entry.reference);
      if (existing) return existing;
      if (!Number.isSafeInteger(entry.coins) || entry.coins === 0) throw new Error("Invalid coins");
      if (entry.coins < 0) {
        const total = entries.filter((e) => e.customerId === entry.customerId).reduce((n, e) => n + e.coins, 0);
        if (total + entry.coins < 0) throw new Error("Coins would go negative");
      }
      const created = Object.freeze({ ...entry, id: `hc_${randomBytes(9).toString("hex")}`, createdAt: now.toISOString() });
      entries.push(created);
      byRef.set(entry.reference, created);
      return created;
    },
    async entry(reference) {
      return byRef.get(reference) ?? null;
    },
    async coins(id) {
      return entries.filter((e) => e.customerId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async recordReferral(r, now = new Date()) {
      if (referrals.has(r.orderNumber)) return false;
      referrals.set(r.orderNumber, { ...r, createdAt: now.toISOString() });
      return true;
    },
    async referralFor(orderNumber) {
      return referrals.get(orderNumber) ?? null;
    },
    async referralsBy(referrerId) {
      return [...referrals.values()].filter((r) => r.referrerId === referrerId);
    },
    async erase(id) {
      const m = members.get(id);
      if (m) byCode.delete(m.referralCode);
      members.delete(id);
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].customerId === id) {
          byRef.delete(entries[i].reference);
          entries.splice(i, 1);
        }
      }
    },
  };
}

export function resolveLoyalty(env: Env = process.env): LoyaltyStore {
  if (mockDataAllowed(env)) return devSingleton("loyalty", createMemoryLoyaltyStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Alpha Club");
  };
  return { getMember: fail, join: fail, leave: fail, memberByCode: fail, addCoins: fail, entry: fail, coins: fail, recordReferral: fail, referralFor: fail, referralsBy: fail, erase: fail };
}
