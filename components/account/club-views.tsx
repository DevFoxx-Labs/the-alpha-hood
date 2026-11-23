"use client";

import { Copy01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { Mascot } from "@/components/brand/mascot";
import { api, ApiError } from "@/components/checkout/api";
import { showMessageToast } from "@/components/store/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/format";
import { dateLabel } from "./labels";

const box = "border border-line p-5";
const h2 = "mb-3 text-[13px] font-bold uppercase tracking-[0.12em]";

type Dashboard =
  | { member: false }
  | {
      member: true;
      joinedAt: string;
      tier: "member" | "elite" | "legend";
      tierLabel: string;
      perks: string[];
      spend: number;
      next: { tier: string; label: string; remaining: number } | null;
      coins: { available: number; pending: number; total: number; expiringSoon: number };
      history: { coins: number; kind: string; createdAt: string; availableAt: string; expiresAt: string | null }[];
      referralCode: string;
      referrals: number;
    };

const KIND_LABEL: Record<string, string> = {
  earn: "Earned on an order",
  earn_reversal: "Returned items",
  referral: "Friend's first order",
  referral_reversal: "Friend's order returned",
  ugc: "#WearTheHood photo",
  adjustment: "Adjustment",
  expired: "Expired / forfeited",
};

/** ACC-03 Alpha Club dashboard: join (explicit consent), tier, coins (available / pending), referral, leave. */
export function ClubView() {
  const id = useId();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const load = useCallback(() => {
    api<Dashboard>("/api/account/club")
      .then((d) => (setData(d), setError(null)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the Alpha Club."));
  }, []);
  useEffect(() => {
    let cancelled = false;
    api<Dashboard>("/api/account/club")
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Couldn't load the Alpha Club."));
    return () => {
      cancelled = true;
    };
  }, []);

  const act = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      setData(await api<Dashboard>("/api/account/club", { method: "POST", body }));
      showMessageToast(message);
    } catch (e) {
      showMessageToast(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 py-6">
        <p className="text-[14px]">{error}</p>
        <Button variant="outline" onClick={load}>
          Try again
        </Button>
      </div>
    );
  }
  if (!data) return <Skeleton className="h-64 w-full" />;

  if (!data.member) {
    return (
      <section className={`${box} grid items-center gap-6 lg:grid-cols-[1fr_240px]`}>
        <div>
          <h2 className="font-display text-[32px] uppercase leading-none lg:text-[44px]">Join the Alpha Club</h2>
          <p className="mt-3 max-w-[520px] text-[14px] leading-[1.6] text-ink-2">
            Free. Earn Hood Coins on every order, get 30-day returns and early access to drops. Coins become usable once an
            order&apos;s return window ends.{" "}
            <Link href="/alpha-club" className="underline underline-offset-2">
              How it works
            </Link>
          </p>
          <label htmlFor={`${id}-c`} className="mt-5 flex max-w-[560px] items-start gap-3 text-[13px] leading-[1.55]">
            <Checkbox id={`${id}-c`} checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <span>
              I want to join. The Alpha Hood may use my order history and spend to give me Hood Coins, a tier and a referral
              code, as described in the{" "}
              <Link href="/legal/terms#alpha-club" className="underline underline-offset-2">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="underline underline-offset-2">
                Privacy Notice
              </Link>
              . I can leave any time.
            </span>
          </label>
          <Button className="mt-4" loading={busy} disabled={!consent} onClick={() => act({ action: "join", consent: true }, "Welcome to the Alpha Club")}>
            Join for free
          </Button>
        </div>
        <Mascot name="alpha-02-lean-back" sizes="240px" className="mx-auto hidden w-[200px] lg:block" />
      </section>
    );
  }

  const link = typeof window !== "undefined" ? `${window.location.origin}/r/${data.referralCode}` : `/r/${data.referralCode}`;
  return (
    <div className="space-y-5">
      <section className="on-dark grid items-end gap-4 bg-black p-5 text-white lg:grid-cols-[1fr_auto] lg:p-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-volt">Alpha Club · {data.tierLabel}</p>
          <p className="mt-2 font-display text-[56px] leading-none lg:text-[80px]">{data.coins.available}</p>
          <p className="text-[13px] text-white/75">Hood Coins ready to use{data.coins.pending ? ` · ${data.coins.pending} pending (after the return window)` : ""}</p>
          {data.coins.expiringSoon ? <p className="mt-1 text-[12px] text-volt">{data.coins.expiringSoon} coins expire in the next 30 days</p> : null}
          <p className="mt-3 text-[12px] text-white/60">Use them at checkout — up to 20% of an order&apos;s product value.</p>
        </div>
        <Mascot name="scene-24-club-card" sizes="320px" blend className="hidden w-[300px] lg:block" />
      </section>

      <section className={box}>
        <h2 className={h2}>Your tier</h2>
        <p className="text-[14px]">
          <b>{data.tierLabel}</b> · {formatINR(data.spend)} spent in the last 12 months
          {data.next ? ` · ${formatINR(data.next.remaining)} more to ${data.next.label}` : " · top tier"}
        </p>
        <ul className="mt-3 grid gap-1.5 text-[13px] text-ink-2 sm:grid-cols-2">
          {data.perks.map((p) => (
            <li key={p}>✓ {p}</li>
          ))}
        </ul>
      </section>

      <section className={box}>
        <h2 className={h2}>Invite a friend</h2>
        <p className="text-[13px] text-ink-2">
          Your friend gets ₹200 off their first order; you get 200 Hood Coins once their order is delivered and kept.
          {data.referrals ? ` ${data.referrals} friend${data.referrals > 1 ? "s" : ""} joined with your code.` : ""}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="border border-line bg-soft px-3 py-2 text-[14px] font-bold tracking-[0.12em]">{data.referralCode}</code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard?.writeText(link).then(() => showMessageToast("Invite link copied"), () => showMessageToast(link))}
          >
            <Icon icon={Copy01Icon} size={16} /> Copy invite link
          </Button>
        </div>
      </section>

      <section className={box}>
        <h2 className={h2}>Coin history</h2>
        {data.history.length === 0 ? (
          <p className="text-[13px] text-ink-2">No coins yet — they appear when an order is delivered.</p>
        ) : (
          <ul className="divide-y divide-line text-[13px]">
            {data.history.map((h, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span>
                  {KIND_LABEL[h.kind] ?? h.kind}
                  <span className="block text-[12px] text-ink-2">
                    {dateLabel(h.createdAt)}
                    {Date.parse(h.availableAt) > now ? ` · usable from ${dateLabel(h.availableAt)}` : ""}
                  </span>
                </span>
                <span className={`tabular font-semibold ${h.coins < 0 ? "text-accent" : ""}`}>{h.coins > 0 ? `+${h.coins}` : h.coins}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            Leave the Alpha Club
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Leave the Alpha Club?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll stop earning coins at once and your {data.coins.total} Hood Coins (including pending ones) will be forfeited. Returns
            on orders you already placed keep their 30-day window.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => act({ action: "leave" }, "You've left the Alpha Club")}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface AlertRow {
  id: string;
  productId: string;
  size: string | null;
  kind: "back_in_stock" | "price_drop";
  createdAt: string;
  firedAt: string | null;
}

/** PDP-10 the customer's alerts, with remove. */
export function AlertsView() {
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [titles, setTitles] = useState<Record<string, { title: string; handle: string }>>({});
  useEffect(() => {
    let cancelled = false;
    api<{ alerts: AlertRow[] }>("/api/account/alerts")
      .then(async (d) => {
        if (cancelled) return;
        setAlerts(d.alerts);
        const ids = [...new Set(d.alerts.map((a) => a.productId))];
        if (ids.length) {
          const r = await api<{ products: { id: string; title: string; handle: string }[] }>(`/api/products/by-ids?ids=${ids.join(",")}`);
          if (!cancelled) setTitles(Object.fromEntries(r.products.map((p) => [p.id, { title: p.title, handle: p.handle }])));
        }
      })
      .catch(() => !cancelled && setAlerts([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const remove = async (id: string) => {
    try {
      await api(`/api/account/alerts/${id}`, { method: "DELETE", body: {} });
      setAlerts((a) => a?.filter((x) => x.id !== id) ?? null);
      showMessageToast("Alert removed");
    } catch (e) {
      showMessageToast(e instanceof ApiError ? e.message : "Couldn't remove.");
    }
  };

  if (!alerts) return <Skeleton className="h-40 w-full" />;
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Mascot name="alpha-13-sleeping" sizes="260px" className="w-[240px]" />
        <p className="font-display text-[26px] uppercase leading-none">No alerts</p>
        <p className="type-body">On any product, tap &ldquo;Notify me&rdquo; for a sold-out size or &ldquo;Price drop alert&rdquo;.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line border-y border-line">
      {alerts.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-[14px]">
          <span>
            <Link href={titles[a.productId] ? `/products/${titles[a.productId].handle}` : "#"} className="font-semibold hover:underline">
              {titles[a.productId]?.title ?? "Product"}
            </Link>
            <span className="block text-[12.5px] text-ink-2">
              {a.kind === "back_in_stock" ? `Back in stock · size ${a.size}` : "Price drop"} · {a.firedAt ? `sent ${dateLabel(a.firedAt)}` : `set ${dateLabel(a.createdAt)}`}
            </span>
          </span>
          <button type="button" aria-label="Remove alert" onClick={() => remove(a.id)} className="grid size-10 place-items-center text-ink-2 hover:text-ink">
            <Icon icon={Delete02Icon} size={18} />
          </button>
        </li>
      ))}
    </ul>
  );
}
