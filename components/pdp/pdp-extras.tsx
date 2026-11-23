"use client";

import { DiscountTag01Icon, Notification03Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { ProductGrid } from "@/components/home/product-grid";
import { ProductCard } from "@/components/store/product-card";
import { SectionHeader } from "@/components/store/section-header";
import { showMessageToast } from "@/components/store/toast";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
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
 * PDP-10 "Notify me" for a sold-out size and "Price drop alert". Signed-in only: a guest is sent to sign in
 * (we message the verified phone on file — no new contact data asked here).
 */
export function ProductAlerts({ product, soldOutSizes }: { product: Pick<Product, "id" | "handle">; soldOutSizes: string[] }) {
  const [size, setSize] = useState(soldOutSizes[0] ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  const create = async (kind: "back_in_stock" | "price_drop") => {
    setBusy(kind);
    try {
      await api("/api/account/alerts", { method: "POST", body: { productId: product.id, kind, ...(kind === "back_in_stock" ? { size } : {}) } });
      setDone((d) => ({ ...d, [kind === "back_in_stock" ? `bis:${size}` : "price"]: true }));
      showMessageToast(kind === "back_in_stock" ? `We'll tell you when ${size} is back` : "We'll tell you if the price drops");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        showMessageToast("Sign in to get alerts — then come back to this product.");
        return;
      }
      showMessageToast(e instanceof ApiError ? e.message : "Couldn't set the alert.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
      {soldOutSizes.length ? (
        <span className="flex items-center gap-2">
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
          <Button size="sm" variant="outline" loading={busy === "back_in_stock"} disabled={!!done[`bis:${size}`]} onClick={() => create("back_in_stock")}>
            <Icon icon={Notification03Icon} size={15} />
            {done[`bis:${size}`] ? "We'll notify you" : "Notify me"}
          </Button>
        </span>
      ) : null}
      <Button size="sm" variant="ghost" loading={busy === "price_drop"} disabled={!!done.price} onClick={() => create("price_drop")} className="px-1 underline underline-offset-4">
        <Icon icon={DiscountTag01Icon} size={15} />
        {done.price ? "Price alert set" : "Price drop alert"}
      </Button>
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
