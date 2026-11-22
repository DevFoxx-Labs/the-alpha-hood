import { formatINR, freeShippingProgress, type Paise } from "@/lib/format";
import { cn } from "@/lib/utils";

/** CART-02 free-shipping progress (green). */
export function FreeShippingBar({ subtotal, threshold, className }: { subtotal: Paise; threshold: Paise; className?: string }) {
  const { remaining, ratio, unlocked } = freeShippingProgress(subtotal, threshold);
  return (
    <div className={cn("bg-soft px-3 py-2.5", className)}>
      <p className="text-[12px] font-medium text-ink" aria-live="polite">
        {unlocked ? (
          <>
            You&apos;ve unlocked <b className="font-bold">FREE shipping</b>
          </>
        ) : (
          <>
            Add <b className="tabular font-bold">{formatINR(remaining)}</b> more for <b className="font-bold">FREE shipping</b>
          </>
        )}
      </p>
      <div
        className="mt-2 h-1 bg-[#dddddd]"
        role="progressbar"
        aria-label="Progress to free shipping"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div className="h-full origin-left bg-green transition-transform duration-300 ease-out" style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}
