"use client";

import { toast } from "sonner";
import type { CartLine } from "@/lib/commerce/types";
import { GarmentArt } from "./garment-art";

/** DESIGN.md §3 Toast: black bar, product thumb + "Added to bag · VIEW BAG". */
export function BagToast({ line, onViewBag }: { line: Pick<CartLine, "title" | "size" | "image">; onViewBag?: () => void }) {
  return (
    <div className="on-dark mx-auto flex w-[min(100vw-24px,420px)] items-center gap-3 bg-black p-2.5 pr-4 text-white shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)]">
      <GarmentArt image={line.image} className="h-12 w-9 shrink-0" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug">
        <span className="font-semibold">Added to bag</span>
        <span className="block truncate text-[12px] text-white/70">
          {line.title} · Size {line.size}
        </span>
      </p>
      {onViewBag ? (
        <button type="button" onClick={onViewBag} className="shrink-0 text-[11.5px] font-bold uppercase tracking-[0.12em] underline underline-offset-4">
          View bag
        </button>
      ) : null}
    </div>
  );
}

export function showBagToast(line: Pick<CartLine, "title" | "size" | "image">, openBag: () => void) {
  toast.custom(
    (id) => (
      <BagToast
        line={line}
        onViewBag={() => {
          toast.dismiss(id);
          openBag();
        }}
      />
    ),
    { duration: 4000 },
  );
}

/** Plain black text toast (wishlist, copy, errors). */
export function showMessageToast(message: string) {
  toast.custom(() => (
    <div role="status" className="mx-auto w-fit max-w-[calc(100vw-24px)] bg-black px-4 py-3 text-[13px] text-white">
      {message}
    </div>
  ));
}
