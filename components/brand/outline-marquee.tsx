"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Brand-video background: rows of huge outlined words ("ALPHA HOOD") drifting sideways for ever.
 * Owner's brief and original sample: docs/samples/outline-text-background/. CSS: `.olm*` in app/globals.css.
 *
 * Usage: the parent section gets `relative isolate overflow-hidden`, and its real content gets `relative z-[1]`:
 *
 *   <section className="relative isolate overflow-hidden bg-black">
 *     <OutlineMarquee accentRow={1} />
 *     <div className="relative z-[1]">…content…</div>
 *   </section>
 *
 * Tuning:
 * - text: the word(s) repeated in each row (default "ALPHA HOOD").
 * - rows: how many rows (1–8). The rows sit in the middle and the vignette fades them out at the edges.
 * - speed: multiplier. 1 = about 70 px/s, 0.5 = half as fast, 2 = twice as fast.
 * - opacity: stroke opacity (default 0.08 = 8%). The accent row uses 1.5× this.
 * - theme: "dark" (white stroke, fades to black) | "light" (black stroke, fades to white).
 *   On another background colour, set the fade colour too: className="[--olm-fade:var(--color-soft)]".
 * - accentRow: index of ONE row drawn in volt (brand yellow). Use it on dark sections only (DESIGN.md: volt only on dark).
 *
 * The rows are server-rendered empty spans whose word comes from CSS (`content: attr(data-text)`), so nothing waits on
 * JS, nothing shifts, and the repeated word is not added to the page's text for search engines. CSS transforms only.
 * It is static when the visitor prefers reduced motion, and paused while off-screen (IntersectionObserver).
 */

/** Seconds per loop at speed 1. Rows are slightly out of step so they never line up. */
const BASE_SECONDS = [60, 68, 64, 72, 58, 66, 70, 62];
/** Copies of the word per half-row. Two identical halves make the loop seamless (translateX 0 → -50%). Six copies are
 *  wider than a 2560 px screen at the largest type size. */
const COPIES_PER_HALF = 6;

export interface OutlineMarqueeProps {
  text?: string;
  rows?: number;
  theme?: "dark" | "light";
  speed?: number;
  accentRow?: number | null;
  opacity?: number;
  grain?: boolean;
  className?: string;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function OutlineMarquee({
  text = "ALPHA HOOD",
  rows = 4,
  theme = "dark",
  speed = 1,
  accentRow = null,
  opacity = 0.08,
  grain = true,
  className,
}: OutlineMarqueeProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Pause the animation while the section is off-screen (saves battery). Without IntersectionObserver it keeps running.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => el.toggleAttribute("data-paused", !entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const count = clamp(Math.round(rows), 1, 8);
  const pace = clamp(speed, 0.1, 5);
  const style = { "--olm-op": clamp(opacity, 0, 1) } as CSSProperties;

  return (
    <div ref={ref} aria-hidden="true" data-theme={theme} data-grain={grain || undefined} className={cn("olm", className)} style={style}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="olm-row"
          data-dir={i % 2 ? "right" : "left"}
          data-accent={i === accentRow || undefined}
          style={{ "--olm-dur": `${(BASE_SECONDS[i % BASE_SECONDS.length] / pace).toFixed(1)}s`, "--olm-delay": `${-i * 7}s` } as CSSProperties}
        >
          {Array.from({ length: COPIES_PER_HALF * 2 }, (_, j) => (
            <span key={j} data-text={text} />
          ))}
        </div>
      ))}
    </div>
  );
}
