"use client";

import { Mascot } from "@/components/brand/mascot";
import { ArrowDown01Icon, Cancel01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { Product, SizeOption } from "@/lib/commerce/types";
import { STORE_CONFIG } from "@/lib/config/store";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FreeShippingBar } from "./free-shipping-bar";
import { GarmentArt } from "./garment-art";
import { Price } from "./price";
import { type BagLine, useStoreUI } from "./store-ui-provider";

/**
 * GLB-06 / DESIGN.md §3 MiniCart drawer: right drawer 420 px — "YOUR BAG (n)", free-shipping progress,
 * line items, an upsell row, subtotal, VIEW BAG (outline) + CHECKOUT (black). Lines and amounts come from
 * the server cart (re-validated on open — CART-05).
 */
function InlineSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="relative inline-flex items-center border border-line">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none bg-transparent py-0 pl-2 pr-6 text-[11.5px] font-semibold outline-none disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon icon={ArrowDown01Icon} size={12} className="pointer-events-none absolute right-1.5" />
    </label>
  );
}

export function lineStatusText(line: BagLine): string | null {
  if (line.status === "unavailable") return "Sold out — remove it to continue";
  if (line.status === "quantity_reduced") return `Only ${line.available} left — quantity updated`;
  if (line.status === "price_changed") return `Price changed from ${formatINR(line.previousPrice ?? line.price)}`;
  return null;
}

export function LineItem({ line, onNavigate, children }: { line: BagLine; onNavigate?: () => void; children?: React.ReactNode }) {
  const { updateLine, removeLine, cartBusy } = useStoreUI();
  const sizes: SizeOption[] = line.sizes.length ? line.sizes : [{ label: line.size, stock: 1 }];
  const sizeOptions = sizes.map((s) => ({
    value: s.label,
    label: `Size ${s.label}${s.stock === 0 ? " · sold out" : ""}`,
    disabled: s.stock === 0 && s.label !== line.size,
  }));
  const maxQty = Math.max(1, Math.min(STORE_CONFIG.maxQtyPerSku, line.available || line.quantity));
  const qtyOptions = Array.from({ length: maxQty }, (_, i) => ({ value: String(i + 1), label: `Qty ${i + 1}` }));
  const unavailable = line.status === "unavailable";
  const note = lineStatusText(line);
  const image = <GarmentArt image={line.image} className="h-28" />;

  return (
    <li className={cn("grid grid-cols-[88px_1fr] gap-3 border-b border-line-2 px-4 py-3", unavailable && "opacity-70")}>
      {line.handle ? (
        <Link href={`/products/${line.handle}`} onClick={onNavigate} tabIndex={-1} aria-hidden="true">
          {image}
        </Link>
      ) : (
        image
      )}
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-medium leading-snug">
            {line.handle ? (
              <Link href={`/products/${line.handle}`} onClick={onNavigate} className="hover:underline">
                {line.title}
              </Link>
            ) : (
              line.title
            )}
          </p>
          <button
            type="button"
            onClick={() => removeLine(line.id)}
            disabled={cartBusy}
            aria-label={`Remove ${line.title} from bag`}
            className="-mr-1.5 -mt-1 grid size-8 shrink-0 place-items-center text-ink-2 hover:text-ink"
          >
            <Icon icon={Delete02Icon} size={17} />
          </button>
        </div>
        <Price price={line.price} mrp={line.mrp} size="line" className="mt-1" />
        {note ? (
          <p role="status" className="mt-1.5 text-[11.5px] font-semibold text-accent">
            {note}
          </p>
        ) : null}
        {!unavailable ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <InlineSelect
              label={`Size for ${line.title}`}
              value={line.size}
              options={sizeOptions}
              disabled={cartBusy}
              onChange={(size) => updateLine(line.id, { size })}
            />
            <InlineSelect
              label={`Quantity for ${line.title}`}
              value={String(line.quantity)}
              options={qtyOptions}
              disabled={cartBusy}
              onChange={(q) => updateLine(line.id, { quantity: Number(q) })}
            />
          </div>
        ) : null}
        {children}
      </div>
    </li>
  );
}

export function MiniCart({ upsell = [] }: { upsell?: Product[] }) {
  const { cartOpen, setCartOpen, lines, itemCount, cart } = useStoreUI();
  const pricing = cart?.pricing;
  const goods = pricing ? pricing.sellingTotal - pricing.automaticDiscount - pricing.comboDiscount - pricing.lookDiscount - pricing.couponDiscount : 0;
  const close = () => setCartOpen(false);
  const blocked = lines.some((l) => l.status === "unavailable");
  const nudge = pricing?.comboProgress[0];

  return (
    <Sheet open={cartOpen} onOpenChange={setCartOpen}>
      <SheetContent side="right">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
          <SheetTitle className="text-[13px] font-bold tracking-[0.14em]">
            Your bag <span className="tabular">({itemCount})</span>
          </SheetTitle>
          <SheetClose className="grid size-10 place-items-center" aria-label="Close bag">
            <Icon icon={Cancel01Icon} size={22} />
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">Items in your bag and checkout options</SheetDescription>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            {/* MASCOT_PROMPTS #13 "Sleeping on hoodies" — empty bag. */}
            <Mascot name="alpha-13-sleeping" sizes="260px" className="w-[220px]" />
            <p className="font-display text-[26px] uppercase leading-none">Your bag is empty</p>
            <p className="type-body">Fresh drops are waiting. Add something you&apos;ll actually wear.</p>
            <Button asChild className="mt-2 w-full">
              <Link href="/collections/new-in" onClick={close}>
                Shop new in
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <FreeShippingBar subtotal={goods} threshold={STORE_CONFIG.freeShippingThreshold} className="mx-4 my-3" />
              {nudge ? (
                <p className="mx-4 mb-2 bg-soft px-3 py-2 text-[12px]">
                  Add {nudge.need} more for <b>{nudge.title.toLowerCase()}</b>.{" "}
                  <Link href={`/collections/${nudge.collection}`} onClick={close} className="underline underline-offset-2">
                    Shop combo
                  </Link>
                </p>
              ) : null}
              <ul>
                {lines.map((line) => (
                  <LineItem key={line.id} line={line} onNavigate={close} />
                ))}
              </ul>

              {upsell.length > 0 ? (
                <section aria-labelledby="mini-cart-upsell" className="px-4 py-4">
                  <h3 id="mini-cart-upsell" className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.12em]">
                    Complete your fit
                  </h3>
                  <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
                    {upsell.map((p) => (
                      <li key={p.id} className="w-24 shrink-0">
                        <Link href={`/products/${p.handle}`} onClick={close} className="block">
                          <GarmentArt image={p.images[0]} className="h-[110px]" />
                          <span className="sr-only">{p.title}</span>
                          <span className="tabular mt-1 block text-[11.5px] font-bold">{formatINR(p.price)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-line px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">Subtotal</span>
                <span className="tabular text-[17px] font-bold">{formatINR(goods)}</span>
              </div>
              <p className="-mt-2 mb-3 text-[11.5px] text-muted">
                {pricing && pricing.comboDiscount > 0 ? `Includes combo savings of ${formatINR(pricing.comboDiscount)}. ` : ""}
                Shipping and payment offers are applied at checkout.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline">
                  <Link href="/bag" onClick={close}>
                    View bag
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={blocked ? "/bag" : "/checkout"} onClick={close}>
                    {blocked ? "Review bag" : "Checkout"}
                  </Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
