import type { Colour } from "@/lib/commerce/types";
import { cn } from "@/lib/utils";

/** Card swatches: 11 px squares, max 4 + "+N" (CARD-01). Labelled for screen readers (DESIGN.md §7). */
export function Swatches({ colours, max = 4, className }: { colours: Colour[]; max?: number; className?: string }) {
  const shown = colours.slice(0, max);
  const extra = colours.length - shown.length;
  return (
    <ul className={cn("flex items-center gap-1", className)} aria-label={`${colours.length} colours`}>
      {shown.map((c) => (
        <li key={c.name} title={c.name} className="size-[11px] border border-black/15" style={{ backgroundColor: c.hex }}>
          <span className="sr-only">{c.name}</span>
        </li>
      ))}
      {extra > 0 ? <li className="ml-0.5 text-[10.5px] font-semibold text-ink-2">+{extra}</li> : null}
    </ul>
  );
}
