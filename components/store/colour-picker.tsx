"use client";

import { useId } from "react";
import type { Colour, GarmentKind } from "@/lib/commerce/types";
import { cn } from "@/lib/utils";
import { GarmentArt } from "./garment-art";

/**
 * PDP-03 / DESIGN.md §3 ColourPicker: image thumbnails 62×80; selected = 2 px black outline, offset 2.
 * Label "COLOUR · Slate Grey". Each colour is its own variant URL on the PDP (M4).
 */
export function ColourPicker({
  colours,
  value,
  onChange,
  art,
  className,
}: {
  colours: Colour[];
  value: string;
  onChange: (name: string) => void;
  art: GarmentKind;
  className?: string;
}) {
  const labelId = useId();
  return (
    <div className={className}>
      <p id={labelId} className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.12em] lg:text-[12px]">
        Colour <span className="font-medium normal-case tracking-normal text-ink-2">· {value}</span>
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2.5">
        {colours.map((c) => {
          const selected = c.name === value;
          return (
            <button
              key={c.name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={c.name}
              title={c.name}
              onClick={() => onChange(c.name)}
              className={cn(
                "outline-offset-2 transition-[outline-color]",
                selected ? "outline-2 outline-black [outline-style:solid]" : "hover:outline-1 hover:outline-line hover:[outline-style:solid]",
              )}
            >
              <GarmentArt image={{ art, colour: c.hex, alt: "" }} className="h-20 w-[62px]" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
