import { type GiftCard, type GiftCardStore, GIFT_CARD_RULES, giftHash, newGiftCode } from "@/lib/giftcards/store";
import { type CoinEntry, type CoinKind, type LoyaltyStore, type Membership, newReferralCode, type ReferralRecord } from "@/lib/loyalty/store";
import type { CreditEntry, StoreCreditLedger } from "@/lib/wallet/store-credit";
import type { MongoConn } from "../mongo";
import { isMongoDuplicate } from "../mongo";
import { LedgerFloorError, type Primitives } from "../primitives";
import { isUniqueViolation, type SqlDb, toBool, toIso } from "../sql";

/**
 * Wallet stores on the own backend. The money itself lives in the shared ledger primitive (append-only,
 * UNIQUE references, balances that can't go negative); this file maps each wallet onto it and keeps the small
 * side tables (Alpha Club members / referrals, gift card records) per engine.
 */

// ── Store credit ─────────────────────────────────────────────────────────────────────────────────

export function createDbCreditLedger(p: Primitives): StoreCreditLedger {
  const toCredit = (e: { id: string; owner: string; amount: number; reference: string; meta: Record<string, unknown>; createdAt: string }): CreditEntry =>
    Object.freeze({ id: e.id, customerId: e.owner, amount: e.amount, reason: e.meta.reason as CreditEntry["reason"], reference: e.reference, createdAt: e.createdAt });
  return {
    async add(entry, now = new Date()) {
      try {
        return toCredit(await p.ledger.add({ ledger: "credit", owner: entry.customerId, amount: entry.amount, reference: entry.reference, meta: { reason: entry.reason } }, now));
      } catch (e) {
        if (e instanceof LedgerFloorError) throw new Error("Insufficient store credit");
        throw e;
      }
    },
    balance: (customerId) => p.ledger.balance("credit", customerId),
    async history(customerId) {
      return (await p.ledger.entries("credit", customerId)).map(toCredit).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

// ── Alpha Club (members + referrals per engine; coins on the ledger) ────────────────────────────

interface ClubTables {
  getMember(id: string): Promise<Membership | null>;
  insertMember(m: Membership): Promise<"ok" | "duplicate_id" | "duplicate_code">;
  deleteMember(id: string): Promise<boolean>;
  memberByCode(code: string): Promise<Membership | null>;
  insertReferral(r: ReferralRecord): Promise<boolean>;
  referralFor(orderNumber: string): Promise<ReferralRecord | null>;
  referralsBy(referrerId: string): Promise<ReferralRecord[]>;
}

function clubStore(p: Primitives, t: ClubTables): LoyaltyStore {
  const toCoin = (e: { id: string; owner: string; amount: number; reference: string; meta: Record<string, unknown>; createdAt: string }): CoinEntry =>
    Object.freeze({
      id: e.id,
      customerId: e.owner,
      coins: e.amount,
      kind: e.meta.kind as CoinKind,
      reference: e.reference,
      createdAt: e.createdAt,
      availableAt: e.meta.availableAt as string,
      expiresAt: (e.meta.expiresAt as string | null) ?? null,
    });
  return {
    getMember: (id) => t.getMember(id),
    async join(id, now = new Date(), visitorId = null) {
      for (let i = 0; i < 5; i++) {
        const existing = await t.getMember(id);
        if (existing) return existing;
        const m: Membership = { customerId: id, joinedAt: now.toISOString(), referralCode: newReferralCode(), visitorId };
        const r = await t.insertMember(m);
        if (r === "ok") return m;
        if (r === "duplicate_id") return (await t.getMember(id))!; // joined concurrently
        // duplicate referral code (1 in 32^6): try another code
      }
      throw new Error("Could not allocate a referral code");
    },
    leave: (id) => t.deleteMember(id),
    memberByCode: (code) => t.memberByCode(code),
    async addCoins(entry, now = new Date()) {
      try {
        return toCoin(
          await p.ledger.add(
            { ledger: "coins", owner: entry.customerId, amount: entry.coins, reference: entry.reference, meta: { kind: entry.kind, availableAt: entry.availableAt, expiresAt: entry.expiresAt } },
            now,
          ),
        );
      } catch (e) {
        if (e instanceof LedgerFloorError) throw new Error("Coins would go negative");
        throw e;
      }
    },
    async entry(reference) {
      const e = await p.ledger.byReference("coins", reference);
      return e ? toCoin(e) : null;
    },
    async coins(id) {
      return (await p.ledger.entries("coins", id)).map(toCoin).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async recordReferral(r, now = new Date()) {
      return t.insertReferral({ ...r, createdAt: now.toISOString() });
    },
    referralFor: (n) => t.referralFor(n),
    referralsBy: (id) => t.referralsBy(id),
    async erase(id) {
      await t.deleteMember(id);
      await p.ledger.eraseOwner("coins", id);
    },
  };
}

export function createSqlLoyaltyStore(db: SqlDb, p: Primitives): LoyaltyStore {
  const toMember = (r: { customer_id: string; joined_at: Date; referral_code: string; visitor_id: string | null }): Membership => ({ customerId: r.customer_id, joinedAt: toIso(r.joined_at), referralCode: r.referral_code, visitorId: r.visitor_id });
  const toRef = (r: { order_number: string; code: string; referrer_id: string; friend_id: string; created_at: Date }): ReferralRecord => ({ orderNumber: r.order_number, code: r.code, referrerId: r.referrer_id, friendId: r.friend_id, createdAt: toIso(r.created_at) });
  return clubStore(p, {
    async getMember(id) {
      const r = await db.selectFrom("loyalty_members").selectAll().where("customer_id", "=", id).executeTakeFirst();
      return r ? toMember(r) : null;
    },
    async insertMember(m) {
      try {
        await db.insertInto("loyalty_members").values({ customer_id: m.customerId, joined_at: new Date(m.joinedAt), referral_code: m.referralCode, visitor_id: m.visitorId }).execute();
        return "ok";
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        return (await db.selectFrom("loyalty_members").select("customer_id").where("customer_id", "=", m.customerId).executeTakeFirst()) ? "duplicate_id" : "duplicate_code";
      }
    },
    async deleteMember(id) {
      const r = await db.deleteFrom("loyalty_members").where("customer_id", "=", id).executeTakeFirst();
      return Number(r.numDeletedRows) > 0;
    },
    async memberByCode(code) {
      const r = await db.selectFrom("loyalty_members").selectAll().where("referral_code", "=", code).executeTakeFirst();
      return r ? toMember(r) : null;
    },
    async insertReferral(r) {
      try {
        await db.insertInto("loyalty_referrals").values({ order_number: r.orderNumber, code: r.code, referrer_id: r.referrerId, friend_id: r.friendId, created_at: new Date(r.createdAt) }).execute();
        return true;
      } catch (e) {
        if (isUniqueViolation(e)) return false;
        throw e;
      }
    },
    async referralFor(n) {
      const r = await db.selectFrom("loyalty_referrals").selectAll().where("order_number", "=", n).executeTakeFirst();
      return r ? toRef(r) : null;
    },
    async referralsBy(id) {
      return (await db.selectFrom("loyalty_referrals").selectAll().where("referrer_id", "=", id).execute()).map(toRef);
    },
  });
}

export function createMongoLoyaltyStore(conn: Promise<MongoConn>, p: Primitives): LoyaltyStore {
  type MemberDoc = { _id: string; joined_at: Date; referral_code: string; visitor_id: string | null };
  type RefDoc = { _id: string; code: string; referrer_id: string; friend_id: string; created_at: Date };
  const members = async () => (await conn).db.collection<MemberDoc>("loyalty_members");
  const refs = async () => (await conn).db.collection<RefDoc>("loyalty_referrals");
  const toMember = (d: MemberDoc): Membership => ({ customerId: d._id, joinedAt: toIso(d.joined_at), referralCode: d.referral_code, visitorId: d.visitor_id });
  const toRef = (d: RefDoc): ReferralRecord => ({ orderNumber: d._id, code: d.code, referrerId: d.referrer_id, friendId: d.friend_id, createdAt: toIso(d.created_at) });
  return clubStore(p, {
    async getMember(id) {
      const d = await (await members()).findOne({ _id: id });
      return d ? toMember(d) : null;
    },
    async insertMember(m) {
      try {
        await (await members()).insertOne({ _id: m.customerId, joined_at: new Date(m.joinedAt), referral_code: m.referralCode, visitor_id: m.visitorId });
        return "ok";
      } catch (e) {
        if (!isMongoDuplicate(e)) throw e;
        return (await (await members()).countDocuments({ _id: m.customerId })) ? "duplicate_id" : "duplicate_code";
      }
    },
    async deleteMember(id) {
      return (await (await members()).deleteOne({ _id: id })).deletedCount > 0;
    },
    async memberByCode(code) {
      const d = await (await members()).findOne({ referral_code: code });
      return d ? toMember(d) : null;
    },
    async insertReferral(r) {
      try {
        await (await refs()).insertOne({ _id: r.orderNumber, code: r.code, referrer_id: r.referrerId, friend_id: r.friendId, created_at: new Date(r.createdAt) });
        return true;
      } catch (e) {
        if (isMongoDuplicate(e)) return false;
        throw e;
      }
    },
    async referralFor(n) {
      const d = await (await refs()).findOne({ _id: n });
      return d ? toRef(d) : null;
    },
    async referralsBy(id) {
      return (await (await refs()).find({ referrer_id: id }).toArray()).map(toRef);
    },
  });
}

// ── Gift cards (card records per engine; balances on the ledger) ────────────────────────────────

interface CardTables {
  insert(c: GiftCard): Promise<boolean>;
  remove(hash: string): Promise<void>;
  get(hash: string): Promise<GiftCard | null>;
  list(limit: number): Promise<GiftCard[]>;
  setDisabled(hash: string, disabled: boolean): Promise<boolean>;
}

function giftStore(p: Primitives, t: CardTables): GiftCardStore {
  return {
    async issue({ amount, issuedBy, note }, now = new Date()) {
      if (!Number.isSafeInteger(amount) || amount < GIFT_CARD_RULES.min || amount > GIFT_CARD_RULES.max) throw new Error("Invalid gift card amount");
      for (let i = 0; i < 5; i++) {
        const code = newGiftCode();
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
        if (!(await t.insert(card))) continue; // hash collision (2^-80): new code
        try {
          await p.ledger.add({ ledger: "gift", owner: hash, amount, reference: `issue:${hash}` }, now);
        } catch (e) {
          await t.remove(hash); // never leave a card without its opening balance
          throw e;
        }
        return { code, card };
      }
      throw new Error("Could not issue a gift card");
    },
    get: (hash) => t.get(hash),
    balance: (hash) => p.ledger.balance("gift", hash),
    async add(entry, now = new Date()) {
      if (!(await t.get(entry.hash))) throw new Error("Unknown gift card");
      try {
        const e = await p.ledger.add({ ledger: "gift", owner: entry.hash, amount: entry.amount, reference: entry.reference }, now);
        return Object.freeze({ hash: e.owner, amount: e.amount, reference: e.reference, createdAt: e.createdAt });
      } catch (e) {
        if (e instanceof LedgerFloorError) throw new Error("Insufficient gift card balance");
        throw e;
      }
    },
    async entry(reference) {
      const e = await p.ledger.byReference("gift", reference);
      return e ? Object.freeze({ hash: e.owner, amount: e.amount, reference: e.reference, createdAt: e.createdAt }) : null;
    },
    async list(limit = 200) {
      const cards = await t.list(limit);
      return Promise.all(cards.map(async (c) => ({ ...c, balance: await p.ledger.balance("gift", c.hash) })));
    },
    setDisabled: (hash, disabled) => t.setDisabled(hash, disabled),
  };
}

type CardRow = { hash: string; last4: string; initial: number; issued_at: Date; expires_at: Date; issued_by: string; note: string; disabled: boolean | number };
const cardFromRow = (r: CardRow): GiftCard => ({ hash: r.hash, last4: r.last4, initial: Number(r.initial), issuedAt: toIso(r.issued_at), expiresAt: toIso(r.expires_at), issuedBy: r.issued_by, note: r.note, disabled: toBool(r.disabled) });

export function createSqlGiftCardStore(db: SqlDb, p: Primitives): GiftCardStore {
  return giftStore(p, {
    async insert(c) {
      try {
        await db
          .insertInto("gift_cards")
          .values({ hash: c.hash, last4: c.last4, initial: c.initial, issued_at: new Date(c.issuedAt), expires_at: new Date(c.expiresAt), issued_by: c.issuedBy, note: c.note, disabled: false })
          .execute();
        return true;
      } catch (e) {
        if (isUniqueViolation(e)) return false;
        throw e;
      }
    },
    async remove(hash) {
      await db.deleteFrom("gift_cards").where("hash", "=", hash).execute();
    },
    async get(hash) {
      const r = await db.selectFrom("gift_cards").selectAll().where("hash", "=", hash).executeTakeFirst();
      return r ? cardFromRow(r as CardRow) : null;
    },
    async list(limit) {
      return (await db.selectFrom("gift_cards").selectAll().orderBy("issued_at", "desc").limit(Math.min(limit, 10_000)).execute()).map((r) => cardFromRow(r as CardRow));
    },
    async setDisabled(hash, disabled) {
      const r = await db.updateTable("gift_cards").set({ disabled }).where("hash", "=", hash).executeTakeFirst();
      return Number(r.numUpdatedRows) > 0;
    },
  });
}

export function createMongoGiftCardStore(conn: Promise<MongoConn>, p: Primitives): GiftCardStore {
  type CardDoc = Omit<CardRow, "hash"> & { _id: string; disabled: boolean };
  const col = async () => (await conn).db.collection<CardDoc>("gift_cards");
  const fromDoc = (d: CardDoc): GiftCard => cardFromRow({ ...d, hash: d._id });
  return giftStore(p, {
    async insert(c) {
      try {
        await (await col()).insertOne({ _id: c.hash, last4: c.last4, initial: c.initial, issued_at: new Date(c.issuedAt), expires_at: new Date(c.expiresAt), issued_by: c.issuedBy, note: c.note, disabled: false });
        return true;
      } catch (e) {
        if (isMongoDuplicate(e)) return false;
        throw e;
      }
    },
    async remove(hash) {
      await (await col()).deleteOne({ _id: hash });
    },
    async get(hash) {
      const d = await (await col()).findOne({ _id: hash });
      return d ? fromDoc(d) : null;
    },
    async list(limit) {
      return (await (await col()).find().sort({ issued_at: -1 }).limit(Math.min(limit, 10_000)).toArray()).map(fromDoc);
    },
    async setDisabled(hash, disabled) {
      return (await (await col()).updateOne({ _id: hash }, { $set: { disabled } })).matchedCount > 0;
    },
  });
}
