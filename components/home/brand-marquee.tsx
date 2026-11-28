import { getImageProps } from "next/image";
import Link from "next/link";
import { MASCOT } from "@/lib/brand/mascot";
import type { MarqueeLink } from "@/lib/storefront";
import { cn } from "@/lib/utils";

/**
 * Two crossed "caution tape" word strips under the hero. It's the GymYardHQ landing-page marquee, doubled and dressed
 * for the brand:
 * - volt tape in front (−2°, runs left) and black tape behind (+2°, runs right, volt hazard edges), each with a tape
 *   sheen and grain;
 * - words alternate solid / outline (the brand-video outline look) with the logo mark between them;
 * - scrolling the page gives each tape an extra push in its own direction (CSS scroll timeline, no JS);
 * - the front tape's words are links (categories, or the drop's pieces) and it pauses under the pointer;
 * - drop layout: the pieces left in the edition, from real stock, in red at 10 or fewer;
 * - desktop: ALPHA rises between the tapes as the section scrolls in.
 *
 * Performance: server-rendered, fixed height (no CLS), transform-only animation (`--animate-marquee*`, `.mq-*` in
 * app/globals.css). The separators are 2–3 KB WebP marks, the mascot loads on desktop only, and links don't prefetch.
 * It holds still for reduced motion.
 * Accessibility: decorative (aria-hidden); the links are mouse/touch shortcuts (tabIndex −1) to pages the header menu
 * and category rail already offer, so keyboard and screen-reader users lose nothing.
 */

export interface TapeWord {
  label: string;
  href?: string;
  /** Stock count: red chip when low. */
  urgent?: boolean;
}

/** Front-tape words: the first built-in word, then the stock count, then the live links, then the other words. */
export function frontWords(front: string[], links: MarqueeLink[], left: number | null): TapeWord[] {
  const [first, ...rest] = front;
  const stock: TapeWord[] = left === null ? [] : [{ label: left === 0 ? "Sold out" : `${left.toLocaleString("en-IN")} left`, urgent: left <= 10 }];
  return [...(first ? [{ label: first }] : []), ...stock, ...links.map((l) => ({ label: l.label, href: l.href })), ...rest.map((label) => ({ label }))];
}

/**
 * Repeat the list until one half of the loop is wider than the widest screen (≈ 2560 px + the scroll push), so the
 * −50% loop never shows a gap. Anton at 30 px is about 15 px per character; every word adds about 100 px of
 * padding and a mark.
 */
export function fillHalf(words: TapeWord[], minPx = 3200): TapeWord[] {
  if (words.length === 0) return [];
  const width = (list: TapeWord[]) => list.reduce((n, w) => n + w.label.length * 15 + 100, 0);
  const out = [...words];
  while (width(out) < minPx) out.push(...words);
  return out;
}

/** One endless tape (also used as the drop tape in the limited-edition finale). */
export function Tape({ words, tone }: { words: TapeWord[]; tone: "front" | "back" }) {
  const half = fillHalf(words);
  const front = tone === "front";
  return (
    <div className={cn("mq-tape group/tape relative overflow-hidden", front ? "mq-tape-front border-y-2 border-ink bg-volt text-ink" : "mq-tape-back bg-black text-white")}>
      <div className={cn("flex w-max py-2.5 lg:py-3", front ? "motion-safe:animate-marquee" : "motion-safe:animate-marquee-back", "group-hover/tape:[animation-play-state:paused]")}>
        {[0, 1].map((dup) => (
          <div key={dup} className="flex shrink-0 items-center">
            {half.map((w, i) => {
              const outline = !w.urgent && i % 2 === 1;
              const text = cn(
                "relative mr-11 whitespace-nowrap px-5 font-display text-[22px] uppercase leading-none tracking-[0.02em] lg:mr-14 lg:px-7 lg:text-[30px]",
                outline && (front ? "text-transparent [-webkit-text-stroke:1.25px_var(--color-ink)]" : "text-transparent [-webkit-text-stroke:1.25px_var(--color-volt)]"),
                !outline && !front && "text-volt",
                w.urgent && "bg-accent py-1 text-white",
              );
              // One element per word: the logo mark after it is a CSS ::after (.mq-word), which keeps the home page's DOM small.
              return w.href ? (
                <Link key={i} href={w.href} prefetch={false} tabIndex={-1} draggable={false} className={cn("mq-word", text, "transition-colors hover:bg-ink hover:text-volt hover:[-webkit-text-stroke:0]")}>
                  {w.label}
                </Link>
              ) : (
                <span key={i} className={cn("mq-word", text)}>
                  {w.label}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** ALPHA (#4, pointing, transparent cut-out) rising between the tapes. Desktop only: phones get a 1×1 placeholder, no download. */
function Peek() {
  const m = MASCOT["alpha-04-pointing"];
  const {
    props: { srcSet, ...img },
  } = getImageProps({ src: m.src, width: m.width, height: m.height, alt: "", sizes: "230px", loading: "lazy" });
  return (
    <div className="pointer-events-none absolute bottom-1/2 left-1/2 z-[1] hidden h-[250px] w-[230px] -translate-x-1/2 overflow-hidden lg:block">
      <picture>
        <source media="(min-width: 1024px)" srcSet={srcSet} sizes="230px" />
        {/* eslint-disable-next-line jsx-a11y/alt-text -- decorative, alt="" from getImageProps */}
        <img {...img} src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" className="mq-peek absolute bottom-0 left-0 h-auto w-full select-none drop-shadow-[0_10px_18px_rgb(0_0_0/0.45)]" draggable={false} />
      </picture>
    </div>
  );
}

export function BrandMarquee({
  front,
  back,
  links = [],
  left = null,
  below = "light",
  mascot = true,
}: {
  front: string[];
  back: string[];
  links?: MarqueeLink[];
  /** Pieces left in the drop's edition (editionLeft), or null to hide the count. */
  left?: number | null;
  below?: "dark" | "light";
  mascot?: boolean;
}) {
  const frontList = frontWords(front, links, left);
  if (frontList.length === 0 && back.length === 0) return null;
  return (
    <div
      aria-hidden="true"
      className={cn(
        // Fixed height = tape + the rise of the tilt across the width, so nothing shifts while it loads. Narrow screens
        // tilt more (5° / 3° / 2°), otherwise the two tapes would lie on top of each other and the X would vanish.
        "mq relative z-10 h-[calc(64px+9.5vw)] overflow-x-clip bg-gradient-to-b from-black from-50% md:h-[calc(72px+6.5vw)] xl:h-[calc(80px+4.6vw)]",
        below === "dark" ? "to-black" : "to-background to-50%",
      )}
    >
      {back.length ? (
        <div className="absolute -inset-x-[8vw] top-1/2 z-0 -translate-y-1/2 rotate-5 md:rotate-3 xl:rotate-2">
          <div className="mq-push-r">
            <Tape words={back.map((label) => ({ label }))} tone="back" />
          </div>
        </div>
      ) : null}
      {mascot ? <Peek /> : null}
      {frontList.length ? (
        <div className="absolute -inset-x-[8vw] top-1/2 z-[2] -translate-y-1/2 -rotate-5 md:-rotate-3 xl:-rotate-2">
          <div className="mq-push-l">
            <Tape words={frontList} tone="front" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
