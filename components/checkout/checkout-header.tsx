"use client";

import { CheckmarkCircle02Icon, SquareLock02Icon } from "@hugeicons/core-free-icons";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/store/logo";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** DESIGN.md §4.4 distraction-free header: logo, step indicator, "100% secure checkout". */
export function CheckoutHeader() {
  const pathname = usePathname();
  const confirmation = pathname.startsWith("/checkout/order/");
  const steps = [
    { label: "Bag", state: "done" },
    { label: "Address & payment", state: confirmation ? "done" : "active" },
    { label: "Confirmation", state: confirmation ? "active" : "todo" },
  ] as const;
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4 lg:h-16 lg:px-10">
        <Logo compact />
        <ol aria-label="Checkout steps" className="hidden items-center gap-3 text-[11px] font-bold uppercase tracking-[0.12em] md:flex">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-3">
              {i > 0 ? <span aria-hidden="true" className="h-px w-10 bg-line-2" /> : null}
              <span
                aria-current={s.state === "active" ? "step" : undefined}
                className={cn("flex items-center gap-1.5", s.state === "todo" ? "text-muted" : "text-ink")}
              >
                {s.state === "done" ? <Icon icon={CheckmarkCircle02Icon} size={15} className="text-green" /> : null}
                {s.label}
              </span>
            </li>
          ))}
        </ol>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
          <Icon icon={SquareLock02Icon} size={15} />
          <span className="hidden sm:inline">100% secure checkout</span>
          <span className="sm:hidden">Secure</span>
        </p>
      </div>
    </header>
  );
}
