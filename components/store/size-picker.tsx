"use client";

import { RulerIcon } from "@hugeicons/core-free-icons";
import { useId } from "react";
import { Icon } from "@/components/ui/icon";
import type { SizeOption } from "@/lib/commerce/types";
import { cn } from "@/lib/utils";

/** Units at or below this show a red "N left" caption (real stock only). */
export const LOW_STOCK_AT = 3;

/**
 * PDP-03 / DESIGN.md §3 SizePicker: square buttons min 56×46; selected = 2 px black border + bold;
 * sold out = grey with a diagonal strike (`aria-disabled`, "sold out" in the label); low stock = red
 * "2 left" caption. Sizes are toggle buttons with `aria-pressed` (DESIGN.md §7).
 */
export function SizePicker({
  sizes,
  value,
  onChange,
  onSizeGuide,
  label = "Select size",
  compact = false,
  className,
}: {
  sizes: SizeOption[];
  value?: string;
  onChange: (size: string) => void;
  onSizeGuide?: () => void;
  label?: string;
  /** Mobile PDP style: equal-width buttons in one row. */
  compact?: boolean;
  className?: string;
}) {
  const labelId = useId();
  return (
    <div className={className}>
      <div className="mb-2.5 flex items-center justify-between">
        <p id={labelId} className="text-[11.5px] font-bold uppercase tracking-[0.12em] lg:text-[12px]">
          {label}
          {value ? <span className="ml-1.5 font-medium normal-case tracking-normal text-ink-2">· {value}</span> : null}
        </p>
        {onSizeGuide ? (
          <button
            type="button"
            onClick={onSizeGuide}
            className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.1em] underline underline-offset-4"
          >
            <Icon icon={RulerIcon} size={15} />
            Size guide
          </button>
        ) : null}
      </div>
      <div role="group" aria-labelledby={labelId} className={cn("flex flex-wrap gap-2", compact && "flex-nowrap gap-1.5")}>
        {sizes.map((s) => {
          const soldOut = s.stock === 0;
          const low = !soldOut && s.stock <= LOW_STOCK_AT;
          const selected = value === s.label;
          return (
            <div key={s.label} className={cn("flex flex-col items-center", compact && "min-w-0 flex-1")}>
              <button
                type="button"
                aria-pressed={selected}
                aria-disabled={soldOut || undefined}
                aria-label={`${s.label}${soldOut ? ", sold out" : low ? `, only ${s.stock} left` : ""}`}
                onClick={() => {
                  if (!soldOut) onChange(s.label);
                }}
                className={cn(
                  "relative grid h-[46px] min-w-14 place-items-center overflow-hidden border border-[#cfcfcf] bg-white px-3 text-[13px] font-medium transition-colors",
                  compact && "h-10 w-full min-w-0 px-1",
                  !soldOut && !selected && "hover:border-black",
                  selected && "border-2 border-black font-bold",
                  soldOut &&
                    "cursor-not-allowed border-line bg-soft text-[#b5b5b5] after:absolute after:left-1/2 after:top-1/2 after:h-px after:w-[140%] after:-translate-x-1/2 after:-translate-y-1/2 after:-rotate-[33deg] after:bg-[#c9c9c9]",
                )}
              >
                {s.label}
              </button>
              {low ? (
                <span aria-hidden="true" className="mt-1 text-[10.5px] font-semibold text-accent">
                  {s.stock} left
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
