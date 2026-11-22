import { formatINR, percentOff, type Paise } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Price row: price Inter 700, MRP strike muted, % off red (DESIGN.md §2.2 `price`).
 * `size`: card 12.5/13.5 px · pdp 19/24 px.
 */
export function Price({
  price,
  mrp,
  size = "card",
  showMrp = true,
  className,
}: {
  price: Paise;
  mrp?: Paise;
  size?: "card" | "pdp" | "line";
  showMrp?: boolean;
  className?: string;
}) {
  const off = mrp ? percentOff(price, mrp) : 0;
  return (
    <p className={cn("tabular flex flex-wrap items-baseline gap-x-2", className)}>
      <span
        className={cn(
          "font-bold text-ink",
          size === "card" && "text-[12.5px] lg:text-[13.5px]",
          size === "line" && "text-[14px]",
          size === "pdp" && "text-[19px] lg:text-[24px]",
        )}
      >
        <span className="sr-only">Price </span>
        {formatINR(price)}
      </span>
      {showMrp && mrp && off > 0 ? (
        <>
          <s className={cn("text-muted", size === "pdp" ? "text-[13px] lg:text-[15px]" : "text-[11px] lg:text-[12.5px]")}>
            <span className="sr-only">MRP </span>
            {formatINR(mrp)}
          </s>
          <span className={cn("font-bold text-accent", size === "pdp" ? "text-[12px] lg:text-[15px]" : "text-[11px] lg:text-[12px]")}>
            {off}% OFF
          </span>
        </>
      ) : null}
    </p>
  );
}
