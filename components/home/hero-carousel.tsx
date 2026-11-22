"use client";

import { ArrowLeft01Icon, ArrowRight02Icon, ArrowRight01Icon, PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { getImageProps } from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ModelFigure } from "@/components/store/garment-art";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { HeroSlide } from "@/lib/cms/types";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 6_000;

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * HOME-01 / DESIGN.md §4.1 hero: 330 px mobile / 640 px desktop. Autoplay 6 s; pauses on hover/focus,
 * with a pause button, and never autoplays under reduced motion (WCAG 2.2.2). Arrows, progress dashes,
 * swipe and ←/→ keys. Slide 1 is server-rendered and its image gets fetchPriority=high (LCP).
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => true);
  const pointerStart = useRef<number | null>(null);
  const count = slides.length;
  const playing = count > 1 && !userPaused && !hovered && !focused && !reduced;

  const go = useCallback((to: number) => setIndex(((to % count) + count) % count), [count]);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => go(index + 1), INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [playing, index, go]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="on-dark relative h-[330px] overflow-hidden bg-black text-white lg:h-[640px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(index - 1);
        if (e.key === "ArrowRight") go(index + 1);
      }}
      onPointerDown={(e) => {
        pointerStart.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (pointerStart.current === null) return;
        const dx = e.clientX - pointerStart.current;
        pointerStart.current = null;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      {slides.map((slide, i) => (
        <Slide key={slide.id} slide={slide} active={i === index} first={i === 0} position={`${i + 1} of ${count}`} />
      ))}

      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => go(index - 1)}
            className="absolute left-5 top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur transition-colors hover:bg-white/30 lg:grid"
          >
            <Icon icon={ArrowLeft01Icon} size={20} />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => go(index + 1)}
            className="absolute right-5 top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur transition-colors hover:bg-white/30 lg:grid"
          >
            <Icon icon={ArrowRight01Icon} size={20} />
          </button>

          <div className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-2 lg:bottom-6">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => go(i)}
                className="grid h-6 place-items-center px-0.5"
              >
                <span className="relative block h-[3px] w-7 overflow-hidden bg-white/35 lg:w-10">
                  {i === index ? (
                    <span
                      key={index}
                      className="hero-progress absolute inset-0 bg-white"
                      style={
                        reduced
                          ? { animation: "none", transform: "scaleX(1)" }
                          : { animationDuration: `${INTERVAL_MS}ms`, animationPlayState: playing ? "running" : "paused" }
                      }
                    />
                  ) : null}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? "Play slideshow" : "Pause slideshow"}
              className="ml-1 grid size-6 place-items-center text-white/80 hover:text-white"
            >
              <Icon icon={userPaused || reduced ? PlayIcon : PauseIcon} size={14} />
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Slide({ slide, active, first, position }: { slide: HeroSlide; active: boolean; first: boolean; position: string }) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={position}
      aria-hidden={!active}
      inert={!active}
      className={cn(
        "absolute inset-0 transition-opacity duration-500 ease-out motion-reduce:transition-none",
        active ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      style={{ backgroundColor: slide.placeholder.fill }}
    >
      {slide.image ? (
        <HeroImage image={slide.image} first={first} />
      ) : (
        <>
          {/* Placeholder art until the campaign shoot (DESIGN.md §5). */}
          <div aria-hidden="true" className="hero-stripes absolute inset-0 opacity-60" />
          <ModelFigure
            {...slide.placeholder.look}
            label=""
            className="absolute bottom-0 right-[4%] h-[86%] w-[46%] lg:right-[14%] lg:h-[88%] lg:w-[28%]"
          />
        </>
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/15 to-transparent" />

      <div className="relative flex h-full max-w-[1440px] flex-col justify-center px-4 pb-6 lg:px-[72px] lg:pb-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/85 lg:text-[12px]">{slide.kicker}</p>
        {first ? (
          <h1 className={cn("mt-2 font-display text-[62px] uppercase leading-[0.86] lg:mt-4 lg:text-[148px]", slide.textTone === "volt" ? "text-volt" : "text-white")}>
            {slide.headline.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h1>
        ) : (
          <h2 className={cn("mt-2 font-display text-[62px] uppercase leading-[0.86] lg:mt-4 lg:text-[148px]", slide.textTone === "volt" ? "text-volt" : "text-white")}>
            {slide.headline.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h2>
        )}
        <p className="mt-3 max-w-[60%] text-[12.5px] leading-[1.45] text-white/90 lg:mt-5 lg:max-w-[520px] lg:text-[18px]">
          {slide.subline}
        </p>
        <Button asChild variant="on-dark" size="sm" className="mt-4 self-start lg:mt-7 lg:h-12 lg:px-6 lg:text-[13px]">
          <Link href={slide.cta.href}>
            {slide.cta.label}
            <Icon icon={ArrowRight02Icon} size={16} />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Art-directed hero image (16:7 desktop, 4:5 mobile) — only the matching one downloads. */
function HeroImage({ image, first }: { image: NonNullable<HeroSlide["image"]>; first: boolean }) {
  const common = { alt: image.alt, sizes: "100vw", fetchPriority: first ? ("high" as const) : undefined };
  const {
    props: { srcSet: desktop },
  } = getImageProps({ ...common, src: image.desktop, width: 1920, height: 840 });
  const {
    props: { srcSet: mobile, ...rest },
  } = getImageProps({ ...common, src: image.mobile, width: 1080, height: 1350 });
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet={desktop} />
      <source media="(max-width: 1023px)" srcSet={mobile} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- props from getImageProps include alt */}
      <img {...rest} className="absolute inset-0 size-full object-cover" />
    </picture>
  );
}
