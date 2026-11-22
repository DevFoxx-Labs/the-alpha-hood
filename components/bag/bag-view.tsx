"use client";

import { FavouriteIcon, ShoppingBag02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { formatDeliveryDate, useDelivery } from "@/components/pdp/use-delivery";
import { FreeShippingBar } from "@/components/store/free-shipping-bar";
import { LineItem } from "@/components/store/mini-cart";
import { useStoreUI } from "@/components/store/store-ui-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { STORE_CONFIG } from "@/lib/config/store";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CouponField } from "./coupon-field";
import { priceRows } from "./price-rows";

/**
 * CART-01/02 bag page (reference/05 bag screen): items with size/qty in place, delivery estimate, remove /
 * move to wishlist, free-shipping progress, combo nudge, coupon + offers, server-computed breakdown, and a
 * fixed bottom total + CHECKOUT on mobile.
 */
export function BagView() {
  const { cart, lines, itemCount, removeLine, toggleWishlist, wishlist, cartBusy } = useStoreUI();
  const delivery = useDelivery();

  if (!cart) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]" aria-busy="true">
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <Icon icon={ShoppingBag02Icon} size={44} strokeWidth={1.2} className="text-muted" />
        <h2 className="font-display text-[32px] uppercase leading-none">Your bag is empty</h2>
        <p className="type-body">Fresh drops are waiting. Add something you&apos;ll actually wear.</p>
        <Button asChild className="mt-2">
          <Link href="/collections/new-in">Shop new in</Link>
        </Button>
      </div>
    );
  }

  const p = cart.pricing;
  const goods = p.sellingTotal - p.automaticDiscount - p.comboDiscount - p.couponDiscount;
  const blocked = lines.some((l) => l.status === "unavailable");
  const nudge = p.comboProgress[0];
  const by = delivery.promise?.serviceable && delivery.promise.standardBy ? formatDeliveryDate(delivery.promise.standardBy) : null;

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px] lg:gap-10">
        <div>
          {cart.hasIssues ? (
            <p role="alert" className="mb-4 border border-accent bg-accent-tint px-4 py-3 text-[13px]">
              Some items changed since you added them — check the notes below.
            </p>
          ) : null}
          <FreeShippingBar subtotal={goods} threshold={STORE_CONFIG.freeShippingThreshold} className="mb-3" />
          {nudge ? (
            <p className="mb-3 bg-soft px-3.5 py-2.5 text-[12.5px]">
              Add {nudge.need} more for <b>{nudge.title.toLowerCase()}</b>.{" "}
              <Link href={`/collections/${nudge.collection}`} className="underline underline-offset-2">
                Shop combo
              </Link>
            </p>
          ) : null}
          <ul className="border-t border-line-2 [&>li]:px-0">
            {lines.map((line) => (
              <LineItem key={line.id} line={line}>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                  {by && line.status !== "unavailable" ? (
                    <span className="text-ink-2">
                      Delivery by <b className="text-green">{by}</b>
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={cartBusy}
                    onClick={async () => {
                      if (!wishlist.has(line.productId)) toggleWishlist(line.productId);
                      await removeLine(line.id);
                    }}
                    className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
                  >
                    <Icon icon={FavouriteIcon} size={14} />
                    Move to wishlist
                  </button>
                </div>
              </LineItem>
            ))}
          </ul>
          {!by ? (
            <p className="mt-3 text-[12px] text-ink-2">Delivery dates appear once you check a pincode on any product, or at checkout.</p>
          ) : null}
        </div>

        <aside aria-label="Price details" className="space-y-4 lg:sticky lg:top-28">
          <div className="border border-line p-4 lg:p-5">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em]">Coupons</h2>
            <CouponField />
          </div>
          <div className="border border-line p-4 lg:p-5">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em]">
              Price details <span className="tabular font-medium text-ink-2">({itemCount} items)</span>
            </h2>
            <dl className="tabular space-y-2 text-[13.5px]">
              {priceRows(p).map((r) => (
                <div key={r.label} className="flex justify-between gap-3">
                  <dt className="text-ink-2">{r.label}</dt>
                  <dd className={cn((r.discount || r.freeLabel) && "text-green")}>
                    {r.freeLabel ?? `${r.discount ? "− " : ""}${formatINR(r.amount)}`}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-black pt-3 text-[15px] font-bold">
                <dt>Total</dt>
                <dd>{formatINR(p.total)}</dd>
              </div>
            </dl>
            {p.savings > 0 ? (
              <p className="mt-3 bg-green-tint px-3 py-2 text-[12.5px] font-semibold text-green">
                You save <span className="tabular">{formatINR(p.savings)}</span> on this order
              </p>
            ) : null}
            <p className="mt-2 text-[11.5px] text-ink-2">Prices include GST. UPI offers and COD fees are shown at checkout.</p>
            <Button asChild size="lg" className="mt-4 hidden w-full lg:flex">
              <Link href={blocked ? "#" : "/checkout"} aria-disabled={blocked} onClick={(e) => blocked && e.preventDefault()}>
                {blocked ? "Remove sold-out items to continue" : "Checkout"}
              </Link>
            </Button>
          </div>
        </aside>
      </div>

      {/* Mobile fixed total + CHECKOUT (above the tab bar) */}
      <div className="fixed inset-x-0 bottom-[calc(64px+max(0px,env(safe-area-inset-bottom)-12px))] z-20 flex items-center gap-3 border-t border-line bg-white px-4 py-2.5 lg:hidden">
        <div className="flex-1">
          <p className="tabular text-[16px] font-bold leading-tight">{formatINR(p.total)}</p>
          {p.savings > 0 ? <p className="tabular text-[11px] font-semibold text-green">Saving {formatINR(p.savings)}</p> : null}
        </div>
        <Button asChild className="w-[180px]">
          <Link href={blocked ? "#" : "/checkout"} aria-disabled={blocked} onClick={(e) => blocked && e.preventDefault()}>
            {blocked ? "Review bag" : "Checkout"}
          </Link>
        </Button>
      </div>
      <div className="h-20 lg:hidden" aria-hidden="true" />
    </>
  );
}
