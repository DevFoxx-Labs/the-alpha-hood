"use client";

import { Add01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { formatDeliveryDate } from "@/components/pdp/use-delivery";
import { CheckoutStep } from "@/components/store/checkout-blocks";
import { Icon } from "@/components/ui/icon";
import { RadioCard, RadioDot, RadioGroup } from "@/components/ui/radio-group";
import { AddressForm } from "@/components/address/address-form";
import type { Address } from "@/lib/checkout/address-types";
import { formatINR } from "@/lib/format";
import type { DeliveryPromise } from "@/lib/shipping/common";

/** CHK-03 saved addresses + new address (the shared form with the map) + delivery speed. */
export function AddressStep({
  addresses,
  selected,
  onSelect,
  onSaved,
  promise,
  speed,
  onSpeed,
  shippingFee,
  disabled,
  self,
}: {
  /** The signed-in customer, to pre-fill a new address "for me". */
  self: { name: string; phone: string };
  addresses: Address[];
  selected: string | null;
  onSelect: (id: string) => void;
  onSaved: (address: Address) => void;
  promise: DeliveryPromise | null;
  speed: "standard" | "express";
  onSpeed: (s: "standard" | "express") => void;
  shippingFee: number;
  disabled: boolean;
}) {
  const [adding, setAdding] = useState(addresses.length === 0);
  const showForm = adding || addresses.length === 0;

  return (
    <CheckoutStep number={2} title="Delivery address">
      {disabled ? (
        <p className="text-[13px] text-ink-2">Verify your phone number first.</p>
      ) : (
        <>
          {addresses.length > 0 ? (
            <RadioGroup value={selected ?? ""} onValueChange={onSelect} className="grid-cols-1 sm:grid-cols-2" aria-label="Delivery address">
              {addresses.map((a) => (
                <RadioCard key={a.id} value={a.id}>
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[14px] font-semibold">
                        <span className="truncate">{a.name}</span>
                        <span className="bg-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]">{a.type}</span>
                        {a.isDefault ? <span className="bg-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white">Default</span> : null}
                      </span>
                      <span className="mt-1 block break-words text-[13px] leading-relaxed text-ink-2">
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ""}
                        <br />
                        {a.city}, {a.state} {a.pincode}
                      </span>
                    </span>
                    <RadioDot />
                  </span>
                </RadioCard>
              ))}
            </RadioGroup>
          ) : null}

          {showForm ? (
            <div className="mt-4 border-t border-line pt-4">
              <AddressForm
                self={self}
                endpoint={{ method: "POST", url: "/api/checkout/addresses" }}
                showDefault={false}
                submitLabel="Deliver here"
                onCancel={addresses.length ? () => setAdding(false) : undefined}
                onSaved={(a) => {
                  setAdding(false);
                  onSaved(a);
                }}
              />
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em]">
              <Icon icon={Add01Icon} size={16} />
              Add new address
            </button>
          )}

          {promise ? (
            <>
              <p className="mb-2.5 mt-6 text-[12px] font-bold uppercase tracking-[0.12em]">Delivery speed</p>
              {!promise.serviceable ? (
                <p role="alert" className="text-[13px] font-semibold text-accent">
                  We don&apos;t deliver to {promise.pincode} yet. Choose another address.
                </p>
              ) : (
                <RadioGroup value={speed} onValueChange={(v) => onSpeed(v === "express" ? "express" : "standard")} className="grid-cols-1 sm:grid-cols-2" aria-label="Delivery speed">
                  <RadioCard value="standard">
                    <span className="block text-[14px] font-semibold">Standard · {shippingFee === 0 ? "FREE" : formatINR(shippingFee)}</span>
                    <span className="text-[13px] text-ink-2">{promise.standardBy ? `Arrives ${formatDeliveryDate(promise.standardBy)}` : ""}</span>
                  </RadioCard>
                  {promise.express ? (
                    <RadioCard value="express">
                      <span className="block text-[14px] font-semibold">Express · {formatINR(promise.express.fee)}</span>
                      <span className="text-[13px] text-ink-2">Arrives {formatDeliveryDate(promise.express.by)}</span>
                    </RadioCard>
                  ) : null}
                </RadioGroup>
              )}
            </>
          ) : null}
        </>
      )}
    </CheckoutStep>
  );
}
