"use client";

import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { CategoryRailItem } from "@/components/store/merch-tiles";
import { Icon } from "@/components/ui/icon";
import type { Category } from "@/lib/commerce/types";
import { cn } from "@/lib/utils";

/**
 * HOME-02 "Shop by category" as a slider: swipe / trackpad / keyboard scroll on every screen, plus ← → buttons on
 * desktop that appear only when there is more to see (more tiles than fit the width). Server-rendered list (the
 * tiles are in the first HTML); the buttons are the only client part. Scroll-snap, no layout shift.
 */
export function CategorySlider({ categories, labelledBy }: { categories: Category[]; labelledBy: string }) {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const page = (dir: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.8), behavior: "smooth" });
  };

  const arrow = "absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center border border-ink bg-white text-ink transition-opacity hover:bg-ink hover:text-white lg:grid disabled:pointer-events-none disabled:opacity-0";
  return (
    <div className="relative mt-6 lg:mt-10">
      <button type="button" aria-label="Previous categories" disabled={edge.start} onClick={() => page(-1)} className={cn(arrow, "-left-5")}>
        <Icon icon={ArrowLeft01Icon} size={20} />
      </button>
      <ul
        ref={track}
        aria-labelledby={labelledBy}
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 lg:mx-0 lg:gap-6 lg:px-0"
      >
        {categories.map((c) => (
          <li key={`${c.handle}${c.href ?? ""}`} className="snap-start">
            <CategoryRailItem category={c} />
          </li>
        ))}
      </ul>
      <button type="button" aria-label="Next categories" disabled={edge.end} onClick={() => page(1)} className={cn(arrow, "-right-5")}>
        <Icon icon={ArrowRight01Icon} size={20} />
      </button>
    </div>
  );
}
