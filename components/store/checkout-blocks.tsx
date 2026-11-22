"use client";

import {
  Calendar03Icon,
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * DESIGN.md §3 Checkout blocks: white boxes with a 1 px line border on #F7F7F5, numbered black circles,
 * payment = left method list (active: 3 px black left border; UPI shows "EXTRA 5% OFF" in green) +
 * right panel. Presentational for M1 — no payment logic, nothing is submitted. M5 wires the gateway.
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
  { id: "upi", label: "UPI", icon: SmartPhone01Icon, offer: "Extra 5% off" },
  { id: "card", label: "Credit / Debit card", icon: CreditCardIcon },
  { id: "netbanking", label: "Net banking", icon: BankIcon },
  { id: "wallets", label: "Wallets", icon: Wallet01Icon },
  { id: "emi", label: "EMI / Pay later", icon: Calendar03Icon },
  { id: "cod", label: "Cash on delivery", icon: Money03Icon },
] as const;

/** Neutral app tiles — brand logos are assets and are added with real, licensed artwork in M5. */
const UPI_APPS = ["GPay", "PhonePe", "Paytm", "Other UPI"];

export function PaymentPanel({ payLabel }: { payLabel: string }) {
  return (
    <TabsPrimitive.Root
      defaultValue="upi"
      orientation="vertical"
      className="grid border border-line md:grid-cols-[minmax(0,300px)_1fr]"
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
            {"offer" in m ? (
              <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-green">{m.offer}</span>
            ) : null}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>

      <TabsPrimitive.Content value="upi" className="p-4 outline-none lg:p-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {UPI_APPS.map((app, i) => (
            <button
              key={app}
              type="button"
              aria-pressed={i === 0}
              className={cn(
                "flex h-[70px] flex-col items-center justify-center gap-1.5 border text-[12.5px] font-medium",
                i === 0 ? "border-2 border-black" : "border-line hover:border-ink-2",
              )}
            >
              <span aria-hidden="true" className="size-6 rounded-md bg-soft-2" />
              {app}
            </button>
          ))}
        </div>
        <p className="my-4 flex items-center gap-3 text-[12px] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
          or pay with UPI ID
        </p>
        <div className="flex border border-input focus-within:border-black">
          <Input aria-label="UPI ID" placeholder="yourname@upi" className="border-0" autoComplete="off" />
          <button type="button" className="px-4 text-[11.5px] font-bold uppercase tracking-[0.12em]">
            Verify
          </button>
        </div>
        <p className="mt-4 flex items-center gap-2 bg-green-tint px-3 py-2.5 text-[12.5px] font-medium text-green">
          <Icon icon={CheckmarkCircle02Icon} size={16} />
          Demo: UPI savings note appears here
        </p>
        <Button size="lg" className="mt-4 w-full" type="button">
          <Icon icon={SquareLock02Icon} size={18} />
          {payLabel}
        </Button>
      </TabsPrimitive.Content>
      {METHODS.slice(1).map((m) => (
        <TabsPrimitive.Content key={m.id} value={m.id} className="p-6 text-[13px] text-ink-2 outline-none">
          {m.label} — wired up with the payment gateway in milestone M5.
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
