import Link from "next/link";
import { GarmentArt } from "@/components/store/garment-art";
import { Price } from "@/components/store/price";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/utils";

/** Pieces left across all sizes (real stock). */
export const piecesLeft = (p: Product) => p.sizes.reduce((n, s) => n + Math.max(0, s.stock), 0);

/**
 * A luxury product card for the ambassador / limited-edition bands: photo, name, price, and a "Signed by" line.
 * `tone="dark"` sits on the black band; `"light"` on the volt finale. Server-rendered links to the PDP.
 */
export function SignaturePiece({ product, signedBy, tone, note, className }: { product: Product; signedBy?: string; tone: "dark" | "light"; note?: string; className?: string }) {
  const left = piecesLeft(product);
  return (
    <Link
      href={`/products/${product.handle}`}
      className={cn(
        "group flex w-[220px] shrink-0 flex-col border p-2.5 transition-colors",
        tone === "dark" ? "border-white/15 bg-black/55 text-white backdrop-blur hover:border-volt" : "border-ink/15 bg-white text-ink hover:border-ink",
        className,
      )}
    >
      <GarmentArt image={{ ...product.images[0], alt: product.title }} className="aspect-[4/5] w-full" sizes="220px" artClassName="transition-transform duration-500 group-hover:scale-[1.03]" />
      <span className="mt-2.5 line-clamp-2 text-[13px] font-semibold leading-snug">{product.title}</span>
      <Price price={product.price} mrp={product.mrp} className={cn("mt-1", tone === "dark" && "[&_*]:text-white")} />
      {signedBy ? (
        <span className={cn("mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]", tone === "dark" ? "text-volt" : "text-ink")}>✍ Signed by {signedBy}</span>
      ) : null}
      {note ? <span className={cn("mt-0.5 text-[11px]", tone === "dark" ? "text-white/65" : "text-ink-2")}>{note}</span> : null}
      {left === 0 ? (
        <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">Sold out</span>
      ) : left <= 10 ? (
        <span className="mt-0.5 text-[11px] font-semibold text-accent">Only {left} left</span>
      ) : null}
    </Link>
  );
}
