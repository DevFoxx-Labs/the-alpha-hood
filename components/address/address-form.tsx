"use client";

import { Gps01Icon } from "@hugeicons/core-free-icons";
import dynamic from "next/dynamic";
import { useCallback, useId, useRef, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { type Address, type GeoPoint, INDIAN_STATES } from "@/lib/checkout/address-types";
import type { DeliveryPromise } from "@/lib/shipping/common";

/**
 * The one address form (account address book and checkout). Professional e-commerce fields: who receives it (for
 * me / someone else), name, mobile, alternate mobile, pincode, flat / building, area / street, landmark, city,
 * state, type, delivery instructions, default. Plus a map: "Use my current location" (asks the browser only when
 * tapped) or tap / drag the pin; the area, city, state and pincode are suggested from the pin and stay editable.
 * The pin is saved with the address for the courier; latitude / longitude are never shown as fields.
 */
const AddressMap = dynamic(() => import("./address-map"), {
  ssr: false,
  loading: () => <div className="h-[260px] w-full animate-pulse border border-line bg-soft sm:h-[300px]" aria-hidden="true" />,
});

const field = "flex flex-col gap-1.5";
const label = "text-[12px] font-bold uppercase tracking-[0.06em]";
const optional = <span className="font-normal normal-case tracking-normal text-ink-2">(optional)</span>;

interface Form {
  forSomeoneElse: boolean;
  name: string;
  phone: string;
  alternatePhone: string;
  pincode: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  type: Address["type"];
  instructions: string;
  isDefault: boolean;
  location: GeoPoint | null;
}

const fromAddress = (a: Address | null, self: { name: string; phone: string }): Form => ({
  forSomeoneElse: a?.forSomeoneElse ?? false,
  name: a?.name ?? self.name,
  phone: (a?.phone ?? "").replace(/^\+91/, ""),
  alternatePhone: (a?.alternatePhone ?? "").replace(/^\+91/, ""),
  pincode: a?.pincode ?? "",
  line1: a?.line1 ?? "",
  line2: a?.line2 ?? "",
  landmark: a?.landmark ?? "",
  city: a?.city ?? "",
  state: a?.state ?? "",
  type: a?.type ?? "home",
  instructions: a?.instructions ?? "",
  isDefault: a?.isDefault ?? false,
  location: a?.location ?? null,
});

export interface AddressFormProps {
  /** Editing an existing address (else a new one). */
  initial?: Address | null;
  /** The signed-in customer, to pre-fill "for me". `phone` is the MASKED sign-in number, shown as a hint only. */
  self: { name: string; phone: string };
  /** POST to create; PATCH to edit. */
  endpoint: { method: "POST" | "PATCH"; url: string };
  onSaved: (a: Address) => void;
  onCancel?: () => void;
  submitLabel?: string;
  /** Offer "make this my default" (the address book; not needed at checkout). */
  showDefault?: boolean;
}

export function AddressForm({ initial = null, self, endpoint, onSaved, onCancel, submitLabel = "Save address", showDefault = true }: AddressFormProps) {
  const id = useId();
  const [form, setForm] = useState<Form>(() => fromAddress(initial, self));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinNote, setPinNote] = useState<string | null>(null);
  const [mapNote, setMapNote] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [focus, setFocus] = useState<GeoPoint | null>(null);
  const [showMap, setShowMap] = useState(!!initial?.location);
  const lookup = useRef(0);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const text = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set({ [k]: e.target.value } as Partial<Form>);

  const setFor = (someoneElse: boolean) =>
    setForm((f) => ({
      ...f,
      forSomeoneElse: someoneElse,
      // Switching to "for me" fills in the customer's own name and number; "someone else" clears them.
      ...(someoneElse
        ? { name: f.name === self.name ? "" : f.name }
        : { name: f.name || self.name }),
    }));

  // Pincode: serviceability, city / state, and where to centre the map.
  const onPincode = async (value: string) => {
    const pin = value.replace(/\D/g, "").slice(0, 6);
    set({ pincode: pin });
    setPinNote(null);
    if (pin.length !== 6) return;
    try {
      const p = await api<DeliveryPromise>(`/api/delivery?pincode=${pin}`);
      if (!p.serviceable) setPinNote("We don't deliver to this pincode yet.");
      else if (p.city && p.state) {
        setForm((f) => ({ ...f, city: f.city || p.city!, state: (INDIAN_STATES as readonly string[]).includes(p.state!) ? f.state || p.state! : f.state }));
        setPinNote(`Delivers to ${p.city}, ${p.state}`);
      }
    } catch (e) {
      setPinNote(e instanceof ApiError && e.status === 422 ? "Enter a valid 6-digit pincode." : null);
    }
    if (!form.location) api<{ position: GeoPoint | null }>(`/api/geo/pincode?pincode=${pin}`).then((r) => r.position && setFocus(r.position)).catch(() => undefined);
  };

  /** A new pin: suggest area / city / state / pincode from it (only into empty fields, except pincode/city/state when they conflict). */
  const placePin = useCallback(async (p: GeoPoint) => {
    set({ location: p });
    setMapNote("Finding the address for this spot…");
    const n = ++lookup.current;
    try {
      const r = await api<{ suggestion: { pincode: string; city: string; state: string; area: string } | null }>(`/api/geo/reverse?lat=${p.lat.toFixed(6)}&lng=${p.lng.toFixed(6)}`);
      if (n !== lookup.current) return;
      const s = r.suggestion;
      if (!s) return setMapNote("Pin placed. We couldn't read the address here — please type it below.");
      setForm((f) => ({
        ...f,
        line2: f.line2 || s.area,
        city: s.city || f.city,
        state: (INDIAN_STATES as readonly string[]).includes(s.state) ? s.state : f.state,
        pincode: s.pincode || f.pincode,
      }));
      setMapNote("Pin placed — we filled in the area, city, state and pincode. Check them, then add your flat / house no.");
    } catch (e) {
      if (n === lookup.current) setMapNote(e instanceof ApiError && e.status === 422 ? e.message : "Pin placed. Type the address below.");
    }
  }, []);

  const useCurrentLocation = () => {
    setShowMap(true);
    if (!("geolocation" in navigator)) return setMapNote("Your browser can't share its location. Tap the map instead.");
    setLocating(true);
    setMapNote("Asking your browser for your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        if (pos.coords.accuracy > 1_000) setMapNote("Your location is approximate — drag the pin onto your building.");
        void placePin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setLocating(false);
        setMapNote(err.code === err.PERMISSION_DENIED ? "Location access was blocked. Allow it in your browser settings, or tap the map to place the pin." : "Couldn't get your location. Tap the map to place the pin.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, state: form.state, alternatePhone: form.alternatePhone || "", location: form.location };
      const r = await api<{ address: Address }>(endpoint.url, { method: endpoint.method, body });
      onSaved(r.address);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the address.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
      <fieldset className={`${field} sm:col-span-2`}>
        <legend className={`${label} mb-1.5`}>This address is for</legend>
        <div className="flex flex-wrap gap-2">
          {([false, true] as const).map((other) => (
            <label key={String(other)} className="flex h-10 cursor-pointer items-center gap-2 border border-line px-3 text-[13px] has-[:checked]:border-black has-[:checked]:font-semibold">
              <input type="radio" name={`${id}-for`} checked={form.forSomeoneElse === other} onChange={() => setFor(other)} className="accent-black" />
              {other ? "Someone else (gift, family…)" : "Me"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={`${field} sm:col-span-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={label}>Location on the map {optional}</span>
          <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation} loading={locating}>
            <Icon icon={Gps01Icon} size={16} /> Use my current location
          </Button>
        </div>
        {showMap ? (
          <AddressMap value={form.location} focus={focus} onChange={(p) => void placePin(p)} />
        ) : (
          <button type="button" onClick={() => setShowMap(true)} className="flex h-16 items-center justify-center border border-dashed border-ink-2 text-[13px] font-semibold hover:bg-soft">
            Open the map to place a pin on your building
          </button>
        )}
        <p className="text-[12px] text-ink-2" role="status">
          {mapNote ?? "A pin helps the courier find you. Your location is used only for this address, and only when you place a pin."}
        </p>
        {form.location ? (
          <button type="button" onClick={() => (set({ location: null }), setMapNote("Pin removed."))} className="self-start text-[12px] font-semibold underline underline-offset-2">
            Remove pin
          </button>
        ) : null}
      </div>

      <div className={field}>
        <label htmlFor={`${id}-name`} className={label}>
          {form.forSomeoneElse ? "Receiver's full name" : "Full name"}
        </label>
        <Input id={`${id}-name`} autoComplete={form.forSomeoneElse ? "off" : "name"} maxLength={80} value={form.name} onChange={text("name")} />
      </div>
      <div className={field}>
        <label htmlFor={`${id}-phone`} className={label}>
          {form.forSomeoneElse ? "Receiver's mobile" : "Mobile number"}
        </label>
        <Input
          id={`${id}-phone`}
          type="tel"
          inputMode="numeric"
          autoComplete={form.forSomeoneElse ? "off" : "tel-national"}
          maxLength={10}
          value={form.phone}
          placeholder={form.forSomeoneElse ? "10-digit mobile" : self.phone ? `Leave empty to use ${self.phone}` : "10-digit mobile"}
          onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
        />
      </div>
      <div className={field}>
        <label htmlFor={`${id}-alt`} className={label}>
          Alternate mobile {optional}
        </label>
        <Input id={`${id}-alt`} type="tel" inputMode="numeric" autoComplete="off" maxLength={10} value={form.alternatePhone} onChange={(e) => set({ alternatePhone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
      </div>
      <div className={field}>
        <label htmlFor={`${id}-pin`} className={label}>
          Pincode
        </label>
        <Input id={`${id}-pin`} inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.pincode} onChange={(e) => void onPincode(e.target.value)} />
        {pinNote ? <p className="text-[12px] text-ink-2">{pinNote}</p> : null}
      </div>
      <div className={`${field} sm:col-span-2`}>
        <label htmlFor={`${id}-l1`} className={label}>
          Flat / house no., floor, building, apartment
        </label>
        <Input id={`${id}-l1`} autoComplete="address-line1" maxLength={120} value={form.line1} onChange={text("line1")} placeholder="e.g. Flat 302, 3rd floor, Shanti Apartments" />
      </div>
      <div className={`${field} sm:col-span-2`}>
        <label htmlFor={`${id}-l2`} className={label}>
          Area, street, sector, village
        </label>
        <Input id={`${id}-l2`} autoComplete="address-line2" maxLength={120} value={form.line2} onChange={text("line2")} />
      </div>
      <div className={field}>
        <label htmlFor={`${id}-lm`} className={label}>
          Landmark {optional}
        </label>
        <Input id={`${id}-lm`} maxLength={80} value={form.landmark} onChange={text("landmark")} placeholder="e.g. Near City Mall" />
      </div>
      <div className={field}>
        <label htmlFor={`${id}-city`} className={label}>
          Town / city
        </label>
        <Input id={`${id}-city`} autoComplete="address-level2" maxLength={60} value={form.city} onChange={text("city")} />
      </div>
      <div className={field}>
        <label htmlFor={`${id}-state`} className={label}>
          State
        </label>
        <select id={`${id}-state`} autoComplete="address-level1" value={form.state} onChange={text("state")} className="h-12 border border-input bg-white px-3 text-[14px] outline-none focus-visible:border-black">
          <option value="">Choose…</option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className={field}>
        <span className={label}>Country</span>
        <p className="flex h-12 items-center border border-line bg-soft px-3 text-[14px] text-ink-2">India</p>
      </div>
      <div className={`${field} sm:col-span-2`}>
        <label htmlFor={`${id}-ins`} className={label}>
          Delivery instructions {optional}
        </label>
        <textarea
          id={`${id}-ins`}
          rows={2}
          maxLength={200}
          value={form.instructions}
          onChange={text("instructions")}
          placeholder="e.g. Call before delivery · Leave with the security guard"
          className="border border-input bg-white px-3 py-2 text-[14px] outline-none focus-visible:border-black"
        />
      </div>
      <fieldset className={field}>
        <legend className={`${label} mb-1.5`}>Save as</legend>
        <div className="flex flex-wrap gap-2">
          {(["home", "work", "other"] as const).map((t) => (
            <label key={t} className="flex h-10 cursor-pointer items-center gap-2 border border-line px-3 text-[13px] has-[:checked]:border-black has-[:checked]:font-semibold">
              <input type="radio" name={`${id}-type`} value={t} checked={form.type === t} onChange={() => set({ type: t })} className="accent-black" />
              {t[0].toUpperCase() + t.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>
      {showDefault ? (
        <label className="flex cursor-pointer items-center gap-2 self-end text-[13px]">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} className="size-4 accent-black" />
          Make this my default address
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-accent sm:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={busy}>
          {submitLabel}
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
