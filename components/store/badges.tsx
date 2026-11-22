import { cn } from "@/lib/utils";

/**
 * DESIGN.md §3 Badges: NEW (white or black), BESTSELLER (red), −30% (red), ONLY 2 LEFT (red text),
 * SOLD OUT (grey). Red is reserved for price/sale/urgency.
 */
type BadgeTone = "white" | "black" | "red" | "grey";

const tones: Record<BadgeTone, string> = {
  white: "bg-white text-black",
  black: "bg-black text-white",
  red: "bg-accent text-white",
  grey: "bg-[#d9d9d9] text-ink-2",
};

export function Badge({
  tone = "white",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-[7px] py-1 text-[9.5px] font-bold uppercase leading-none tracking-[0.12em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Compact badge for menu rows: red `NEW`, red price `₹999`, black `3XL–5XL`. */
export function MenuBadge({ tone = "red", children }: { tone?: "red" | "black"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1 py-[2px] text-[8.5px] font-bold uppercase leading-none tracking-[0.04em]",
        tone === "red" ? "bg-accent text-white" : "bg-black text-white",
      )}
    >
      {children}
    </span>
  );
}

/** "Only 2 left" — real stock counts only (DESIGN.md §6: no fake urgency). */
export function LowStockNote({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn("text-[10.5px] font-bold uppercase tracking-[0.08em] text-accent", className)}>
      Only {count} left
    </span>
  );
}
