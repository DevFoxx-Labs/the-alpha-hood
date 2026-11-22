"use client";

import { Cancel01Icon, Ticket01Icon } from "@hugeicons/core-free-icons";
import { useId, useState } from "react";
import { useStoreUI } from "@/components/store/store-ui-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { formatINR } from "@/lib/format";

interface Offer {
  code: string;
  description: string;
  ok: boolean;
  saving: number;
  reason: string | null;
}

/** CART-02 coupon field + "View all offers" (eligible coupons with their saving on this bag). */
export function CouponField() {
  const { cart, applyCoupon, removeCoupon, cartBusy } = useStoreUI();
  const id = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [offersOpen, setOffersOpen] = useState(false);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const applied = cart?.pricing.coupon;

  const apply = async (value: string) => {
    setError(null);
    const r = await applyCoupon(value);
    if (!r.ok) setError(r.message ?? "This coupon can't be used.");
    else {
      setCode("");
      setOffersOpen(false);
    }
  };

  const openOffers = async () => {
    setOffersOpen(true);
    try {
      const res = await fetch("/api/cart/coupon", { cache: "no-store" });
      setOffers(res.ok ? ((await res.json()) as { offers: Offer[] }).offers : []);
    } catch {
      setOffers([]);
    }
  };

  return (
    <div>
      {cart?.couponCode ? (
        <div className="flex items-center gap-2 border border-dashed border-accent bg-coupon px-3 py-2.5 text-[13px]">
          <Icon icon={Ticket01Icon} size={17} className="text-accent" />
          <span className="flex-1">
            <b className="text-accent">{cart.couponCode}</b>{" "}
            {applied?.ok ? (
              <span className="tabular">applied · −{formatINR(applied.discount)}</span>
            ) : (
              <span className="text-ink-2">{applied?.reason ?? "not applicable"}</span>
            )}
            {applied?.ok && applied.provisional ? <span className="block text-[11.5px] text-ink-2">Note: {applied.provisional}</span> : null}
          </span>
          <button type="button" onClick={() => removeCoupon()} disabled={cartBusy} aria-label={`Remove coupon ${cart.couponCode}`} className="grid size-7 place-items-center">
            <Icon icon={Cancel01Icon} size={15} />
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void apply(code);
          }}
          className="flex border border-[#cfcfcf] focus-within:border-black"
        >
          <label htmlFor={`${id}-code`} className="sr-only">
            Coupon code
          </label>
          <input
            id={`${id}-code`}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 20))}
            placeholder="Enter coupon code"
            autoComplete="off"
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            className="h-11 min-w-0 flex-1 bg-transparent px-3.5 text-[13px] uppercase tracking-[0.06em] outline-none placeholder:normal-case placeholder:tracking-normal"
          />
          <button type="submit" disabled={cartBusy || !code.trim()} className="px-4 text-[11.5px] font-bold uppercase tracking-[0.12em] text-accent disabled:opacity-40">
            Apply
          </button>
        </form>
      )}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-[12px] text-accent">
          {error}
        </p>
      ) : null}
      <button type="button" onClick={openOffers} className="mt-2 text-[11.5px] font-bold uppercase tracking-[0.1em] underline underline-offset-4">
        View all offers
      </button>

      <Sheet open={offersOpen} onOpenChange={setOffersOpen}>
        <SheetContent side="right" aria-describedby={`${id}-offers-desc`}>
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
            <SheetTitle>Offers for your bag</SheetTitle>
            <button type="button" aria-label="Close" onClick={() => setOffersOpen(false)} className="grid size-10 place-items-center">
              <Icon icon={Cancel01Icon} size={20} />
            </button>
          </div>
          <SheetDescription id={`${id}-offers-desc`} className="sr-only">
            Coupons and what they save on this bag
          </SheetDescription>
          <ul className="flex-1 space-y-3 overflow-y-auto p-4">
            {offers === null ? (
              <li className="text-[13px] text-ink-2">Loading offers…</li>
            ) : offers.length === 0 ? (
              <li className="text-[13px] text-ink-2">No offers right now.</li>
            ) : (
              offers.map((o) => (
                <li key={o.code} className="border border-line p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 border border-dashed border-accent px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-accent">
                      <Icon icon={Ticket01Icon} size={14} />
                      {o.code}
                    </span>
                    {o.ok ? (
                      <Button size="sm" variant="outline" disabled={cartBusy || cart?.couponCode === o.code} onClick={() => apply(o.code)}>
                        {cart?.couponCode === o.code ? "Applied" : "Apply"}
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[13px]">{o.description}</p>
                  {o.ok ? (
                    <p className="mt-1 text-[12.5px] font-semibold text-green">You save {formatINR(o.saving)}</p>
                  ) : null}
                  {o.reason ? <p className="mt-1 text-[12px] text-ink-2">{o.reason}</p> : null}
                </li>
              ))
            )}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
