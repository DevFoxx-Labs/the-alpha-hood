import { CLUB } from "@/lib/loyalty/config";
import { sumCoins } from "@/lib/loyalty/service";
import type { LoyaltyStore } from "@/lib/loyalty/store";
import type { Paise } from "@/lib/format";
import { type GiftCardStore, giftHash, normaliseGiftCode } from "@/lib/giftcards/store";
import { orderPayable, type Order, type OrderStore, type OrderTenders, type Refund } from "@/lib/orders/store";
import type { StoreCreditLedger } from "./store-credit";

/**
 * CHK-05 / PROMO-06 / LOY-01 wallet tenders: Hood Coins, a gift card and store credit used to pay for an order.
 *
 * Treatment (pending the CA's confirmation, docs/owner-todo.md): all three are **payment instruments**, not
 * discounts — priceCart, the invoice and GST stay on the full total; tenders only reduce what the gateway or the
 * courier collects (`payable`). Switching coins to a discount later would move them into priceCart.
 *
 * Money safety:
 * - the server decides every amount from its own balances (the client only says "use coins: N", "use my credit",
 *   "this gift card code");
 * - debits happen inside the order placement lock, with unique references (`order:<n>:<tender>:hold:<seq>`), so a
 *   retry can't spend twice; a failed placement releases what it took;
 * - released / refunded value goes back to the same instrument (an expired or disabled gift card → store credit);
 * - refunds never exceed what each instrument paid.
 */
export const TENDER_RULES = {
  /** Coins can pay at most this share of the products' value. DEMO — owner to confirm. */
  coinMaxPercent: 20,
} as const;

export interface TenderChoice {
  coins: number;
  useStoreCredit: boolean;
  giftCardCode: string | null;
}

export const NO_TENDERS: TenderChoice = { coins: 0, useStoreCredit: false, giftCardCode: null };

export class TenderError extends Error {
  constructor(
    public readonly code: "invalid_gift_card" | "wallet_changed" | "invalid_input",
    message: string,
    public readonly status = 422,
  ) {
    super(message);
  }
}

export interface TenderDeps {
  loyalty: LoyaltyStore;
  credit: StoreCreditLedger;
  giftCards: GiftCardStore;
}

/** Parses the strict `{ coins?, useStoreCredit?, giftCardCode? }` body part. */
export function parseTenderChoice(raw: unknown): TenderChoice {
  if (raw === undefined || raw === null) return NO_TENDERS;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new TenderError("invalid_input", "Invalid wallet choice.");
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!["coins", "useStoreCredit", "giftCardCode"].includes(k)) throw new TenderError("invalid_input", "Invalid wallet choice.");
  const coins = r.coins === undefined ? 0 : r.coins;
  if (typeof coins !== "number" || !Number.isSafeInteger(coins) || coins < 0 || coins > 1_000_000) throw new TenderError("invalid_input", "Invalid coins.");
  if (r.useStoreCredit !== undefined && typeof r.useStoreCredit !== "boolean") throw new TenderError("invalid_input", "Invalid store credit choice.");
  let giftCardCode: string | null = null;
  if (r.giftCardCode !== undefined && r.giftCardCode !== null && r.giftCardCode !== "") {
    giftCardCode = normaliseGiftCode(r.giftCardCode);
    if (!giftCardCode) throw new TenderError("invalid_gift_card", "This gift card code isn't valid.");
  }
  return { coins, useStoreCredit: r.useStoreCredit === true, giftCardCode };
}

export interface WalletInfo {
  coinsAvailable: number;
  coinsMax: number;
  storeCredit: Paise;
  giftCard: { last4: string; balance: Paise; expiresAt: string } | null;
}

export interface TenderPlan {
  tenders: OrderTenders;
  payable: Paise;
  wallet: WalletInfo;
}

/** Works out which tenders apply and how much is left to pay. No side effects. */
export async function planTenders(
  deps: TenderDeps,
  customerId: string,
  pricing: { total: Paise; goodsTotal: Paise },
  choice: TenderChoice,
  now = new Date(),
): Promise<TenderPlan> {
  const member = await deps.loyalty.getMember(customerId);
  const coinsAvailable = member ? sumCoins(await deps.loyalty.coins(customerId), now).available : 0;
  const coinsMax = Math.min(coinsAvailable, Math.floor((pricing.goodsTotal * TENDER_RULES.coinMaxPercent) / 100 / 100), Math.floor(pricing.total / 100));
  const storeCredit = Math.max(0, await deps.credit.balance(customerId));

  let remaining = pricing.total;
  const coins = Math.min(choice.coins, coinsMax);
  remaining -= coins * 100;

  let giftCard: OrderTenders["giftCard"] = null;
  let giftInfo: WalletInfo["giftCard"] = null;
  if (choice.giftCardCode) {
    const hash = giftHash(choice.giftCardCode);
    const card = await deps.giftCards.get(hash);
    // Same message for unknown, disabled, expired and empty cards (no code enumeration).
    if (!card || card.disabled || Date.parse(card.expiresAt) <= now.getTime()) throw new TenderError("invalid_gift_card", "This gift card can't be used.");
    const balance = await deps.giftCards.balance(hash);
    if (balance <= 0) throw new TenderError("invalid_gift_card", "This gift card can't be used.");
    const amount = Math.min(balance, remaining);
    if (amount > 0) giftCard = { hash, last4: card.last4, amount };
    remaining -= amount;
    giftInfo = { last4: card.last4, balance, expiresAt: card.expiresAt };
  }

  const credit = choice.useStoreCredit ? Math.min(storeCredit, remaining) : 0;
  remaining -= credit;

  const tenders: OrderTenders = { coins, giftCard, storeCredit: credit, total: coins * 100 + (giftCard?.amount ?? 0) + credit };
  return { tenders, payable: remaining, wallet: { coinsAvailable, coinsMax, storeCredit, giftCard: giftInfo } };
}

const ref = (o: Pick<Order, "number">, tender: string, kind: "hold" | "release", seq: number) => `order:${o.number}:${tender}:${kind}:${seq}`;
const DAY = 86_400_000;

/**
 * Debits every tender of the order (all or nothing). Called inside the placement / retry lock. Returns the new
 * hold sequence. On any failure, already-taken tenders are put back and TenderError("wallet_changed") is thrown.
 */
export async function holdTenders(deps: TenderDeps, order: Pick<Order, "number" | "customerId" | "tenders" | "tenderHold">, now = new Date()): Promise<number> {
  const t = order.tenders;
  const seq = (order.tenderHold?.seq ?? 0) + 1;
  if (!t || t.total === 0) return seq;
  const undo: (() => Promise<unknown>)[] = [];
  try {
    if (t.coins > 0) {
      const available = sumCoins(await deps.loyalty.coins(order.customerId), now).available;
      if (available < t.coins) throw new Error("coins");
      await deps.loyalty.addCoins({ customerId: order.customerId, coins: -t.coins, kind: "redeemed", reference: ref(order, "coins", "hold", seq), availableAt: now.toISOString(), expiresAt: null }, now);
      undo.push(() => deps.loyalty.addCoins({ customerId: order.customerId, coins: t.coins, kind: "redeem_release", reference: ref(order, "coins", "release", seq), availableAt: now.toISOString(), expiresAt: new Date(now.getTime() + CLUB.coinExpiryDays * DAY).toISOString() }, now));
    }
    if (t.giftCard) {
      const card = await deps.giftCards.get(t.giftCard.hash);
      if (!card || card.disabled || Date.parse(card.expiresAt) <= now.getTime()) throw new Error("gift");
      await deps.giftCards.add({ hash: t.giftCard.hash, amount: -t.giftCard.amount, reference: ref(order, "gift", "hold", seq) }, now);
      const g = t.giftCard;
      undo.push(() => deps.giftCards.add({ hash: g.hash, amount: g.amount, reference: ref(order, "gift", "release", seq) }, now));
    }
    if (t.storeCredit > 0) {
      await deps.credit.add({ customerId: order.customerId, amount: -t.storeCredit, reason: "spent", reference: ref(order, "credit", "hold", seq) }, now);
    }
  } catch {
    for (const u of undo.reverse()) await u().catch(() => undefined);
    throw new TenderError("wallet_changed", "Your coins, gift card or store credit changed. Please review your payment.", 409);
  }
  return seq;
}

/**
 * Puts the held tenders back (payment failed / expired, order cancelled before shipping). Idempotent per hold:
 * a second call for the same `seq` changes nothing. Gift card value goes back to the card, or to store credit
 * if the card has expired or been disabled since.
 */
export async function releaseTenders(deps: TenderDeps, order: Pick<Order, "number" | "customerId" | "tenders" | "tenderHold">, now = new Date()) {
  const t = order.tenders;
  const hold = order.tenderHold;
  if (!t || t.total === 0 || !hold?.held) return false;
  const seq = hold.seq;
  if (t.coins > 0) {
    await deps.loyalty.addCoins({ customerId: order.customerId, coins: t.coins, kind: "redeem_release", reference: ref(order, "coins", "release", seq), availableAt: now.toISOString(), expiresAt: new Date(now.getTime() + CLUB.coinExpiryDays * DAY).toISOString() }, now);
  }
  if (t.giftCard) await returnToGiftCard(deps, order.customerId, t.giftCard, t.giftCard.amount, ref(order, "gift", "release", seq), now);
  if (t.storeCredit > 0) {
    await deps.credit.add({ customerId: order.customerId, amount: t.storeCredit, reason: "released", reference: ref(order, "credit", "release", seq) }, now);
  }
  return true;
}

async function returnToGiftCard(deps: TenderDeps, customerId: string, g: NonNullable<OrderTenders["giftCard"]>, amount: Paise, reference: string, now: Date) {
  const card = await deps.giftCards.get(g.hash);
  if (card && !card.disabled && Date.parse(card.expiresAt) > now.getTime()) {
    await deps.giftCards.add({ hash: g.hash, amount, reference }, now);
    return "gift_card" as const;
  }
  await deps.credit.add({ customerId, amount, reason: "tender_refund", reference }, now);
  return "store_credit" as const;
}

/** How much of each instrument was already refunded on this order (from its refund records). */
export function tenderRefunded(o: Pick<Order, "refunds">) {
  let coins = 0;
  let wallet = 0;
  for (const r of o.refunds) {
    if (r.to === "coins") coins += r.amount;
    if (r.to === "gift_card" || (r.to === "store_credit" && r.reference.includes(":tender"))) wallet += r.amount;
  }
  return { coins, wallet };
}

export interface RefundSplit {
  source: Paise;
  coins: Paise;
  wallet: Paise;
}

/**
 * Splits a refund of `amount` between the money paid by gateway / at the door and the tenders, in proportion to how
 * the order was paid, never more than each part paid. Coins are whole (100 paise); rounding goes to the cash part.
 */
export function splitRefund(order: Pick<Order, "pricing" | "payable" | "tenders" | "refunds">, amount: Paise, cashRefunded: Paise): RefundSplit {
  const t = order.tenders;
  const total = order.pricing.total;
  if (!t || t.total === 0 || total <= 0) return { source: amount, coins: 0, wallet: 0 };
  const done = tenderRefunded(order);
  const payable = orderPayable(order);
  const coinsPaid = t.coins * 100;
  const walletPaid = (t.giftCard?.amount ?? 0) + t.storeCredit;
  let coins = Math.floor(Math.floor((amount * coinsPaid) / total) / 100) * 100;
  coins = Math.max(0, Math.min(coins, coinsPaid - done.coins));
  let wallet = Math.floor((amount * walletPaid) / total);
  wallet = Math.max(0, Math.min(wallet, walletPaid - done.wallet));
  let source = amount - coins - wallet;
  const sourceLeft = Math.max(0, payable - cashRefunded);
  if (source > sourceLeft) {
    // Cash part exhausted (e.g. earlier refunds): the rest goes back to the wallet instruments, within what they paid.
    const extra = source - sourceLeft;
    source = sourceLeft;
    const w = Math.min(extra, walletPaid - done.wallet - wallet);
    wallet += w;
    const c = Math.floor(Math.min(extra - w, coinsPaid - done.coins - coins) / 100) * 100;
    coins += c;
  }
  return { source, coins, wallet };
}

/** Pays the tender parts of a refund back and returns the Refund records to append (idempotent per reference). */
export async function refundTenders(
  deps: TenderDeps,
  order: Pick<Order, "number" | "customerId" | "tenders">,
  split: Pick<RefundSplit, "coins" | "wallet">,
  reference: string,
  now: Date,
  newId: () => string,
): Promise<Refund[]> {
  const out: Refund[] = [];
  const t = order.tenders;
  if (!t) return out;
  if (split.coins > 0) {
    await deps.loyalty.addCoins(
      { customerId: order.customerId, coins: split.coins / 100, kind: "refund", reference: `${reference}:tender:coins`, availableAt: now.toISOString(), expiresAt: new Date(now.getTime() + CLUB.coinExpiryDays * DAY).toISOString() },
      now,
    );
    out.push({ id: newId(), reference: `${reference}:tender:coins`, amount: split.coins, to: "coins", status: "completed", createdAt: now.toISOString() });
  }
  if (split.wallet > 0) {
    // Gift-card part back to the card first (if still valid), the rest to store credit.
    let left = split.wallet;
    if (t.giftCard) {
      const part = Math.min(left, t.giftCard.amount);
      if (part > 0) {
        const to = await returnToGiftCard(deps, order.customerId, t.giftCard, part, `${reference}:tender:gift`, now);
        out.push({ id: newId(), reference: `${reference}:tender:gift`, amount: part, to, status: "completed", createdAt: now.toISOString() });
        left -= part;
      }
    }
    if (left > 0) {
      await deps.credit.add({ customerId: order.customerId, amount: left, reason: "tender_refund", reference: `${reference}:tender:credit` }, now);
      out.push({ id: newId(), reference: `${reference}:tender:credit`, amount: left, to: "store_credit", status: "completed", createdAt: now.toISOString() });
    }
  }
  return out;
}

export type { OrderStore };
