import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ListingTile as Tile } from "@/lib/cms/types";

/** PLP-05 merchandising tile inside the grid (reference/02 black tile). Content from the CMS. */
export function ListingTile({ tile }: { tile: Tile }) {
  return (
    <div className="on-dark flex h-full min-h-[300px] flex-col justify-end bg-black p-4 text-white lg:p-7">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-volt lg:text-[11px]">{tile.kicker}</p>
      <h2 className="mt-2 font-display text-[30px] uppercase leading-[0.9] lg:text-[46px]">
        {tile.lines.map((line, i) => (
          <span key={line} className={i === tile.highlightLine ? "block text-volt" : "block"}>
            {line}
          </span>
        ))}
      </h2>
      <p className="mt-3 text-[12px] leading-[1.5] text-white/85 lg:text-[13.5px]">{tile.text}</p>
      <Button asChild variant="on-dark" size="sm" className="mt-4 w-full lg:mt-5 lg:h-12">
        <Link href={tile.cta.href}>{tile.cta.label}</Link>
      </Button>
    </div>
  );
}
