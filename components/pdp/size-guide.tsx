"use client";

import { Mascot } from "@/components/brand/mascot";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { type SizeChart, toInches } from "@/lib/catalog/size-charts";
import { cn } from "@/lib/utils";

/**
 * PDP-03 size guide modal: measurement table with a cm / in toggle, how-to-measure steps and the
 * model's height and size. Bottom sheet on mobile, centred dialog on desktop. Body scrolls; header fixed.
 */
export function SizeGuide({
  open,
  onOpenChange,
  chart,
  model,
  highlight,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chart: SizeChart;
  model?: { height: string; size: string };
  highlight?: string;
}) {
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="size-guide-desc"
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col bg-white outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom lg:inset-auto lg:left-1/2 lg:top-1/2 lg:max-h-[85dvh] lg:w-[640px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:data-[state=open]:slide-in-from-bottom-0 lg:data-[state=open]:fade-in-0"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
            <Dialog.Title className="type-label">Size guide · {chart.title}</Dialog.Title>
            <Dialog.Close aria-label="Close" className="grid size-10 place-items-center">
              <Icon icon={Cancel01Icon} size={20} />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 py-5">
            <div className="flex items-center gap-4">
              {/* MASCOT_PROMPTS #8 "Measuring tape". Sits on its own background colour, so no box shows. */}
              <Mascot name="alpha-08-measuring" sizes="96px" blend className="w-16 shrink-0 lg:w-20" />
              <p id="size-guide-desc" className="text-[13px] text-ink-2">
                Garment measurements{chart.unitless ? "" : ` in ${unit === "cm" ? "centimetres" : "inches"}`}. Compare with a
                piece you own that fits you well.
              </p>
            </div>
            {model ? (
              <p className="mt-2 text-[13px]">
                Model is <b>{model.height}</b> and wears size <b>{model.size}</b>.
              </p>
            ) : null}

            {!chart.unitless ? (
              <div role="radiogroup" aria-label="Units" className="mt-4 inline-flex border border-black">
                {(["cm", "in"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={unit === u}
                    onClick={() => setUnit(u)}
                    className={cn("h-8 px-4 text-[11.5px] font-bold uppercase tracking-[0.1em]", unit === u ? "bg-black text-white" : "bg-white")}
                  >
                    {u}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto border border-line">
              <table className="w-full min-w-[360px] border-collapse text-left text-[13px]">
                <thead className="bg-soft">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 font-bold uppercase tracking-[0.04em]">
                      Size
                    </th>
                    {chart.columns.map((c) => (
                      <th key={c} scope="col" className="px-3 py-2.5 font-bold uppercase tracking-[0.04em]">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular">
                  {chart.rows.map((r) => (
                    <tr key={r.size} className={cn("border-t border-line", r.size === highlight && "bg-soft font-bold")}>
                      <th scope="row" className="px-3 py-2.5 font-semibold">
                        {r.size}
                      </th>
                      {r.values.map((v, i) => (
                        <td key={i} className="px-3 py-2.5">
                          {chart.unitless || unit === "cm" ? v : toInches(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="mt-6 text-[12px] font-bold uppercase tracking-[0.12em]">How to measure</h3>
            <ol className="mt-3 space-y-2.5 text-[13px] leading-[1.6]">
              {chart.howToMeasure.map((m, i) => (
                <li key={m.label} className="flex gap-3">
                  <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-black text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span>
                    <b>{m.label}.</b> {m.text}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-[12px] text-ink-2">Not the right fit? Size exchanges are free on your first return.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
