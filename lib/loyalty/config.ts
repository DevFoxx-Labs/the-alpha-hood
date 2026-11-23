import { rupees, type Paise } from "@/lib/format";

/**
 * LOY-01/02 Alpha Club rules. DEMO values — the owner confirms them, and the Terms (Alpha Club section) must
 * stay in sync. 1 Hood Coin = ₹1 of value. Coins are spent at checkout as a tender (lib/wallet/tenders.ts).
 */
export type Tier = "member" | "elite" | "legend";

export const CLUB = {
  /** Coins earned per ₹100 of goods paid, by tier (percent of the goods value). */
  earnPercent: { member: 5, elite: 7, legend: 10 } satisfies Record<Tier, number>,
  /** Rolling 12-month spend (goods value, after refunds) needed for a tier. */
  tierThreshold: { member: 0, elite: rupees(15_000), legend: rupees(40_000) } satisfies Record<Tier, Paise>,
  /** RET-01: Alpha Club members get a longer return window (applies to orders placed as a member). */
  memberReturnWindowDays: 30,
  /** Coins expire this many days after they become available (owner to confirm; shown in Terms). */
  coinExpiryDays: 365,
  referral: {
    /** LOY-02 friend's first-order discount. */
    friendDiscount: rupees(200) as Paise,
    friendMinCart: rupees(999) as Paise,
    /** Coins for the referrer, credited after the friend's return window. */
    referrerCoins: 200,
  },
  /** LOY-03 coins for an approved #WearTheHood photo. */
  ugcCoins: 50,
  perks: {
    member: ["5 Hood Coins per ₹100", "30-day returns", "Early access to drops"],
    elite: ["7 Hood Coins per ₹100", "30-day returns", "Early access to drops", "Free express shipping (coming soon)"],
    legend: ["10 Hood Coins per ₹100", "30-day returns", "First access to every drop", "Priority support (coming soon)"],
  } satisfies Record<Tier, string[]>,
} as const;

export const TIER_LABEL: Record<Tier, string> = { member: "Member", elite: "Elite", legend: "Legend" };

export function tierFor(spend: Paise): Tier {
  if (spend >= CLUB.tierThreshold.legend) return "legend";
  if (spend >= CLUB.tierThreshold.elite) return "elite";
  return "member";
}

/** Coins for a goods value (paise) at a percent: whole coins, rounded down. */
export function coinsFor(goods: Paise, percent: number): number {
  if (!Number.isSafeInteger(goods) || goods <= 0) return 0;
  return Math.floor((goods / 100) * (percent / 100));
}
