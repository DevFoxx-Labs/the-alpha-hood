"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mascot } from "@/components/brand/mascot";
import { ModelFigure } from "@/components/store/garment-art";
import { Price } from "@/components/store/price";
import { SectionHeader } from "@/components/store/section-header";
import { useStoreUI } from "@/components/store/store-ui-provider";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/commerce/types";
import type { Look } from "@/lib/promotions/looks";
import { cn } from "@/lib/utils";

const gutter = "mx-auto max-w-[1440px] px-4 lg:px-10";

/**
 * HOME-07 / PROMO-05 Shop the Look: placeholder look art with numbered hotspots, the item list with a size per
 * item, and "Add full look". The −10% is applied by the server (priceCart) only when every item is in the bag.
 */
export function ShopTheLook({ look, products, lead, title }: { look: Look; products: Product[]; lead: string; title: string }) {
  const { addToBag } = useStoreUI();
  const [sizes, setSizes] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, p.sizes.length === 1 ? p.sizes[0].label : ""])),
  );
  const [active, setActive] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const missing = products.filter((p) => !sizes[p.id]);
  const soldOut = products.some((p) => !p.sizes.some((s) => s.stock > 0));

  const addAll = async () => {
    setBusy(true);
    try {
      for (const p of products) if (!(await addToBag(p, sizes[p.id]))) break;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id={`look-${look.id}`} aria-labelledby={`look-${look.id}-h`} className={cn(gutter, "scroll-mt-24 py-8 lg:py-16")}>
      <div id={`look-${look.id}-h`}>
        <SectionHeader lead={lead} title={title} underline />
      </div>
      <div className="mt-6 grid gap-6 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-10">
        <div className="relative aspect-[4/5] overflow-hidden lg:aspect-[5/4]" style={{ backgroundColor: look.placeholder.fill }}>
          {/* Placeholder art until the campaign shoot (DESIGN.md §5) — never the mascot: these are real products. */}
          <ModelFigure {...look.placeholder.look} label="" className="absolute inset-x-0 bottom-0 mx-auto h-[92%] w-[60%]" />
          {look.hotspots.map((h, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Item ${i + 1}: ${products[i]?.title ?? ""}`}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-[12px] font-bold transition-colors",
                active === i ? "bg-white text-black" : "bg-black text-white",
              )}
              style={{ left: `${h.x}%`, top: `${h.y}%` }}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div>
          <p className="font-display text-[30px] uppercase leading-none lg:text-[40px]">{look.title}</p>
          <p className="mt-2 text-[13px] text-ink-2">Buy every piece together and save {look.percent}% on the look.</p>
          <ol className="mt-5 divide-y divide-line border-y border-line">
            {products.map((p, i) => (
              <li key={p.id} className={cn("flex items-center gap-3 py-3", active === i && "bg-soft")} onMouseEnter={() => setActive(i)}>
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-black text-[12px] font-bold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/products/${p.handle}`} className="line-clamp-1 text-[13.5px] font-medium hover:underline">
                    {p.title}
                  </Link>
                  <Price price={p.price} mrp={p.mrp} size="card" />
                </div>
                {p.sizes.length > 1 ? (
                  <>
                    <label className="sr-only" htmlFor={`look-size-${p.id}`}>
                      Size for {p.title}
                    </label>
                    <select
                      id={`look-size-${p.id}`}
                      value={sizes[p.id]}
                      onChange={(e) => setSizes((s) => ({ ...s, [p.id]: e.target.value }))}
                      className="h-10 border border-line bg-white px-2 text-[13px]"
                    >
                      <option value="">Size</option>
                      {p.sizes.map((s) => (
                        <option key={s.label} value={s.label} disabled={s.stock === 0}>
                          {s.label}
                          {s.stock === 0 ? " (sold out)" : ""}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="text-[12px] text-ink-2">One size</span>
                )}
              </li>
            ))}
          </ol>
          <Button size="lg" className="mt-5 w-full" loading={busy} disabled={missing.length > 0 || soldOut} onClick={addAll}>
            {soldOut ? "Part of this look is sold out" : missing.length ? `Choose ${missing.length} more size${missing.length > 1 ? "s" : ""}` : `Add full look · save ${look.percent}%`}
          </Button>
          <p className="mt-2 text-center text-[12px] text-ink-2">The saving shows in your bag once every piece is in it.</p>
        </div>
      </div>
    </section>
  );
}

/** HOME-09 Alpha Club band: mascot #2 (lean back) + the club card art #24, on black. */
export function ClubBand({ title, text, cta }: { title: string; text: string; cta: { label: string; href: string } }) {
  return (
    <section aria-label={title} className="on-dark overflow-hidden bg-black text-white">
      <div className="mx-auto grid max-w-[1440px] items-center gap-6 px-6 py-10 lg:grid-cols-[260px_1fr_420px] lg:gap-10 lg:px-10 lg:py-14">
        <Mascot name="alpha-02-lean-back" sizes="(min-width: 1024px) 260px, 160px" className="mx-auto w-[150px] lg:w-full" />
        <div className="text-center lg:text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-volt">Members only</p>
          <h2 className="mt-2 font-display text-[52px] uppercase leading-[0.88] lg:text-[96px]">{title}</h2>
          <p className="mx-auto mt-4 max-w-[480px] text-[14px] leading-[1.6] text-white/80 lg:mx-0 lg:text-[16px]">{text}</p>
          <Button asChild variant="on-dark" className="mt-6">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        </div>
        <Mascot name="scene-24-club-card" sizes="420px" blend className="hidden lg:block" />
      </div>
    </section>
  );
}

interface UgcPost {
  id: string;
  displayName: string;
  caption: string;
  photo: string;
}

/**
 * HOME-10 #WearTheHood: approved customer photos only (moderated, with consent). Until there are any, an
 * honest call to share — never placeholder "customer" photos (no fake UGC). Loads after hydration (below fold).
 */
export function UgcGrid({ title, text }: { title: string; text: string }) {
  const [posts, setPosts] = useState<UgcPost[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ugc")
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d: { posts: UgcPost[] }) => !cancelled && setPosts(d.posts))
      .catch(() => !cancelled && setPosts([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <section aria-labelledby="wth-h" className={cn(gutter, "py-8 lg:py-16")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="wth-h" className="font-display text-[34px] uppercase leading-none lg:text-[56px]">
          {title}
        </h2>
        <Link href="/account/wear-the-hood" className="text-[12px] font-semibold uppercase tracking-[0.08em] underline underline-offset-4">
          Share your fit
        </Link>
      </div>
      <p className="mt-2 text-[13px] text-ink-2">{text}</p>
      {posts === null ? (
        <div className="mt-6 grid aspect-[4/1] grid-cols-4 gap-2" aria-hidden="true" />
      ) : posts.length === 0 ? (
        <div className="mt-6 grid items-center gap-6 bg-soft p-6 sm:grid-cols-[200px_1fr] lg:p-10">
          <Mascot name="alpha-09-mirror-selfie" sizes="200px" blend className="mx-auto w-[150px] sm:w-full" />
          <div>
            <p className="font-display text-[28px] uppercase leading-none lg:text-[40px]">Be the first in the grid</p>
            <p className="mt-3 max-w-[460px] text-[14px] text-ink-2">
              Got your order? Post a mirror selfie from your account. Approved photos go up here — and Alpha Club members get 50 Hood Coins.
            </p>
          </div>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-4">
          {posts.map((p) => (
            <li key={p.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- moderated user photo served by our API */}
              <img src={p.photo} alt={`${p.displayName}'s #WearTheHood photo`} loading="lazy" width={400} height={500} className="aspect-[4/5] w-full bg-soft object-cover" />
              <p className="mt-1.5 text-[12px]">
                <b>{p.displayName}</b>
                {p.caption ? <span className="text-ink-2"> · {p.caption}</span> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
