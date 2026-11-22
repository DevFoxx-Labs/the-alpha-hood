"use client";

import { Ticket01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { showMessageToast } from "./toast";

/** PDP-02 / DESIGN.md §3 CouponBox: `coupon` bg, dashed red code chip with a ticket icon, red COPY. */
export function CouponBox({ code, description, className }: { code: string; description: string; className?: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showMessageToast(`Code ${code} copied`);
    } catch {
      showMessageToast("Couldn't copy — please note the code manually");
    }
  };

  return (
    <div className={cn("flex items-center justify-between gap-4 bg-coupon px-4 py-3.5", className)}>
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 border border-dashed border-accent px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-accent">
          <Icon icon={Ticket01Icon} size={14} />
          {code}
        </span>
        <p className="mt-1.5 text-[12px] text-ink-2">{description}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 text-[11.5px] font-bold uppercase tracking-[0.12em] text-accent hover:underline"
        aria-label={`Copy coupon code ${code}`}
      >
        Copy
      </button>
    </div>
  );
}
