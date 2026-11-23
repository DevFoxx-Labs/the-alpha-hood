import type { Metadata } from "next";
import Link from "next/link";
import { Mascot } from "@/components/brand/mascot";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import { CLUB, TIER_LABEL, type Tier } from "@/lib/loyalty/config";

export const metadata: Metadata = {
  title: "Alpha Club",
  description: "Free to join: Hood Coins on every order, 30-day returns, early access to drops and rewards for inviting friends.",
  alternates: { canonical: "/alpha-club" },
};

const TIERS: Tier[] = ["member", "elite", "legend"];

/** LOY-01 public Alpha Club page (mascot #2, #24). Rules come from lib/loyalty/config.ts (demo values). */
export default function AlphaClubPage() {
  return (
    <>
      <section className="on-dark overflow-hidden bg-black text-white">
        <div className="mx-auto grid max-w-[1440px] items-end lg:grid-cols-[1fr_440px]">
          <div className="px-4 pb-10 pt-12 lg:px-[72px] lg:py-24">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-volt">Free to join</p>
            <h1 className="mt-3 font-display text-[64px] uppercase leading-[0.86] lg:text-[140px]">Alpha Club</h1>
            <p className="mt-5 max-w-[520px] text-[14px] leading-[1.6] text-white/80 lg:text-[17px]">
              Earn Hood Coins on every order, get 30-day returns and first access to drops. Invite a friend: they get {formatINR(CLUB.referral.friendDiscount)} off,
              you get {CLUB.referral.referrerCoins} coins.
            </p>
            <Button asChild variant="on-dark" size="lg" className="mt-7">
              <Link href="/account/club">Join in your account</Link>
            </Button>
          </div>
          <Mascot name="alpha-02-lean-back" priority sizes="(min-width: 1024px) 440px, 60vw" className="mx-auto w-[60%] max-w-[320px] lg:w-full lg:max-w-none" />
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-12 lg:px-10 lg:py-16" aria-labelledby="tiers-h">
        <h2 id="tiers-h" className="font-display text-[34px] uppercase leading-none lg:text-[56px]">
          Tiers
        </h2>
        <ul className="mt-6 grid gap-3 lg:grid-cols-3 lg:gap-6">
          {TIERS.map((t) => (
            <li key={t} className="border border-line p-6">
              <p className="font-display text-[32px] uppercase leading-none">{TIER_LABEL[t]}</p>
              <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2">
                {CLUB.tierThreshold[t] === 0 ? "When you join" : `${formatINR(CLUB.tierThreshold[t])}+ in 12 months`}
              </p>
              <ul className="mt-4 space-y-1.5 text-[13.5px]">
                {CLUB.perks[t].map((p) => (
                  <li key={p}>✓ {p}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto grid max-w-[1440px] items-center gap-8 px-4 pb-16 lg:grid-cols-[1fr_480px] lg:px-10" aria-labelledby="how-h">
        <div>
          <h2 id="how-h" className="font-display text-[34px] uppercase leading-none lg:text-[56px]">
            How coins work
          </h2>
          <ul className="mt-5 max-w-[620px] list-disc space-y-2 pl-5 text-[14px] leading-[1.6]">
            <li>1 Hood Coin = ₹1. You earn on the amount you pay for products (not shipping or fees), once the order is delivered.</li>
            <li>Coins become usable after the return window ends; returned items take their coins back.</li>
            <li>Coins expire {CLUB.coinExpiryDays} days after they become usable. Using coins at checkout is coming soon.</li>
            <li>
              Leaving the club forfeits unused coins. Full rules in the{" "}
              <Link href="/legal/terms#alpha-club" className="underline underline-offset-2">
                Terms
              </Link>
              .
            </li>
          </ul>
        </div>
        <Mascot name="scene-24-club-card" sizes="(min-width: 1024px) 480px, 90vw" blend />
      </section>
    </>
  );
}
