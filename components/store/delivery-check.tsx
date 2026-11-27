"use client";

import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useId, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const PINCODE_RE = /^[1-9][0-9]{5}$/;

export interface DeliveryEstimate {
  /** e.g. "Tue, 24 Nov" */
  date: string;
  cod: boolean;
  codFee?: string;
  note?: string;
  /** Town and state of the pincode, e.g. "Pune, Maharashtra" (from the courier or the India Post directory). */
  place?: string;
}

/**
 * PDP-05 / DESIGN.md §3 DeliveryCheck: pincode input with a red CHECK/CHANGE text button; results with
 * check icons, date in green. `onCheck` is supplied by the caller (PDP: /api/delivery). Storing the pincode
 * (device only) is the caller's choice.
 */
export function DeliveryCheck({
  onCheck,
  initialPincode = "",
  className,
}: {
  onCheck: (pincode: string) => Promise<DeliveryEstimate | null>;
  initialPincode?: string;
  className?: string;
}) {
  const inputId = useId();
  const [pincode, setPincode] = useState(initialPincode);
  const [checked, setChecked] = useState<string | null>(null);
  const [result, setResult] = useState<DeliveryEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checked) {
      setChecked(null);
      setResult(null);
      return;
    }
    if (!PINCODE_RE.test(pincode)) {
      setError("Enter a valid 6-digit pincode");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await onCheck(pincode);
      if (!r) setError("We don't deliver to this pincode yet");
      setResult(r);
      setChecked(pincode);
    } catch {
      setError("Couldn't check delivery right now. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <form onSubmit={submit} className="flex h-12 items-center border border-[#cfcfcf] focus-within:border-black">
        <label htmlFor={inputId} className="sr-only">
          Delivery pincode
        </label>
        <input
          id={inputId}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          placeholder="Enter pincode"
          value={pincode}
          readOnly={!!checked}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${inputId}-err` : undefined}
          onChange={(e) => {
            setPincode(e.target.value.replace(/\D/g, "").slice(0, 6));
            setError(null);
          }}
          className="tabular h-full min-w-0 flex-1 bg-transparent px-4 text-[14px] outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-full px-4 text-[11.5px] font-bold uppercase tracking-[0.12em] text-accent disabled:opacity-50"
        >
          {busy ? "Checking…" : checked ? "Change" : "Check"}
        </button>
      </form>
      <div aria-live="polite">
        {error ? (
          <p id={`${inputId}-err`} className="mt-2 text-[12px] text-accent">
            {error}
          </p>
        ) : null}
        {result ? (
          <ul className="mt-2.5 space-y-1.5 text-[12px] text-ink-2">
            {result.place ? (
              <li className="flex items-center gap-1.5">
                <Icon icon={CheckmarkCircle02Icon} size={15} className="text-green" />
                Delivering to <b className="font-semibold text-ink">{result.place}</b>
              </li>
            ) : null}
            <li className="flex items-center gap-1.5">
              <Icon icon={CheckmarkCircle02Icon} size={15} className="text-green" />
              Delivery by <b className="font-semibold text-green">{result.date}</b>
              {result.cod ? <> · COD available{result.codFee ? ` (${result.codFee} fee)` : ""}</> : <> · Prepaid only</>}
            </li>
            {result.note ? (
              <li className={cn("flex items-center gap-1.5")}>
                <Icon icon={CheckmarkCircle02Icon} size={15} className="text-green" />
                {result.note}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
