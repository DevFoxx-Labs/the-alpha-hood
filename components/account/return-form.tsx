"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { api, ApiError } from "@/components/checkout/api";
import { formatDeliveryDate } from "@/components/pdp/use-delivery";
import { GarmentArt } from "@/components/store/garment-art";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioDot, RadioGroup } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/format";
import { useMe } from "./account-frame";
import { useOrder } from "./order-detail";

const REASONS = [
  ["too_small", "Size too small"],
  ["too_large", "Size too large"],
  ["didnt_like", "Didn't like it"],
  ["not_as_pictured", "Looks different from the photos"],
  ["damaged", "Damaged or defective"],
  ["wrong_item", "Wrong item delivered"],
] as const;

/** Next 3 pickup dates excluding Sundays (the server re-checks the same rule). */
function pickupDates(): string[] {
  const out: string[] = [];
  const ist = new Date(Date.now() + 330 * 60_000);
  let d = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  while (out.length < 3) {
    d += 86_400_000;
    if (new Date(d).getUTCDay() !== 0) out.push(new Date(d).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * RET-01/02 return or exchange request: items + quantity, reason (photos for damaged / wrong), exchange-first
 * (size swap or store credit with bonus before a refund), pickup address + slot. The server computes amounts.
 */
export function ReturnForm({ number }: { number: string }) {
  const id = useId();
  const router = useRouter();
  const { me } = useMe();
  const { order, error: loadError } = useOrder(number);
  const [selected, setSelected] = useState<Record<string, { qty: number; size?: string }>>({});
  const [reason, setReason] = useState<string>("too_small");
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [resolution, setResolution] = useState<"exchange" | "store_credit" | "refund">("exchange");
  const [refundTo, setRefundTo] = useState<"upi" | "store_credit">("upi");
  const [upiId, setUpiId] = useState("");
  const [addressId, setAddressId] = useState(me.customer.addresses.at(-1)?.id ?? "");
  const [dates] = useState(pickupDates);
  const [date, setDate] = useState(dates[0]);
  const [slot, setSlot] = useState<"morning" | "afternoon">("morning");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loadError) return <p className="text-[14px]">{loadError}</p>;
  if (!order) return <Skeleton className="h-96 w-full" />;
  if (!order.returnWindow.open) {
    return (
      <div className="space-y-3">
        <p className="text-[14px]">{order.returnWindow.reason ?? "This order can't be returned."}</p>
        <Link href={`/account/orders/${number}`} className="text-[13px] underline underline-offset-2">
          Back to order
        </Link>
      </div>
    );
  }

  const fault = reason === "damaged" || reason === "wrong_item";
  const chosen = Object.entries(selected);
  const exchangeOk = chosen.length > 0 && chosen.every(([lineId, s]) => {
    const l = order.lines.find((x) => x.lineId === lineId);
    return !!s.size && !!l?.exchangeSizes.includes(s.size);
  });

  const upload = async (file: File) => {
    if (photos.length >= 3) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Photos must be JPEG or PNG and 5 MB or smaller.");
      return;
    }
    try {
      const res = await fetch("/api/returns/photos", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
      if (!res.ok || !data?.id) throw new Error(data?.error?.message ?? "Upload failed.");
      setPhotos((p) => [...p, { id: data.id!, url: `/api/returns/photos/${data.id}` }]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/orders/${number}/returns`, {
        method: "POST",
        body: {
          items: chosen.map(([lineId, s]) => ({ lineId, quantity: s.qty, ...(resolution === "exchange" ? { exchangeSize: s.size } : {}) })),
          reason,
          comment,
          photoIds: photos.map((p) => p.id),
          resolution,
          ...(resolution === "refund" && order.paymentMethod === "cod" ? { refundTo, ...(refundTo === "upi" ? { upiId } : {}) } : {}),
          addressId,
          date,
          slot,
        },
      });
      router.push(`/account/orders/${number}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit your request.");
      setBusy(false);
    }
  };

  const label = "mb-2.5 text-[12px] font-bold uppercase tracking-[0.12em]";

  return (
    <form onSubmit={submit} noValidate className="space-y-7">
      <fieldset>
        <legend className={label}>1. Items</legend>
        <ul className="divide-y divide-line border-y border-line">
          {order.lines.map((l) => {
            const s = selected[l.lineId];
            const disabled = l.returnableQty === 0;
            return (
              <li key={l.lineId} className="grid grid-cols-[24px_56px_1fr] items-start gap-3 py-3">
                <Checkbox
                  id={`${id}-${l.lineId}`}
                  disabled={disabled}
                  checked={!!s}
                  onCheckedChange={(on) =>
                    setSelected((cur) => {
                      const next = { ...cur };
                      if (on) next[l.lineId] = { qty: 1 };
                      else delete next[l.lineId];
                      return next;
                    })
                  }
                  className="mt-1"
                />
                <GarmentArt image={{ art: l.image.art as never, colour: l.image.colour, alt: "" }} className="h-16" />
                <div className="text-[13px]">
                  <label htmlFor={`${id}-${l.lineId}`} className={disabled ? "text-muted" : "cursor-pointer"}>
                    {l.title} · Size {l.size}
                  </label>
                  {disabled ? <p className="text-[12px] text-muted">{l.returnNote}</p> : null}
                  {s ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {l.returnableQty > 1 ? (
                        <select
                          aria-label="Quantity"
                          value={s.qty}
                          onChange={(e) => setSelected((cur) => ({ ...cur, [l.lineId]: { ...cur[l.lineId], qty: Number(e.target.value) } }))}
                          className="h-9 border border-line px-2 text-[12px]"
                        >
                          {Array.from({ length: l.returnableQty }, (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              Qty {i + 1}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {resolution === "exchange" ? (
                        <select
                          aria-label="New size"
                          value={s.size ?? ""}
                          onChange={(e) => setSelected((cur) => ({ ...cur, [l.lineId]: { ...cur[l.lineId], size: e.target.value || undefined } }))}
                          className="h-9 border border-line px-2 text-[12px]"
                        >
                          <option value="">New size…</option>
                          {l.exchangeSizes.map((sz) => (
                            <option key={sz} value={sz}>
                              Size {sz}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset>
        <legend className={label}>2. Reason</legend>
        <select aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-12 w-full max-w-[420px] border border-input bg-white px-3 text-[14px]">
          {REASONS.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
        <textarea
          aria-label="Anything else? (optional)"
          placeholder="Anything else? (optional)"
          maxLength={500}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="mt-2 w-full max-w-[420px] border border-input px-3 py-2 text-[14px] outline-none focus-visible:border-black"
        />
        {fault ? (
          <div className="mt-3">
            <p className="text-[12.5px] text-ink-2">Add up to 3 photos (JPEG/PNG, 5 MB each). Report within 24 hours of delivery — these returns are free.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map((p) => (
                <span key={p.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, owner-only image served by our API */}
                  <img src={p.url} alt="Your photo" className="h-20 w-16 border border-line object-cover" />
                  <button type="button" aria-label="Remove photo" onClick={() => setPhotos((cur) => cur.filter((x) => x.id !== p.id))} className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-black text-white">
                    <Icon icon={Cancel01Icon} size={12} />
                  </button>
                </span>
              ))}
              {photos.length < 3 ? (
                <label className="grid h-20 w-16 cursor-pointer place-items-center border border-dashed border-ink-2 text-[11px] text-ink-2">
                  Add
                  <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                </label>
              ) : null}
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className={label}>3. What would you like?</legend>
        <RadioGroup value={resolution} onValueChange={(v) => setResolution(v as typeof resolution)} className="grid-cols-1 sm:grid-cols-3" aria-label="Resolution">
          <RadioCard value="exchange">
            <span className="flex justify-between gap-2">
              <span>
                <span className="block text-[14px] font-semibold">Size exchange</span>
                <span className="text-[12.5px] text-ink-2">Free · new size ships after pickup</span>
              </span>
              <RadioDot />
            </span>
          </RadioCard>
          <RadioCard value="store_credit">
            <span className="flex justify-between gap-2">
              <span>
                <span className="block text-[14px] font-semibold">Store credit +5%</span>
                <span className="text-[12.5px] text-ink-2">Instant after quality check</span>
              </span>
              <RadioDot />
            </span>
          </RadioCard>
          <RadioCard value="refund">
            <span className="flex justify-between gap-2">
              <span>
                <span className="block text-[14px] font-semibold">Refund</span>
                <span className="text-[12.5px] text-ink-2">{order.paymentMethod === "cod" ? "To your UPI ID" : "To your original payment"}</span>
              </span>
              <RadioDot />
            </span>
          </RadioCard>
        </RadioGroup>
        {resolution === "refund" && order.paymentMethod === "cod" ? (
          <div className="mt-3 flex max-w-[420px] flex-col gap-2">
            <Input aria-label="UPI ID" placeholder="yourname@bank" value={upiId} onChange={(e) => setUpiId(e.target.value.trim().slice(0, 100))} autoComplete="off" />
            <label className="flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" checked={refundTo === "store_credit"} onChange={(e) => setRefundTo(e.target.checked ? "store_credit" : "upi")} className="accent-black" />
              Prefer store credit instead (+5% bonus)
            </label>
          </div>
        ) : null}
        <p className="mt-2 text-[12px] text-ink-2">
          Your first return is free; later returns have a {formatINR(9900)} fee (never for damaged or wrong items). The exact amount is shown on the next screen.
        </p>
      </fieldset>

      <fieldset>
        <legend className={label}>4. Pickup</legend>
        {me.customer.addresses.length === 0 ? (
          <p className="text-[13px]">Add an address in your account first.</p>
        ) : (
          <select aria-label="Pickup address" value={addressId} onChange={(e) => setAddressId(e.target.value)} className="h-12 w-full max-w-[420px] border border-input bg-white px-3 text-[14px]">
            {me.customer.addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.line1}, {a.city} {a.pincode}
              </option>
            ))}
          </select>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <select aria-label="Pickup date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 border border-line px-2 text-[13px]">
            {dates.map((d) => (
              <option key={d} value={d}>
                {formatDeliveryDate(d)}
              </option>
            ))}
          </select>
          <select aria-label="Pickup slot" value={slot} onChange={(e) => setSlot(e.target.value as "morning" | "afternoon")} className="h-10 border border-line px-2 text-[13px]">
            <option value="morning">9 am – 1 pm</option>
            <option value="afternoon">1 pm – 6 pm</option>
          </select>
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-accent">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={chosen.length === 0 || !addressId || (resolution === "exchange" && !exchangeOk) || (fault && photos.length === 0)}>
          Request {resolution === "exchange" ? "exchange" : "return"}
        </Button>
        <Button asChild variant="outline">
          <Link href={`/account/orders/${number}`}>Back</Link>
        </Button>
      </div>
    </form>
  );
}
