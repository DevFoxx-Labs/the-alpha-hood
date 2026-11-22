"use client";

import { Add01Icon, FavouriteIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { Product } from "@/lib/commerce/types";
import { percentOff } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "./badges";
import { GarmentArt } from "./garment-art";
import { Price } from "./price";
import { LOW_STOCK_AT, SizePicker } from "./size-picker";
import { useStoreUI } from "./store-ui-provider";
import { Swatches } from "./swatches";

/** Ratings chip only with enough reviews to mean something (CARD-01). */
const MIN_REVIEWS_FOR_CHIP = 3;
/** Discount at/above which a red "−N%" badge is shown when there is no merchandising badge. */
const DISCOUNT_BADGE_AT = 30;

export function productState(product: Product) {
  const totalStock = product.sizes.reduce((n, s) => n + s.stock, 0);
  const off = percentOff(product.price, product.mrp);
  return {
    soldOut: totalStock === 0,
    lowStock: totalStock > 0 && totalStock <= LOW_STOCK_AT ? totalStock : 0,
    off,
  };
}

function CardBadge({ product }: { product: Product }) {
  const { soldOut, off } = productState(product);
  if (soldOut) return <Badge tone="grey">Sold out</Badge>;
  if (product.badge === "BESTSELLER") return <Badge tone="red">Bestseller</Badge>;
  if (product.badge === "NEW") return <Badge tone="white">New</Badge>;
  if (off >= DISCOUNT_BADGE_AT) return <Badge tone="red">−{off}%</Badge>;
  return null;
}

/**
 * CARD-01 / CARD-02 / DESIGN.md §3 ProductCard. 3:4 `soft` image well, badge top-left, heart top-right,
 * rating chip bottom-left, name (1 line), price row, swatches, "+" quick add that opens a size sheet.
 * Desktop hover: second image + quick-add sizes along the image bottom.
 */
export function ProductCard({
  product,
  showSwatches = true,
  showMrp = true,
  className,
}: {
  product: Product;
  showSwatches?: boolean;
  showMrp?: boolean;
  className?: string;
}) {
  const { addToBag, wishlist, toggleWishlist } = useStoreUI();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [size, setSize] = useState<string>();
  const { soldOut, lowStock } = productState(product);
  const href = `/products/${product.handle}`;
  const wished = wishlist.has(product.id);
  const [first, second] = product.images;
  const oneSize = product.sizes.length === 1;

  const quickAdd = () => {
    if (oneSize) {
      addToBag(product, product.sizes[0].label);
      return;
    }
    setSize(undefined);
    setSheetOpen(true);
  };

  return (
    <article className={cn("group/card relative min-w-0", className)}>
      <div className="relative">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
          <div className={cn("relative aspect-[3/4] overflow-hidden bg-soft", soldOut && "opacity-60")}>
            <GarmentArt
              image={{ ...first, alt: "" }}
              className={cn(
                "absolute inset-0 transition-[opacity,transform] duration-[400ms] ease-out group-hover/card:scale-[1.04]",
                second && "lg:group-hover/card:opacity-0",
              )}
            />
            {second ? (
              <GarmentArt
                image={{ ...second, alt: "" }}
                className="absolute inset-0 opacity-0 transition-opacity duration-[400ms] ease-out max-lg:hidden lg:group-hover/card:opacity-100"
              />
            ) : null}
          </div>
        </Link>

        <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 flex flex-col items-start gap-1">
          <CardBadge product={product} />
        </div>

        <button
          type="button"
          onClick={() => toggleWishlist(product.id)}
          aria-pressed={wished}
          aria-label={wished ? `Remove ${product.title} from wishlist` : `Add ${product.title} to wishlist`}
          className="absolute right-1.5 top-1.5 z-10 grid size-9 place-items-center"
        >
          <Icon icon={FavouriteIcon} size={19} className={cn(wished && "fill-accent text-accent")} />
        </button>

        {product.rating && product.rating.count >= MIN_REVIEWS_FOR_CHIP ? (
          <span className="tabular absolute bottom-2.5 left-2.5 z-10 inline-flex items-center gap-0.5 bg-white px-1.5 py-[3px] text-[10.5px] font-bold transition-opacity lg:group-hover/card:opacity-0">
            {product.rating.average.toFixed(1)} ★<span className="sr-only"> out of 5, {product.rating.count} reviews</span>
          </span>
        ) : null}

        {!soldOut && !oneSize ? (
          <div className="absolute inset-x-2 bottom-2 z-10 hidden translate-y-1 bg-white/95 p-2 opacity-0 transition-[opacity,transform] duration-200 ease-out group-focus-within/card:translate-y-0 group-focus-within/card:opacity-100 group-hover/card:translate-y-0 group-hover/card:opacity-100 lg:block">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em]">Quick add</p>
            <div className="flex flex-wrap gap-1">
              {product.sizes.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={s.stock === 0}
                  onClick={() => addToBag(product, s.label)}
                  aria-label={`Add size ${s.label} to bag${s.stock === 0 ? " (sold out)" : ""}`}
                  className="h-7 min-w-8 border border-line px-1.5 text-[11px] font-semibold hover:border-black disabled:cursor-not-allowed disabled:text-[#b5b5b5] disabled:line-through"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative pr-8">
        <h3 className="mt-2.5 truncate text-[12px] leading-[1.35] lg:text-[13px]">
          <Link href={href} className="hover:underline">
            {product.title}
          </Link>
        </h3>
        <Price price={product.price} mrp={product.mrp} showMrp={showMrp} className="mt-1" />
        {soldOut ? (
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Sold out</p>
        ) : lowStock ? (
          <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-accent">Only {lowStock} left</p>
        ) : showSwatches && product.colours.length > 1 ? (
          <Swatches colours={product.colours} className="mt-[7px]" />
        ) : null}

        {!soldOut ? (
          <button
            type="button"
            onClick={quickAdd}
            aria-label={`Quick add ${product.title}`}
            className="absolute bottom-0 right-0 grid size-8 place-items-center hover:bg-soft"
          >
            <Icon icon={Add01Icon} size={19} />
          </button>
        ) : null}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="mx-auto w-full max-w-lg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-5">
          <div className="mb-4 flex gap-3">
            <GarmentArt image={first} className="h-20 w-[60px] shrink-0" />
            <div className="min-w-0">
              <SheetTitle className="text-[13px] font-medium normal-case tracking-normal">{product.title}</SheetTitle>
              <Price price={product.price} mrp={product.mrp} className="mt-1" />
              <SheetDescription className="sr-only">Choose a size to add to your bag</SheetDescription>
            </div>
          </div>
          <SizePicker sizes={product.sizes} value={size} onChange={setSize} />
          <Button
            className="mt-5 w-full"
            size="lg"
            disabled={!size}
            onClick={() => {
              if (!size) return;
              addToBag(product, size);
              setSheetOpen(false);
            }}
          >
            {size ? "Add to bag" : "Select a size"}
          </Button>
        </SheetContent>
      </Sheet>
    </article>
  );
}
