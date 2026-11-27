"use client";

import { Cancel01Icon, DiscountTag01Icon, Notification03Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { ProductGrid } from "@/components/home/product-grid";
import { ProductCard } from "@/components/store/product-card";
import { SectionHeader } from "@/components/store/section-header";
import { showMessageToast } from "@/components/store/toast";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailSignIn } from "@/components/account/email-sign-in";
import { OtpSignIn } from "@/components/account/otp-sign-in";
import type { Product } from "@/lib/commerce/types";
import { useExperiment } from "@/lib/experiments/client";

/**
 * PDP-04 size advice from the signed-in customer's own kept sizes (server computed); nothing for guests.
 * Fetched after the page is interactive, rendered as one line under the size picker (fixed min-height: no CLS).
 */
export function SizeAdvice({ productId, onPick }: { productId: string; onPick: (size: string) => void }) {
  const [advice, setAdvice] = useState<{ size: string; basis: "kept" | "kept_adjusted" } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/account/size-advice?productId=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { advice: typeof advice } | null) => !cancelled && setAdvice(d?.advice ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [productId]);
  if (!advice) return null;
  return (
    <p className="mt-2 text-[12.5px]">
      Your size is probably{" "}
      <button type="button" className="font-bold underline underline-offset-2" onClick={() => onPick(advice.size)}>
        {advice.size}
      </button>{" "}
      <span className="text-ink-2">
        — {advice.basis === "kept" ? "based on what you've kept before" : "adjusted from what you've kept and returned"}.
      </span>
    </p>
  );
}

/**
 * PDP-10 "Notify me" when a sold-out size is back, and "Price drop alert".
 * - Signed in: one tap; we message the verified mobile / email on the account.
 * - Guest: a mobile number or email right here, confirmed with a 6-digit code (so nobody can sign up someone
 *   else's number or email for messages). The code signs them in — a free account is created on first use, with
 *   the Terms / Privacy notice next to the button — and the alert is set on it; they manage it in Account → Alerts.
 * `startRef` lets the Sold out buttons elsewhere on the page start the back-in-stock flow.
 */
type AlertKind = "back_in_stock" | "price_drop";

export function ProductAlerts({
  product,
  soldOutSizes,
  startRef,
}: {
  product: Pick<Product, "id" | "handle">;
  soldOutSizes: string[];
  startRef?: React.RefObject<(() => void) | null>;
}) {
  const router = useRouter();
  const [size, setSize] = useState(soldOutSizes[0] ?? "");
  const [busy, setBusy] = useState<AlertKind | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [guest, setGuest] = useState<{ kind: AlertKind; size: string } | null>(null);
  const [tab, setTab] = useState<"phone" | "email">("phone");
  const [error, setError] = useState<string | null>(null);
  const key = (kind: AlertKind, sz: string) => (kind === "back_in_stock" ? `bis:${sz}` : "price");

  const create = async (kind: AlertKind, sz = size): Promise<void> => {
    setBusy(kind);
    setError(null);
    try {
      await api("/api/account/alerts", { method: "POST", body: { productId: product.id, kind, ...(kind === "back_in_stock" ? { size: sz } : {}) } });
      setDone((d) => ({ ...d, [key(kind, sz)]: true }));
      setGuest(null);
      showMessageToast(kind === "back_in_stock" ? `Done — we'll tell you when ${sz} is back` : "Done — we'll tell you if the price drops");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setGuest({ kind, size: sz }); // not signed in → ask for a mobile number or email
        return;
      }
      const message = e instanceof ApiError ? e.message : "Couldn't set the alert.";
      if (guest) setError(message);
      else showMessageToast(message);
    } finally {
      setBusy(null);
    }
  };

  // "Sold out · Notify me" from the main buttons calls this (an event handler, not an effect).
  useEffect(() => {
    if (!startRef) return;
    startRef.current = () => {
      if (soldOutSizes.length && !done[key("back_in_stock", size)]) void create("back_in_stock");
    };
    return () => {
      startRef.current = null;
    };
  });

  const verified = async () => {
    if (!guest) return;
    router.refresh(); // header / account state now signed in
    await create(guest.kind, guest.size);
  };

  return (
    <div className="mt-3 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        {soldOutSizes.length ? (
          <span className="flex items-center gap-2">
            {soldOutSizes.length > 1 ? (
              <>
                <label className="sr-only" htmlFor={`bis-${product.id}`}>
                  Sold-out size
                </label>
                <select id={`bis-${product.id}`} value={size} onChange={(e) => setSize(e.target.value)} className="h-9 border border-line bg-white px-2">
                  {soldOutSizes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <Button size="sm" variant="outline" loading={busy === "back_in_stock" && !guest} disabled={!!done[key("back_in_stock", size)]} onClick={() => create("back_in_stock")}>
              <Icon icon={Notification03Icon} size={15} />
              {done[key("back_in_stock", size)] ? "We'll notify you" : soldOutSizes.length === 1 ? `Notify me when ${size} is back` : "Notify me"}
            </Button>
          </span>
        ) : null}
        <Button size="sm" variant="ghost" loading={busy === "price_drop" && !guest} disabled={!!done.price} onClick={() => create("price_drop")} className="px-1 underline underline-offset-4">
          <Icon icon={DiscountTag01Icon} size={15} />
          {done.price ? "Price alert set" : "Price drop alert"}
        </Button>
      </div>

      {guest ? (
        <section aria-labelledby={`alert-form-${product.id}`} className="mt-3 border border-ink bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 id={`alert-form-${product.id}`} className="text-[14px] font-bold">
              {guest.kind === "back_in_stock" ? `Get a message when ${guest.size} is back` : "Get a message if the price drops"}
            </h3>
            <button type="button" onClick={() => setGuest(null)} aria-label="Close" className="-m-1 grid size-8 shrink-0 place-items-center text-ink-2 hover:text-ink">
              <Icon icon={Cancel01Icon} size={16} />
            </button>
          </div>
          <p className="mb-3 mt-1 text-[12.5px] text-ink-2">
            Add your mobile number or email. We&apos;ll send a code once to confirm it&apos;s yours, then message you only about this product. You can remove the alert any time in Account → Alerts.
          </p>
          <Tabs value={tab} onValueChange={(v) => setTab(v === "email" ? "email" : "phone")}>
            <TabsList aria-label="Notify me by">
              <TabsTrigger value="phone">Mobile (SMS)</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
            </TabsList>
            <TabsContent value="phone" className="pt-4">
              <OtpSignIn social={false} submitLabel="Send code" onSignedIn={() => void verified()} />
            </TabsContent>
            <TabsContent value="email" className="pt-4">
              <EmailSignIn initialMode="code" compact onSignedIn={() => void verified()} />
            </TabsContent>
          </Tabs>
          {error ? (
            <p role="alert" className="mt-3 text-[13px] font-semibold text-accent">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** ANL-04 demo test: a reassurance line under Add to bag (off until the experiment is enabled). */
export function ExchangeNote({ days }: { days: number }) {
  const variant = useExperiment("pdp_exchange_note");
  if (variant !== "exchange_note") return null;
  return <p className="text-center text-[12px] text-ink-2">Wrong size? Free exchange within {days} days.</p>;
}

const RECENT_KEY = "ah_recent_products";

/**
 * PDP-09 Recently viewed: product ids kept on this device only (localStorage, max 12, listed in the Cookie
 * Policy as necessary/functional — never sent anywhere except to look up public product data).
 */
export function RecentlyViewed({ currentId }: { currentId: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    let ids: string[] = [];
    try {
      ids = (JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown[]).filter((x): x is string => typeof x === "string" && /^[a-z0-9_]{1,64}$/.test(x));
      window.localStorage.setItem(RECENT_KEY, JSON.stringify([currentId, ...ids.filter((x) => x !== currentId)].slice(0, 12)));
    } catch {
      return;
    }
    const others = ids.filter((x) => x !== currentId).slice(0, 4);
    if (others.length === 0) return;
    let cancelled = false;
    fetch(`/api/products/by-ids?ids=${others.join(",")}`)
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d: { products: Product[] }) => !cancelled && setProducts(d.products))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentId]);
  if (!products || products.length === 0) return null;
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-10 lg:px-10" aria-labelledby="recent-h">
      <div id="recent-h">
        <SectionHeader lead="Recently" title="Viewed" />
      </div>
      <ProductGrid className="mt-6">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} listName="Recently viewed" />
        ))}
      </ProductGrid>
    </section>
  );
}

/** PDP-09 server-computed rails: Complete the look (with the look discount note) and You may also like. */
export function PdpRails({ completeLook, similar, look }: { completeLook: Product[]; similar: Product[]; look: { id: string; title: string; percent: number } | null }) {
  return (
    <>
      {completeLook.length ? (
        <section className="mx-auto max-w-[1440px] px-4 py-10 lg:px-10" aria-labelledby="ctl-h">
          <div id="ctl-h" className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeader lead="Complete" title="The look" />
            {look ? (
              <Link href={`/#look-${look.id}`} className="text-[12px] font-semibold uppercase tracking-[0.08em] underline underline-offset-4">
                Buy the full look · {look.percent}% off
              </Link>
            ) : null}
          </div>
          <ProductGrid className="mt-6">
            {completeLook.map((p) => (
              <ProductCard key={p.id} product={p} listName="Complete the look" />
            ))}
          </ProductGrid>
        </section>
      ) : null}
      {similar.length ? (
        <section className="mx-auto max-w-[1440px] px-4 py-10 lg:px-10" aria-labelledby="sim-h">
          <div id="sim-h">
            <SectionHeader lead="You may" title="Also like" />
          </div>
          <div className="scrollbar-none -mx-4 mt-6 flex snap-x gap-2 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-[18px] lg:overflow-visible lg:px-0">
            {similar.slice(0, 8).map((p) => (
              <ProductCard key={p.id} product={p} listName="You may also like" className="w-[44%] shrink-0 snap-start lg:w-auto" />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

export function RailSkeleton() {
  return <Skeleton className="mx-auto h-80 max-w-[1440px]" />;
}
