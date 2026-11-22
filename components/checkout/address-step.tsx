"use client";

import { Add01Icon } from "@hugeicons/core-free-icons";
import { useId, useState } from "react";
import { formatDeliveryDate } from "@/components/pdp/use-delivery";
import { CheckoutStep } from "@/components/store/checkout-blocks";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioDot, RadioGroup } from "@/components/ui/radio-group";
import { type Address, INDIAN_STATES } from "@/lib/checkout/address-types";
import { formatINR } from "@/lib/format";
import type { DeliveryPromise } from "@/lib/shipping";
import { api, ApiError } from "./api";

const field = "flex flex-col gap-1.5";
const label = "text-[12px] font-bold uppercase tracking-[0.06em]";

/** CHK-03 saved addresses + new address (pincode first, auto-fills city/state) + delivery speed. */
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
}: {
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
            <NewAddressForm
              onCancel={addresses.length ? () => setAdding(false) : undefined}
              onSaved={(a) => {
                setAdding(false);
                onSaved(a);
              }}
            />
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

function NewAddressForm({ onSaved, onCancel }: { onSaved: (a: Address) => void; onCancel?: () => void }) {
  const id = useId();
  const [form, setForm] = useState({ pincode: "", name: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", type: "home" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinNote, setPinNote] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Pincode-first: auto-fill city/state and check serviceability.
  const onPincode = async (value: string) => {
    const pin = value.replace(/\D/g, "").slice(0, 6);
    setForm((f) => ({ ...f, pincode: pin }));
    setPinNote(null);
    if (pin.length !== 6) return;
    try {
      const p = await api<DeliveryPromise>(`/api/delivery?pincode=${pin}`);
      if (!p.serviceable) setPinNote("We don't deliver to this pincode yet.");
      else if (p.city && p.state) {
        setForm((f) => ({ ...f, city: f.city || p.city!, state: (INDIAN_STATES as readonly string[]).includes(p.state!) ? p.state! : f.state }));
        setPinNote(`Delivers to ${p.city}, ${p.state}`);
      }
    } catch (e) {
      setPinNote(e instanceof ApiError && e.status === 422 ? "Enter a valid 6-digit pincode." : null);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ address: Address }>("/api/checkout/addresses", { method: "POST", body: form });
      onSaved(r.address);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the address.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} noValidate className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
      <div className={field}>
        <label htmlFor={`${id}-pin`} className={label}>
          Pincode
        </label>
        <Input id={`${id}-pin`} inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.pincode} onChange={(e) => onPincode(e.target.value)} />
        {pinNote ? <p className="text-[12px] text-ink-2">{pinNote}</p> : null}
      </div>
      <div className={field}>
        <label htmlFor={`${id}-name`} className={label}>
          Full name
        </label>
        <Input id={`${id}-name`} autoComplete="name" maxLength={80} value={form.name} onChange={set("name")} />
      </div>
      <div className={`${field} sm:col-span-2`}>
        <label htmlFor={`${id}-l1`} className={label}>
          House / flat no., building, street
        </label>
        <Input id={`${id}-l1`} autoComplete="address-line1" maxLength={120} value={form.line1} onChange={set("line1")} />
      </div>
      <div className={field}>
        <label htmlFor={`${id}-l2`} className={label}>
          Area / locality
        </label>
        <Input id={`${id}-l2`} autoComplete="address-line2" maxLength={120} value={form.line2} onChange={set("line2")} />
      </div>
      <div className={field}>
        <label htmlFor={`${id}-lm`} className={label}>
          Landmark <span className="font-normal normal-case tracking-normal text-ink-2">(helps delivery)</span>
        </label>
        <Input id={`${id}-lm`} maxLength={80} value={form.landmark} onChange={set("landmark")} />
      </div>
      <div className={field}>
        <label htmlFor={`${id}-city`} className={label}>
          City
        </label>
        <Input id={`${id}-city`} autoComplete="address-level2" maxLength={60} value={form.city} onChange={set("city")} />
      </div>
      <div className={field}>
        <label htmlFor={`${id}-state`} className={label}>
          State
        </label>
        <select
          id={`${id}-state`}
          autoComplete="address-level1"
          value={form.state}
          onChange={set("state")}
          className="h-12 border border-input bg-white px-3 text-[14px] outline-none focus-visible:border-black"
        >
          <option value="">Choose…</option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className={field}>
        <label htmlFor={`${id}-phone`} className={label}>
          Phone for delivery
        </label>
        <Input id={`${id}-phone`} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} />
      </div>
      <fieldset className={field}>
        <legend className={`${label} mb-1.5`}>Save as</legend>
        <div className="flex gap-2">
          {(["home", "work", "other"] as const).map((t) => (
            <label key={t} className="flex h-10 cursor-pointer items-center gap-2 border border-line px-3 text-[13px] has-[:checked]:border-black has-[:checked]:font-semibold">
              <input type="radio" name={`${id}-type`} value={t} checked={form.type === t} onChange={() => setForm((f) => ({ ...f, type: t }))} className="accent-black" />
              {t[0].toUpperCase() + t.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-accent sm:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={busy}>
          Save address
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
