import type { ConsentLedger, ConsentRecord } from "@/lib/consent/ledger";
import { resolveLedger } from "@/lib/consent/ledger";
import type { ServicePurpose } from "@/lib/consent/purposes";
import { nextStatus, type RequestContext } from "@/lib/consent/service";
import type { Customer } from "@/lib/customers/store";
import type { Paise } from "@/lib/format";
import { noticeVersion } from "@/lib/legal";
import type { Order, OrderStore } from "@/lib/orders/store";
import type { Coupon } from "@/lib/promotions/coupons";
import { windowDaysFor } from "@/lib/returns/rules";
import { CLUB, coinsFor, type Tier, TIER_LABEL, tierFor } from "./config";
import { type CoinEntry, type LoyaltyStore, REFERRAL_CODE_RE, resolveLoyalty } from "./store";

/**
 * Alpha Club (LOY-01/02/03): the one service for every Club rule — joining (consent), earning and reversing
 * Hood Coins, tiers, referral discounts and referral rewards. Used by checkout, the order lifecycle, returns,
 * UGC moderation, the account dashboard and admin.
 */
const DAY = 86_400_000;

export class LoyaltyError extends Error {
  constructor(
    public readonly code: "not_member" | "already_member" | "consent_required" | "referral_invalid",
    message: string,
    public readonly status = 422,
  ) {
    super(message);
  }
}

function latest(rows: ConsentRecord[], purpose: string) {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].purpose === purpose) return rows[i].status;
  return undefined;
}

/** Records one service-purpose consent change in the ledger (DPDP: specific, timestamped, versioned). */
export async function recordServiceConsent(
  customerId: string,
  purpose: ServicePurpose,
  granted: boolean,
  ctx: RequestContext,
  ledger: ConsentLedger = resolveLedger(),
  now = new Date(),
) {
  const rows = await ledger.listByUser(customerId);
  const prev = latest(rows, purpose);
  if ((prev === "granted") === granted && prev !== undefined) return;
  await ledger.append(
    [
      {
        user_id: customerId,
        visitor_id: null,
        subscriber_id: null,
        purpose,
        status: nextStatus(prev, granted),
        method: "preferences",
        source: ctx.source,
        notice_version: noticeVersion(["terms", "privacy"]),
        ip_address: ctx.ip,
        user_agent: ctx.userAgent,
      },
    ],
    now,
  );
}

export async function hasServiceConsent(customerId: string, purpose: ServicePurpose, ledger: ConsentLedger = resolveLedger()) {
  return latest(await ledger.listByUser(customerId), purpose) === "granted";
}

/** Joining needs an explicit "yes" (the checkbox is never pre-ticked; the server re-checks it). */
export async function joinClub(customerId: string, consent: unknown, ctx: RequestContext & { visitorId?: string | null }, store: LoyaltyStore = resolveLoyalty(), ledger?: ConsentLedger, now = new Date()) {
  if (consent !== true) throw new LoyaltyError("consent_required", "Please tick the box to join the Alpha Club.");
  if (await store.getMember(customerId)) throw new LoyaltyError("already_member", "You're already in the Alpha Club.", 409);
  await recordServiceConsent(customerId, "alpha_club", true, ctx, ledger, now);
  return store.join(customerId, now, ctx.visitorId ?? null);
}

/** Leaving withdraws consent at once: no more earning; coins not yet used are forfeited (Terms). */
export async function leaveClub(customerId: string, ctx: RequestContext, store: LoyaltyStore = resolveLoyalty(), ledger?: ConsentLedger, now = new Date()) {
  if (!(await store.leave(customerId))) throw new LoyaltyError("not_member", "You're not in the Alpha Club.", 409);
  await recordServiceConsent(customerId, "alpha_club", false, ctx, ledger, now);
  const total = sumCoins(await store.coins(customerId), now).total;
  if (total > 0) await store.addCoins({ customerId, coins: -total, kind: "expired", reference: `leave:${customerId}:${now.getTime()}`, availableAt: now.toISOString(), expiresAt: null }, now);
}

/**
 * Coin balances with FIFO lots: every positive entry is a lot (with its own availableAt / expiresAt); every
 * negative entry (spend, reversal, forfeit) is taken from the matching lot first (a return takes back that order's
 * earn), then from the lots that expire soonest. So spent coins never "come back negative" when an old lot expires.
 */
export function sumCoins(entries: CoinEntry[], now = new Date()) {
  const t = now.getTime();
  const lots = entries
    .filter((e) => e.coins > 0)
    .map((e) => ({ ref: e.reference, left: e.coins, availableAt: Date.parse(e.availableAt), expiresAt: e.expiresAt ? Date.parse(e.expiresAt) : Infinity, createdAt: e.createdAt }));
  const negatives = entries.filter((e) => e.coins < 0).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const n of negatives) {
    let need = -n.coins;
    const at = Date.parse(n.createdAt);
    const target = n.reference.startsWith("earn-reverse:") ? `earn:${n.reference.split(":")[1]}` : n.reference.startsWith("referral-reverse:") ? `referral:${n.reference.split(":")[1]}` : null;
    const order = [...lots]
      .filter((l) => l.left > 0 && l.expiresAt > at)
      .sort((a, b) => Number(b.ref === target) - Number(a.ref === target) || a.expiresAt - b.expiresAt || a.availableAt - b.availableAt);
    for (const l of order) {
      if (need === 0) break;
      const take = Math.min(l.left, need);
      l.left -= take;
      need -= take;
    }
  }
  let available = 0;
  let pending = 0;
  let expiringSoon = 0;
  for (const l of lots) {
    if (l.left <= 0 || l.expiresAt <= t) continue;
    if (l.availableAt <= t) {
      available += l.left;
      if (l.expiresAt - t < 30 * DAY) expiringSoon += l.left;
    } else pending += l.left;
  }
  return { available, pending, total: available + pending, expiringSoon };
}

/** Rolling 12-month spend: goods value of delivered orders, minus what was refunded (any method). */
export async function annualSpend(customerId: string, orders: Pick<OrderStore, "listByCustomer">, now = new Date()): Promise<Paise> {
  const since = now.getTime() - 365 * DAY;
  let spend = 0;
  for (const o of await orders.listByCustomer(customerId)) {
    if (!o.deliveredAt || Date.parse(o.deliveredAt) < since) continue;
    const refunded = o.refunds.reduce((n, r) => n + r.amount, 0);
    spend += Math.max(0, o.pricing.goodsTotal - refunded);
  }
  return spend;
}

/** Snapshot stored on an order placed by a member — the return window and earn rate it was bought under. */
export async function clubSnapshot(customerId: string, orders: Pick<OrderStore, "listByCustomer">, store: LoyaltyStore = resolveLoyalty(), now = new Date()) {
  if (!(await store.getMember(customerId))) return null;
  const tier = tierFor(await annualSpend(customerId, orders, now));
  return { tier, earnPercent: CLUB.earnPercent[tier], returnWindowDays: CLUB.memberReturnWindowDays };
}

export const returnWindowDays = windowDaysFor;

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString();

/** On delivery: earn coins (pending until the return window ends) and the referrer's reward. Idempotent. */
export async function onDelivered(order: Order, store: LoyaltyStore = resolveLoyalty()) {
  if (!order.deliveredAt) return;
  const availableAt = addDays(order.deliveredAt, returnWindowDays(order));
  const expiresAt = addDays(availableAt, CLUB.coinExpiryDays);
  if (order.club) {
    // "% of the paid amount": value paid with Hood Coins doesn't earn new coins (no coin-on-coin loop).
    const earnBase = Math.max(0, order.pricing.goodsTotal - (order.tenders?.coins ?? 0) * 100);
    const coins = coinsFor(earnBase, order.club.earnPercent);
    if (coins > 0) await store.addCoins({ customerId: order.customerId, coins, kind: "earn", reference: `earn:${order.number}`, availableAt, expiresAt });
  }
  const ref = await store.referralFor(order.number);
  if (ref && (await store.getMember(ref.referrerId))) {
    await store.addCoins({ customerId: ref.referrerId, coins: CLUB.referral.referrerCoins, kind: "referral", reference: `referral:${order.number}`, availableAt, expiresAt });
  }
}

/**
 * After a return passes QC: take back the coins earned on the returned value (same availability as the earn,
 * so pending coins net off) — never more than was earned. A fully returned order also cancels the referral reward.
 */
export async function onReturnSettled(order: Order, returnNumber: string, returnedValue: Paise, fullyReturned: boolean, store: LoyaltyStore = resolveLoyalty()) {
  const earn = await store.entry(`earn:${order.number}`);
  if (earn && order.club) {
    const already = (await store.coins(order.customerId))
      .filter((e) => e.kind === "earn_reversal" && e.reference.startsWith(`earn-reverse:${order.number}:`))
      .reduce((n, e) => n - e.coins, 0);
    const take = Math.min(coinsFor(returnedValue, order.club.earnPercent), earn.coins - already);
    if (take > 0) {
      await store.addCoins({ customerId: order.customerId, coins: -take, kind: "earn_reversal", reference: `earn-reverse:${order.number}:${returnNumber}`, availableAt: earn.availableAt, expiresAt: null });
    }
  }
  if (fullyReturned) {
    const reward = await store.entry(`referral:${order.number}`);
    if (reward) {
      await store
        .addCoins({ customerId: reward.customerId, coins: -reward.coins, kind: "referral_reversal", reference: `referral-reverse:${order.number}`, availableAt: reward.availableAt, expiresAt: null })
        .catch(() => undefined); // already spent/forfeited → nothing left to take back
    }
  }
}

/** LOY-03: coins for an approved #WearTheHood photo (members only; once per photo). */
export async function rewardUgc(customerId: string, ugcId: string, store: LoyaltyStore = resolveLoyalty(), now = new Date()) {
  if (!(await store.getMember(customerId))) return null;
  return store.addCoins({ customerId, coins: CLUB.ugcCoins, kind: "ugc", reference: `ugc:${ugcId}`, availableAt: now.toISOString(), expiresAt: addDays(now.toISOString(), CLUB.coinExpiryDays) }, now);
}

// ── Referral (LOY-02) ─────────────────────────────────────────────────────────────────────────────

export interface ReferralCoupon extends Coupon {
  referrerId: string;
}

/** A member's referral code works like a first-order coupon for a friend (evaluated by the coupon engine). */
export async function referralCoupon(code: string, store: LoyaltyStore = resolveLoyalty()): Promise<ReferralCoupon | null> {
  if (!REFERRAL_CODE_RE.test(code)) return null;
  const m = await store.memberByCode(code).catch(() => null);
  if (!m) return null;
  return {
    code,
    kind: "flat",
    value: CLUB.referral.friendDiscount,
    minCart: CLUB.referral.friendMinCart,
    firstOrderOnly: true,
    perCustomerLimit: 1,
    excludeComboItems: false,
    description: `₹${CLUB.referral.friendDiscount / 100} off your first order — a friend's Alpha Club invite`,
    referrerId: m.customerId,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const addressKey = (a: { line1: string; pincode: string }) => `${a.pincode}:${norm(a.line1)}`;

/**
 * Fraud checks before a referral discount is honoured: not your own code, and the friend isn't the referrer
 * under another account (same phone, a shared delivery address, or the same browser/visitor id).
 */
export async function checkReferral(
  coupon: ReferralCoupon,
  friend: Customer,
  shipTo: { line1: string; pincode: string },
  getCustomer: (id: string) => Promise<Customer | null>,
  friendVisitorId: string | null = null,
  store: LoyaltyStore = resolveLoyalty(),
): Promise<string | null> {
  if (coupon.referrerId === friend.id) return "You can't use your own invite code.";
  const referrer = await getCustomer(coupon.referrerId);
  if (!referrer) return "This invite code isn't valid.";
  if (referrer.phone === friend.phone) return "This invite code can't be used on this account.";
  if (referrer.addresses.some((a) => addressKey(a) === addressKey(shipTo))) return "This invite code can't be used for this address.";
  const member = await store.getMember(coupon.referrerId);
  if (friendVisitorId && member?.visitorId && member.visitorId === friendVisitorId) return "This invite code can't be used on this device.";
  return null;
}

// ── Dashboard (ACC-03) ────────────────────────────────────────────────────────────────────────────

export async function clubDashboard(customerId: string, orders: Pick<OrderStore, "listByCustomer">, store: LoyaltyStore = resolveLoyalty(), now = new Date()) {
  const member = await store.getMember(customerId);
  if (!member) return { member: false as const };
  const spend = await annualSpend(customerId, orders, now);
  const tier: Tier = tierFor(spend);
  const next: Tier | null = tier === "member" ? "elite" : tier === "elite" ? "legend" : null;
  const entries = await store.coins(customerId);
  const referrals = await store.referralsBy(customerId);
  return {
    member: true as const,
    joinedAt: member.joinedAt,
    tier,
    tierLabel: TIER_LABEL[tier],
    perks: CLUB.perks[tier],
    spend,
    next: next ? { tier: next, label: TIER_LABEL[next], remaining: Math.max(0, CLUB.tierThreshold[next] - spend) } : null,
    coins: sumCoins(entries, now),
    history: entries.slice(0, 50).map((e) => ({ coins: e.coins, kind: e.kind, createdAt: e.createdAt, availableAt: e.availableAt, expiresAt: e.expiresAt })),
    referralCode: member.referralCode,
    referrals: referrals.length,
  };
}
