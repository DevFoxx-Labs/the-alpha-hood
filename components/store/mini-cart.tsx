"use client";

import { ArrowDown01Icon, Cancel01Icon, Delete02Icon, ShoppingBag02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { CartLine, Product, SizeOption } from "@/lib/commerce/types";
import { STORE_CONFIG } from "@/lib/config/store";
import { formatINR } from "@/lib/format";
import { FreeShippingBar } from "./free-shipping-bar";
import { GarmentArt } from "./garment-art";
import { Price } from "./price";
import { useStoreUI } from "./store-ui-provider";

/**
 * GLB-06 / DESIGN.md §3 MiniCart drawer: right drawer 420 px — "YOUR BAG (n)", free-shipping progress,
 * line items, an upsell row, subtotal, VIEW BAG (outline) + CHECKOUT (black).
 */
function InlineSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative inline-flex items-center border border-line">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none bg-transparent py-0 pl-2 pr-6 text-[11.5px] font-semibold outline-none"
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

function LineItem({ line, sizes }: { line: CartLine; sizes?: SizeOption[] }) {
  const { updateLine, removeLine } = useStoreUI();
  const sizeOptions = (sizes ?? [{ label: line.size, stock: 1 }]).map((s) => ({
    value: s.label,
    label: `Size ${s.label}${s.stock === 0 ? " · sold out" : ""}`,
    disabled: s.stock === 0 && s.label !== line.size,
  }));
  const qtyOptions = Array.from({ length: STORE_CONFIG.maxQtyPerSku }, (_, i) => ({
    value: String(i + 1),
    label: `Qty ${i + 1}`,
  }));

  return (
    <li className="grid grid-cols-[88px_1fr] gap-3 border-b border-line-2 px-4 py-3">
      <GarmentArt image={line.image} className="h-28" />
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-medium leading-snug">{line.title}</p>
          <button
            type="button"
            onClick={() => removeLine(line.id)}
            aria-label={`Remove ${line.title} from bag`}
            className="-mr-1.5 -mt-1 grid size-8 shrink-0 place-items-center text-ink-2 hover:text-ink"
          >
            <Icon icon={Delete02Icon} size={17} />
          </button>
        </div>
        <Price price={line.price} mrp={line.mrp} size="line" className="mt-1" />
        <div className="mt-2 flex gap-1.5">
          <InlineSelect
            label={`Size for ${line.title}`}
            value={line.size}
            options={sizeOptions}
            onChange={(size) => updateLine(line.id, { size })}
          />
          <InlineSelect
            label={`Quantity for ${line.title}`}
            value={String(line.quantity)}
            options={qtyOptions}
            onChange={(q) => updateLine(line.id, { quantity: Number(q) })}
          />
        </div>
      </div>
    </li>
  );
}

export function MiniCart({
  sizesByProduct = {},
  upsell = [],
}: {
  sizesByProduct?: Record<string, SizeOption[]>;
  upsell?: Product[];
}) {
  const { cartOpen, setCartOpen, lines, itemCount } = useStoreUI();
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const close = () => setCartOpen(false);

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
            <Icon icon={ShoppingBag02Icon} size={40} strokeWidth={1.2} className="text-muted" />
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
              <FreeShippingBar subtotal={subtotal} threshold={STORE_CONFIG.freeShippingThreshold} className="mx-4 my-3" />
              <ul>
                {lines.map((line) => (
                  <LineItem key={line.id} line={line} sizes={sizesByProduct[line.productId]} />
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
                <span className="tabular text-[17px] font-bold">{formatINR(subtotal)}</span>
              </div>
              <p className="-mt-2 mb-3 text-[11.5px] text-muted">Shipping and coupons are applied at checkout.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline">
                  <Link href="/bag" onClick={close}>
                    View bag
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/checkout" onClick={close}>
                    Checkout
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
