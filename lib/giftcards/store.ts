import { createHash, randomBytes } from "node:crypto";
import { rupees, type Paise } from "@/lib/format";
import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * PROMO-06 digital gift cards. The code is a bearer secret (whoever has it can spend it), so:
 * - 16 random characters from a 32-symbol alphabet (80 bits) — not guessable; checks are rate-limited too;
 * - only the SHA-256 hash is stored; staff and logs see the last 4 characters only;
 * - every balance change is an append-only ledger entry with a unique reference (no double spend on retries),
 *   and the balance can never go negative.
 * Rules (DEMO — owner + CA to confirm): ₹500–₹10,000, valid 1 year from issue (RBI PPI rules: at least 1 year),
 * redeemable partially, no cash-out. Selling cards online is not built yet — staff issue them (admin).
 */
export const GIFT_CARD_RULES = { min: rupees(500) as Paise, max: rupees(10_000) as Paise, validityDays: 365 } as const;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const GIFT_CODE_RE = /^[A-HJ-NP-Z2-9]{16}$/;

export function newGiftCode(): string {
  return Array.from(randomBytes(16), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Accepts "ABCD-EFGH-…" or lower case; returns null for anything that isn't a well-formed code. */
export function normaliseGiftCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.toUpperCase().replace(/[\s-]/g, "");
  return GIFT_CODE_RE.test(c) ? c : null;
}

export const giftHash = (code: string) => createHash("sha256").update(`ah-gift:${code}`).digest("hex");
export const formatGiftCode = (code: string) => code.replace(/(.{4})(?=.)/g, "$1-");

export interface GiftCard {
  hash: string;
  last4: string;
  initial: Paise;
  issuedAt: string;
  expiresAt: string;
  issuedBy: string;
  note: string;
  disabled: boolean;
}

export interface GiftEntry {
  hash: string;
  amount: Paise;
  reference: string;
  createdAt: string;
}

export interface GiftCardStore {
  issue(input: { amount: Paise; issuedBy: string; note: string }, now?: Date): Promise<{ code: string; card: GiftCard }>;
  get(hash: string): Promise<GiftCard | null>;
  balance(hash: string): Promise<Paise>;
  /** Idempotent per reference; refuses a debit that would make the balance negative. */
  add(entry: Omit<GiftEntry, "createdAt">, now?: Date): Promise<GiftEntry>;
  entry(reference: string): Promise<GiftEntry | null>;
  list(limit?: number): Promise<(GiftCard & { balance: Paise })[]>;
  setDisabled(hash: string, disabled: boolean): Promise<boolean>;
}

export function createMemoryGiftCardStore(): GiftCardStore {
  const cards = new Map<string, GiftCard>();
  const entries: GiftEntry[] = [];
  const byRef = new Map<string, GiftEntry>();
  const balance = (hash: string) => entries.filter((e) => e.hash === hash).reduce((n, e) => n + e.amount, 0);
  return {
    async issue({ amount, issuedBy, note }, now = new Date()) {
      if (!Number.isSafeInteger(amount) || amount < GIFT_CARD_RULES.min || amount > GIFT_CARD_RULES.max) throw new Error("Invalid gift card amount");
      let code = newGiftCode();
      while (cards.has(giftHash(code))) code = newGiftCode();
      const hash = giftHash(code);
      const card: GiftCard = {
        hash,
        last4: code.slice(-4),
        initial: amount,
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + GIFT_CARD_RULES.validityDays * 86_400_000).toISOString(),
        issuedBy,
        note,
        disabled: false,
      };
      cards.set(hash, card);
      const e = { hash, amount, reference: `issue:${hash}`, createdAt: now.toISOString() };
      entries.push(e);
      byRef.set(e.reference, e);
      return { code, card };
    },
    async get(hash) {
      return cards.get(hash) ?? null;
    },
    async balance(hash) {
      return balance(hash);
    },
    async add(entry, now = new Date()) {
      const existing = byRef.get(entry.reference);
      if (existing) return existing;
      if (!cards.has(entry.hash)) throw new Error("Unknown gift card");
      if (!Number.isSafeInteger(entry.amount) || entry.amount === 0) throw new Error("Invalid amount");
      if (balance(entry.hash) + entry.amount < 0) throw new Error("Insufficient gift card balance");
      const e = Object.freeze({ ...entry, createdAt: now.toISOString() });
      entries.push(e);
      byRef.set(entry.reference, e);
      return e;
    },
    async entry(reference) {
      return byRef.get(reference) ?? null;
    },
    async list(limit = 200) {
      return [...cards.values()]
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
        .slice(0, limit)
        .map((c) => ({ ...c, balance: balance(c.hash) }));
    },
    async setDisabled(hash, disabled) {
      const c = cards.get(hash);
      if (!c) return false;
      c.disabled = disabled;
      return true;
    },
  };
}

export function resolveGiftCards(env: Env = process.env): GiftCardStore {
  const db = dbStores(env);
  if (db) return db.giftCards;
  if (mockDataAllowed(env)) return devSingleton("gift_cards", createMemoryGiftCardStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Gift cards");
  };
  return { issue: fail, get: fail, balance: fail, add: fail, entry: fail, list: fail, setDisabled: fail };
}
