"use client";

import {
  CheckmarkCircle02Icon,
  CreditCardIcon,
  BankIcon,
  Money03Icon,
  SmartPhone01Icon,
  SquareLock02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { Tabs as TabsPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * DESIGN.md §3 Checkout blocks: white boxes with a 1 px line border on #F7F7F5, numbered black circles,
 * payment = left method list (active: 3 px black left border; UPI shows "EXTRA 5% OFF" in green) +
 * right panel. Controlled components; the checkout page (M5) owns the state and talks to the server.
 */
export function CheckoutStep({
  number,
  title,
  done = false,
  action,
  aside,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  action?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`chk-step-${number}`} className="border border-line bg-white p-5 lg:p-8">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 id={`chk-step-${number}`} className="flex items-center gap-3 text-[13px] font-bold uppercase tracking-[0.14em] lg:text-[14px]">
          <span className="grid size-6 place-items-center rounded-full bg-black text-[12px] font-bold text-white">{number}</span>
          {title}
          {done ? <span className="sr-only">(completed)</span> : null}
        </h2>
        {action}
        {aside ? <span className="text-[12px] text-muted">{aside}</span> : null}
      </header>
      {children}
    </section>
  );
}

export function DoneLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 text-[13px] text-ink-2 lg:text-[14px]">
      <Icon icon={CheckmarkCircle02Icon} size={18} className="text-green" />
      {children}
    </p>
  );
}

const METHODS = [
  { id: "upi", label: "UPI", icon: SmartPhone01Icon, hint: "GPay, PhonePe, Paytm or any UPI app" },
  { id: "card", label: "Credit / Debit card", icon: CreditCardIcon, hint: "Visa, Mastercard, RuPay" },
  { id: "netbanking", label: "Net banking", icon: BankIcon, hint: "All major banks" },
  { id: "wallet", label: "Wallets", icon: Wallet01Icon, hint: "Paytm, Mobikwik and more" },
  { id: "cod", label: "Cash on delivery", icon: Money03Icon, hint: "Pay when it arrives" },
] as const;

export type PaymentChoice = (typeof METHODS)[number]["id"];

/** Neutral UPI app tiles — real brand logos need licensed artwork (docs/known-gaps.md). */
const UPI_APPS = [
  { id: "gpay", label: "GPay" },
  { id: "phonepe", label: "PhonePe" },
  { id: "paytm", label: "Paytm" },
  { id: "other", label: "Other UPI" },
] as const;

/**
 * CHK-04 payment step: method list (UPI first, with the prepaid offer) + a right panel with the pay button.
 * Card / UPI / bank details are entered on the payment partner's secure page, never on ours (PCI).
 * COD shows its fee or why it isn't available (CHK-07).
 */
export function PaymentMethods({
  value,
  onChange,
  upiApp,
  onUpiApp,
  prepaidOffer,
  cod,
  payLabel,
  onPay,
  busy = false,
  disabledReason,
}: {
  value: PaymentChoice;
  onChange: (v: PaymentChoice) => void;
  upiApp: string;
  onUpiApp: (v: string) => void;
  /** e.g. "Extra 5% off" shown next to UPI. */
  prepaidOffer?: string;
  cod: { allowed: boolean; reasons: string[]; feeLabel: string } | null;
  payLabel: string;
  onPay: () => void;
  busy?: boolean;
  disabledReason?: string | null;
}) {
  const codBlocked = cod !== null && !cod.allowed;
  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={(v) => onChange(v as PaymentChoice)}
      orientation="vertical"
      className="grid border border-line md:grid-cols-[minmax(0,280px)_1fr]"
    >
      <TabsPrimitive.List aria-label="Payment method" className="flex flex-col border-b border-line md:border-b-0 md:border-r">
        {METHODS.map((m) => (
          <TabsPrimitive.Trigger
            key={m.id}
            value={m.id}
            className="flex items-center gap-3 border-b border-l-[3px] border-b-line border-l-transparent bg-soft px-4 py-3.5 text-left text-[13.5px] last:border-b-0 data-[state=active]:border-l-black data-[state=active]:bg-white data-[state=active]:font-semibold"
          >
            <Icon icon={m.icon} size={18} />
            <span className="flex-1">{m.label}</span>
            {m.id === "upi" && prepaidOffer ? (
              <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-green">{prepaidOffer}</span>
            ) : null}
            {m.id === "cod" && codBlocked ? <span className="text-[10.5px] text-muted">Unavailable</span> : null}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>

      {METHODS.map((m) => (
        <TabsPrimitive.Content key={m.id} value={m.id} className="p-4 outline-none lg:p-6">
          {m.id === "upi" ? (
            <div role="radiogroup" aria-label="UPI app" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {UPI_APPS.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  role="radio"
                  aria-checked={upiApp === app.id}
                  onClick={() => onUpiApp(app.id)}
                  className={cn(
                    "flex h-[70px] flex-col items-center justify-center gap-1.5 border text-[12.5px] font-medium",
                    upiApp === app.id ? "border-2 border-black" : "border-line hover:border-ink-2",
                  )}
                >
                  <span aria-hidden="true" className="size-6 rounded-md bg-soft-2" />
                  {app.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ink-2">{m.hint}</p>
          )}

          {m.id === "cod" ? (
            codBlocked ? (
              <ul className="mt-3 space-y-1 text-[13px] text-accent" role="status">
                {cod!.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12.5px] text-ink-2">A {cod?.feeLabel ?? "small"} cash handling fee applies. Your phone is already verified.</p>
            )
          ) : (
            <p className="mt-4 flex items-center gap-2 text-[12px] text-ink-2">
              <Icon icon={SquareLock02Icon} size={15} />
              You&apos;ll complete the payment on our payment partner&apos;s secure page.
            </p>
          )}

          {m.id === "upi" && prepaidOffer ? (
            <p className="mt-4 flex items-center gap-2 bg-green-tint px-3 py-2.5 text-[12.5px] font-medium text-green">
              <Icon icon={CheckmarkCircle02Icon} size={16} />
              {prepaidOffer} applied to your total
            </p>
          ) : null}

          <Button size="lg" className="mt-4 w-full" type="button" onClick={onPay} loading={busy} disabled={!!disabledReason || (m.id === "cod" && codBlocked)}>
            <Icon icon={SquareLock02Icon} size={18} />
            {payLabel}
          </Button>
          {disabledReason ? <p className="mt-2 text-[12px] text-ink-2">{disabledReason}</p> : null}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
