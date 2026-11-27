"use client";

import { ShoppingBag02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useState } from "react";
import { GarmentArt } from "@/components/store/garment-art";
import { Price } from "@/components/store/price";
import { SizePicker } from "@/components/store/size-picker";
import { useStoreUI } from "@/components/store/store-ui-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { HomeBlock } from "@/lib/cms/types";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/utils";

type Block = Extract<HomeBlock, { type: "product_spotlight" }>;

/**
 * "Exclusive drop" layout: one style, big. Photos of the chosen colour, price (no MRP strike — these are signed
 * pieces, never discounted here), colour swatches that switch the photos and sizes, and Add to bag right here.
 * The bag, stock and price are checked again on the server (the cart and checkout never trust this screen).
 * Server-rendered with the first colour; the swatches / sizes are the client part.
 */
export function ProductSpotlight({ block, products, initial }: { block: Block; products: Product[]; initial: number }) {
  const { addToBag } = useStoreUI();
  const [active, setActive] = useState(initial);
  const [size, setSize] = useState<string | undefined>();
  const [sizeError, setSizeError] = useState(false);
  const [busy, setBusy] = useState(false);
  const product = products[active] ?? products[0];
  if (!product) return null;
  const inStock = product.sizes.filter((s) => s.stock > 0);
  const left = product.sizes.reduce((n, s) => n + Math.max(0, s.stock), 0);
  const photos = product.images.slice(0, 3);

  const add = async () => {
    if (!size) {
      setSizeError(true);
      return;
    }
    setBusy(true);
    try {
      await addToBag(product, size);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id={block.id} aria-labelledby={`${block.id}-h`} className="scroll-mt-20 border-b border-line bg-white">
      <div className={cn("mx-auto grid max-w-[1440px] gap-6 px-4 py-10 lg:grid-cols-[1.25fr_1fr] lg:gap-14 lg:px-10 lg:py-20", block.reverse && "lg:[&>*:first-child]:order-2")}>
        {/* photos: the big one, then two smaller (all of the chosen colour) */}
        <div className="grid grid-cols-2 gap-1.5">
          {photos.map((img, i) => (
            <GarmentArt
              key={`${product.id}-${i}`}
              image={{ ...img, alt: i === 0 ? `${product.title} — ${product.colour.name}` : "" }}
              className={cn("w-full bg-soft", i === 0 ? "col-span-2 aspect-[4/5] lg:aspect-[5/6]" : "aspect-[4/5]")}
              sizes={i === 0 ? "(min-width: 1024px) 55vw, 100vw" : "(min-width: 1024px) 27vw, 50vw"}
            />
          ))}
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-ink-2">{block.lead}</p>
          <h2 id={`${block.id}-h`} className="mt-2 font-display text-[56px] uppercase leading-[0.88] lg:text-[96px]">
            {block.title}
          </h2>
          <p className="mt-3 text-[14px] text-ink-2">{product.title}</p>
          <Price price={product.price} showMrp={false} size="pdp" className="mt-4" />
          <p className="mt-1 text-[12px] text-ink-2">Inclusive of all taxes</p>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-bold uppercase tracking-[0.12em]">
            {block.signedBy ? <span>✍ Hand-signed by {block.signedBy}</span> : null}
            {block.editionSize ? <span>Edition of {block.editionSize.toLocaleString("en-IN")}</span> : null}
            {/* a count above the edition size would contradict it (stock not set to the edition yet) */}
            {left === 0 ? <span className="text-accent">Sold out</span> : !(block.editionSize && left > block.editionSize) ? <span className={left <= 10 ? "text-accent" : undefined}>{left.toLocaleString("en-IN")} left</span> : null}
          </div>

          {products.length > 1 ? (
            <div className="mt-6">
              <p className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.12em]">
                Colour: <span className="font-normal normal-case tracking-normal">{product.colour.name}</span>
              </p>
              <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2.5">
                {products.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={i === active}
                    aria-label={p.colour.name}
                    title={p.colour.name}
                    onClick={() => {
                      setActive(i);
                      setSize(undefined);
                      setSizeError(false);
                    }}
                    className={cn("size-10 border-2 p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink", i === active ? "border-ink" : "border-transparent hover:border-line")}
                  >
                    <span className="block size-full border border-black/10" style={{ backgroundColor: p.colour.hex }} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {inStock.length ? (
            <>
              <SizePicker
                sizes={product.sizes}
                value={size}
                onChange={(s) => {
                  setSize(s);
                  setSizeError(false);
                }}
                className="mt-6"
              />
              {sizeError ? (
                <p role="alert" className="mt-2 text-[12px] font-semibold text-accent">
                  Please select a size
                </p>
              ) : null}
              <Button size="lg" className="mt-5 w-full" loading={busy} onClick={() => void add()}>
                <Icon icon={ShoppingBag02Icon} size={18} />
                {size ? `Add to bag · ${size}` : "Add to bag"}
              </Button>
            </>
          ) : (
            <Button asChild size="lg" variant="outline" className="mt-6 w-full">
              <Link href={`/products/${product.handle}`}>Sold out · Notify me</Link>
            </Button>
          )}

          {block.details.length ? (
            <ul className="mt-6 space-y-2 border-t border-line pt-5 text-[13.5px]">
              {block.details.map((d) => (
                <li key={d} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 bg-ink" />
                  {d}
                </li>
              ))}
            </ul>
          ) : null}
          <Link href={`/products/${product.handle}`} className="mt-5 inline-block text-[12px] font-semibold uppercase tracking-[0.1em] underline underline-offset-4">
            Full details, size guide &amp; reviews
          </Link>
        </div>
      </div>
    </section>
  );
}
