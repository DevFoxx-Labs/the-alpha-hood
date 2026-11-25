"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import Image from "next/image";
import Link from "next/link";
import { Dialog } from "radix-ui";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/store/badges";
import { GarmentArt } from "@/components/store/garment-art";
import { Price } from "@/components/store/price";
import { SizePicker } from "@/components/store/size-picker";
import { useStoreUI } from "@/components/store/store-ui-provider";
import { Swatches } from "@/components/store/swatches";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  aimRail,
  createRailSim,
  footprint,
  type HangerShots,
  hangerShots,
  RAIL_ASPECT,
  RAIL_HOOK_TOP,
  RAIL_REST,
  railLayout,
  railLight,
  railTargets,
  SIDE_WIDTH,
  stepRailSim,
} from "@/lib/catalog/rail";
import type { Product, ProductImage } from "@/lib/commerce/types";
import { formatINR, percentOff } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * PLP-08 ProductRailGallery — a showroom clothing rail above a collection's product grid.
 * Design after the 21st.dev "clothing rail hero" (docs/rail.md), rebuilt on this store's tokens, photos and
 * commerce types. Geometry and physics are pure and unit-tested in lib/catalog/rail.ts.
 *
 * - Every hanger is one box (photo canvas 1000 × 1250, hook tip at the top centre). Garments hang side-on and
 *   take only their side width; hover / focus / first tap turns one to face you (rotateY from −70° with the side
 *   photo handing over to the front photo half way) and its neighbours slide apart, so nothing covers it.
 * - Drag a garment along the rail: neighbours are shoved, released garments swing and spring back.
 * - Phones (too narrow for a row): a carousel — one garment faces you in the middle, swipe or use the dots.
 * - A price tag hangs from each hook; the faced garment's name and price show in a caption under the rail.
 * - Click / Enter / second tap lifts it off the rail (FLIP) into a dialog: drag or buttons spin front ↔ back,
 *   side view, colours, sizes, quick add (Radix Dialog: focus trap, Escape, focus returns to the hanger).
 * - prefers-reduced-motion: no physics, swing or lift; turning is an instant state change.
 * Transforms and opacity only, painted from one rAF loop that stops when the rail is still.
 * Prices shown here are display only — the cart re-prices on the server.
 */

export interface ProductRailGalleryProps {
  products: Product[];
  /** Small label above the title, e.g. the collection name. */
  eyebrow?: string;
  title?: string;
  /** Caption under the rail while no garment faces you. */
  hint?: string;
  /** Drawn hanger for products without hanger photos. */
  hangerStyle?: "wood" | "metal";
  /** Called when a garment is lifted off (opened) or put back (closed). */
  onOpenChange?: (open: boolean, product: Product) => void;
  className?: string;
}

const PERSPECTIVE = 1100;
const RAIL_Y = 14;
/** Rendered hanger widths for the srcset (box = 0.8 × h, h ≤ 300 desktop, ≤ 250 phones). */
const HANGER_SIZES = "(min-width: 640px) 240px, 200px";
const DRAG_THRESHOLD = 6;
const gutter = "mx-auto max-w-[1440px] px-2.5 lg:px-10";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function imageFor(product: Product, view: ProductImage["view"]) {
  return product.images.find((im) => im.view === view) ?? product.images[0];
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Chrome hook for drawn hangers, in the same 80 × 100 box units as the photos (tip at RAIL_HOOK_TOP). */
function DrawnHook() {
  return (
    <svg aria-hidden="true" viewBox="0 0 80 100" preserveAspectRatio="xMidYMin meet" className="pointer-events-none absolute inset-0 size-full overflow-visible">
      <path d="M40 10 V5.2 C40 3.2 43.4 1.2 45.2 3.2 C46 4.1 46 5.4 45.4 6.2" fill="none" stroke="#6b6b6b" strokeWidth={1.3} strokeLinecap="round" />
      <path d="M40 10 V5.2 C40 3.6 42.6 1.9 44.1 3" fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={0.4} strokeLinecap="round" />
      <rect x={38.6} y={9} width={2.8} height={3.2} fill="#5f5f5f" />
    </svg>
  );
}

/** Hanger bar across the shoulders of a drawing (turns with the garment). */
function DrawnShoulders({ style }: { style: "wood" | "metal" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 80 100" preserveAspectRatio="xMidYMin meet" className="pointer-events-none absolute inset-0 size-full">
      {style === "wood" ? (
        <path d="M40 11.5 L11 19.5 Q9.5 21 11.5 21 H68.5 Q70.5 21 69 19.5 Z" fill="#9b6b43" />
      ) : (
        <path d="M40 12 L11 20.5 H69 Z" fill="none" stroke="#8c8c8c" strokeWidth={1.1} strokeLinejoin="round" />
      )}
    </svg>
  );
}

export function ProductRailGallery({
  products,
  eyebrow,
  title = "Pick off the rail",
  hint = "Hover or tap a hanger to turn it. Drag to slide it along; open it to see the back.",
  hangerStyle = "wood",
  onOpenChange,
  className,
}: ProductRailGalleryProps) {
  const headingId = useId();
  const captionId = useId();
  const reduced = usePrefersReducedMotion();
  const count = products.length;
  const shots = useMemo(() => products.map((p) => hangerShots(p)), [products]);
  const sideWidths = useMemo(() => shots.map((s) => (s ? SIDE_WIDTH.photo : SIDE_WIDTH.drawing)), [shots]);

  const stageRef = useRef<HTMLDivElement>(null);
  const slots = useRef<(HTMLButtonElement | null)[]>([]);
  const swings = useRef<(HTMLSpanElement | null)[]>([]);
  const fronts = useRef<(HTMLSpanElement | null)[]>([]);
  const sides = useRef<(HTMLSpanElement | null)[]>([]);
  const shades = useRef<(HTMLSpanElement | null)[]>([]);
  const shadows = useRef<(HTMLSpanElement | null)[]>([]);
  const tags = useRef<(HTMLSpanElement | null)[]>([]);
  const sim = useRef(createRailSim());
  const raf = useRef(0);
  const lastFrame = useRef(0);

  const [size, setSize] = useState({ width: 0, h: 0, carousel: false });
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  /**
   * Front photos load once the rail is warm: first pointer / focus / touch on it, or the browser going idle after
   * load. The first paint fetches only the side shots.
   */
  const [warm, setWarm] = useState(false);
  const pointer = useRef({ id: -1, index: -1, x: 0, y: 0, moved: false, touch: false, lastX: 0, lastT: 0, v: 0, grab: 0 });

  /** Latest render values for the rAF loop and pointer handlers (updated after every commit). */
  const live = useRef({ size, reduced, active, open, carouselIndex, sideWidths, count });
  useLayoutEffect(() => {
    live.current = { size, reduced, active, open, carouselIndex, sideWidths, count };
  });
  const front = size.carousel ? (active ?? carouselIndex) : active;

  useEffect(() => {
    if (warm) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setWarm(true), { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setWarm(true), 2500);
    return () => window.clearTimeout(t);
  }, [warm]);

  // Box height from the stage width, capped by the stage's reserved CSS height (no layout shift on hydration).
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const width = stage.clientWidth;
      const room = (stage.clientHeight - RAIL_Y - 10) / 1.07;
      const layout = railLayout(width, live.current.sideWidths);
      const h = Math.round(Math.min(layout.h, room));
      setSize((old) => (old.width === width && old.h === h && old.carousel === layout.carousel ? old : { width, h, carousel: layout.carousel }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [count]);

  const paint = useCallback((i: number) => {
    const s = sim.current;
    const { h } = live.current.size;
    const w = h * RAIL_ASPECT;
    const slot = slots.current[i];
    if (!slot) return;
    const angle = s.turn[i] ?? RAIL_REST;
    slot.style.transform = `translate3d(${((s.x[i] ?? 0) - w / 2).toFixed(2)}px,0,0)`;
    const sw = swings.current[i];
    if (sw) sw.style.transform = `rotate(${(s.swing[i] ?? 0).toFixed(3)}deg)`;
    const e = clamp(1 - angle / RAIL_REST, 0, 1);
    const side = sides.current[i];
    const face = fronts.current[i];
    if (face) {
      face.style.transform = `perspective(${PERSPECTIVE}px) rotateY(${angle.toFixed(2)}deg)`;
      face.style.opacity = side ? clamp((e - 0.44) / 0.12, 0, 1).toFixed(3) : "1";
    }
    if (side) {
      side.style.opacity = clamp((0.56 - e) / 0.12, 0, 1).toFixed(3);
      side.style.transform = `perspective(${PERSPECTIVE}px) rotateY(${(Math.min(1, e * 2) * -84).toFixed(2)}deg)`;
    }
    const shade = shades.current[i];
    if (shade) shade.style.opacity = (1 - railLight(angle)).toFixed(3);
    const shadow = shadows.current[i];
    if (shadow) shadow.style.transform = `translate3d(${(w * 0.05).toFixed(1)}px,${(h * 0.035).toFixed(1)}px,0) scaleX(${Math.max(0.12, Math.abs(Math.cos((angle * Math.PI) / 180))).toFixed(3)})`;
    const tag = tags.current[i];
    if (tag) tag.style.transform = `rotate(${(-10 + (s.tag[i] ?? 0)).toFixed(2)}deg)`;
  }, []);

  /** One animation frame; reschedules itself through `frameRef` while anything moves. */
  const frameRef = useRef<FrameRequestCallback | null>(null);
  useEffect(() => {
    const frame = (t: number) => {
      const dt = lastFrame.current ? (t - lastFrame.current) / 1000 : 1 / 60;
      lastFrame.current = t;
      const { h, width, carousel } = live.current.size;
      const busy = stepRailSim(sim.current, { dt, now: t, h, width, carousel, sideWidths: live.current.sideWidths });
      for (let i = 0; i < live.current.count; i++) paint(i);
      if (busy) raf.current = requestAnimationFrame(frame);
      else {
        raf.current = 0;
        lastFrame.current = 0;
      }
    };
    frameRef.current = frame;
  }, [paint]);

  const kick = useCallback(() => {
    if (live.current.reduced || raf.current || !frameRef.current) return;
    lastFrame.current = 0;
    raf.current = requestAnimationFrame(frameRef.current);
  }, []);

  const impulse = useCallback(
    (i: number, amount: number) => {
      if (live.current.reduced || i < 0 || i >= live.current.count) return;
      const s = sim.current;
      s.vswing[i] = (s.vswing[i] ?? 0) + amount;
      kick();
    },
    [kick],
  );

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Slots and turns follow the layout and the faced garment.
  useLayoutEffect(() => {
    if (!size.width || !size.h) return;
    const s = sim.current;
    const fresh = s.x.length !== count;
    aimRail(s, railTargets(size.h, size.width, size.carousel, front, sideWidths), front, fresh || reduced);
    if (fresh || reduced) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      for (let i = 0; i < count; i++) paint(i);
    }
    kick();
  }, [size, front, count, sideWidths, reduced, paint, kick]);

  // One brush along the rail when it first scrolls into view (settles in ~2 s).
  useEffect(() => {
    const el = stageRef.current;
    if (!el || reduced || !size.width || typeof IntersectionObserver === "undefined") return;
    const timers: number[] = [];
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        for (let i = 0; i < count; i++) timers.push(window.setTimeout(() => impulse(i, 46 - i * 2.5), 120 + i * 55));
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [count, impulse, reduced, size.width]);

  const choose = useCallback(
    (index: number | null) => {
      const old = live.current.active;
      if (old === index) return;
      if (index !== null) {
        impulse(index - 1, -30);
        impulse(index + 1, 30);
        if (live.current.size.carousel) setCarouselIndex(index);
      }
      if (old !== null) {
        impulse(old - 1, 14);
        impulse(old + 1, -14);
      }
      setActive(index);
    },
    [impulse],
  );

  /** Hanger to hand focus back to when the dialog closes (no Dialog.Trigger, so Radix can't know). */
  const returnTo = useRef<number | null>(null);
  const openItem = (i: number) => {
    returnTo.current = i;
    choose(i);
    setOpen(i);
    onOpenChange?.(true, products[i]);
  };
  const closeItem = () => {
    if (open === null) return;
    const closing = products[open];
    impulse(open, (open % 2 ? 1 : -1) * 44);
    setOpen(null);
    onOpenChange?.(false, closing);
  };

  /** Garment under the pointer by its current footprint (not the box), so you grab the one you see. */
  const nearest = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const box = stage.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    const { h } = live.current.size;
    if (y < 0 || y > RAIL_Y + h * 1.04) return null;
    const s = sim.current;
    let best: number | null = null;
    let distance = Infinity;
    for (let i = 0; i < live.current.count; i++) {
      const half = footprint(h, s.turn[i] ?? RAIL_REST, live.current.sideWidths[i]) / 2 + 4;
      const d = Math.abs(x - (s.x[i] ?? 0));
      if (d < half && d < distance) {
        best = i;
        distance = d;
      }
    }
    return best;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    setWarm(true);
    if (e.button !== 0) return;
    const now = e.timeStamp;
    pointer.current = { id: e.pointerId, index: nearest(e.clientX, e.clientY) ?? -1, x: e.clientX, y: e.clientY, moved: false, touch: e.pointerType !== "mouse", lastX: e.clientX, lastT: now, v: 0, grab: 0 };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    const s = sim.current;
    const stage = stageRef.current;
    if (p.id === e.pointerId && stage) {
      const dx = e.clientX - p.x;
      const now = e.timeStamp;
      if (!p.moved && Math.abs(dx) > DRAG_THRESHOLD && Math.abs(dx) > Math.abs(e.clientY - p.y)) {
        if (live.current.reduced && !live.current.size.carousel) return;
        p.moved = true;
        stage.setPointerCapture(e.pointerId);
        if (!live.current.size.carousel && p.index >= 0) {
          s.drag = p.index;
          p.grab = e.clientX - stage.getBoundingClientRect().left - (s.x[p.index] ?? 0);
        }
      }
      if (!p.moved) return;
      p.v = p.v * 0.6 + ((e.clientX - p.lastX) / Math.max(1, now - p.lastT)) * 0.4;
      p.lastX = e.clientX;
      p.lastT = now;
      if (s.drag >= 0) {
        const left = stage.getBoundingClientRect().left;
        s.x[s.drag] = e.clientX - left - p.grab;
        s.vx[s.drag] = p.v * 1000;
        s.free = now + 900;
        kick();
      } else if (live.current.size.carousel) {
        const { h, width } = live.current.size;
        const xs = railTargets(h, width, true, live.current.active ?? live.current.carouselIndex, live.current.sideWidths);
        xs.forEach((x, i) => (s.tx[i] = x + dx));
        kick();
      }
      return;
    }
    // Mouse hover turns the garment under the pointer (rail mode only).
    if (e.pointerType !== "mouse" || live.current.size.carousel || live.current.open !== null) return;
    const hit = nearest(e.clientX, e.clientY);
    const current = live.current.active;
    if (current !== null && hit !== current && stage) {
      // Stay on the faced garment while the pointer is still over its (wide) front.
      const box = stage.getBoundingClientRect();
      if (Math.abs(e.clientX - box.left - (s.x[current] ?? 0)) < footprint(live.current.size.h, 0, 0) / 2 + 10) return;
    }
    if (hit !== null) choose(hit);
  };

  const finishPointer = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const p = pointer.current;
    if (p.id !== e.pointerId) return;
    const s = sim.current;
    const stage = stageRef.current;
    if (stage?.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    pointer.current = { ...p, id: -1 };
    if (s.drag >= 0) {
      s.drag = -1;
      s.free = e.timeStamp + 700;
      kick();
      return;
    }
    if (p.moved && live.current.size.carousel) {
      const dx = e.clientX - p.x;
      const current = live.current.active ?? live.current.carouselIndex;
      const step = Math.abs(dx) > 40 || Math.abs(p.v) > 0.45 ? (dx < 0 ? 1 : -1) : 0;
      const next = clamp(current + step, 0, live.current.count - 1);
      choose(next);
      setCarouselIndex(next);
      const { h, width } = live.current.size;
      aimRail(s, railTargets(h, width, true, next, live.current.sideWidths), next, live.current.reduced);
      for (let i = 0; i < live.current.count; i++) impulse(i, clamp(-p.v * 22, -30, 30));
      kick();
      return;
    }
    if (cancelled || p.moved || p.index < 0) return;
    // Touch has no hover: the first tap turns a garment, a tap on the faced one lifts it off. Mouse click opens.
    if (p.touch && (live.current.size.carousel ? (live.current.active ?? live.current.carouselIndex) : live.current.active) !== p.index) choose(p.index);
    else openItem(p.index);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const from = active ?? focusIndex;
    const next = e.key === "Home" ? 0 : e.key === "End" ? count - 1 : clamp(from + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1), 0, count - 1);
    setFocusIndex(next);
    choose(next);
    slots.current[next]?.focus({ preventScroll: true });
  };

  const h = size.h;
  const boxW = h * RAIL_ASPECT;
  const ready = size.width > 0 && h > 0;
  const current = front === null ? null : products[front];
  const currentOff = current ? percentOff(current.price, current.mrp) : 0;

  return (
    <section aria-labelledby={headingId} className={cn(gutter, "mt-5 lg:mt-7", className)}>
      <div className="px-1.5 lg:px-0">
        {eyebrow ? <p className="type-label text-ink-2">{eyebrow}</p> : null}
        <h2 id={headingId} className="type-section mt-1">
          {title}
        </h2>
      </div>

      <div className="relative mt-3 overflow-hidden bg-soft lg:mt-4">
        {/* Soft light from the top-left and a floor shade, like a shop wall. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(120% 70% at 18% 0%, rgba(255,255,255,0.7), transparent 62%), linear-gradient(to bottom, transparent 62%, rgba(0,0,0,0.045))" }}
        />
        <div
          ref={stageRef}
          role="group"
          aria-labelledby={headingId}
          aria-describedby={captionId}
          aria-roledescription="clothing rail"
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finishPointer(e, false)}
          onPointerCancel={(e) => finishPointer(e, true)}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse" && pointer.current.id < 0 && !live.current.size.carousel && !slots.current.some((b) => b === document.activeElement && b?.matches(":focus-visible"))) choose(null);
          }}
          onFocus={() => setWarm(true)}
          className="relative h-[284px] touch-pan-y select-none [-webkit-tap-highlight-color:transparent] sm:h-[336px]"
          style={{ overflowX: "clip" } as CSSProperties}
        >
          {/* The rail: a brushed steel rod on two wall brackets. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0" style={{ top: RAIL_Y - 3, height: 6 }}>
            <div className="absolute inset-x-0 top-[7px] h-3 bg-black/10 blur-[5px]" />
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: "linear-gradient(to bottom, #b9b9b9 0%, #f6f6f6 22%, #9a9a9a 45%, #6e6e6e 70%, #3a3a3a 100%)", boxShadow: "0 1px 0 rgba(0,0,0,0.18)" }}
            />
            {[0, 1].map((side) => (
              <div
                key={side}
                className="absolute top-1/2 h-7 w-3.5 -translate-y-1/2"
                style={{ [side ? "right" : "left"]: 6, background: "linear-gradient(to right, #c9c9c9, #8a8a8a 55%, #4f4f4f)", boxShadow: "0 3px 6px rgba(0,0,0,0.18)" }}
              />
            ))}
          </div>

          {products.map((p, i) => {
            const shot = shots[i];
            const off = percentOff(p.price, p.mrp);
            const showFront = warm || front === i;
            return (
              <button
                key={p.id}
                ref={(el) => {
                  slots.current[i] = el;
                }}
                type="button"
                tabIndex={i === (active ?? focusIndex) ? 0 : -1}
                aria-haspopup="dialog"
                aria-label={`${p.title}, ${formatINR(p.price)}${off ? `, ${off}% off` : ""}. Open details`}
                onFocus={() => {
                  setFocusIndex(i);
                  if (pointer.current.id < 0) choose(i);
                }}
                onClick={(e) => {
                  // Keyboard (Enter / Space) only; pointers are handled on the stage.
                  if (e.detail === 0) openItem(i);
                }}
                className={cn(
                  "pointer-events-none absolute left-0 outline-none transition-opacity duration-300 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink",
                  ready ? "opacity-100" : "opacity-0",
                )}
                style={{
                  top: RAIL_Y - RAIL_HOOK_TOP * h,
                  width: boxW,
                  height: h,
                  zIndex: front === i ? 30 : 10 + i,
                  visibility: open === i ? "hidden" : undefined,
                }}
              >
                <span
                  ref={(el) => {
                    swings.current[i] = el;
                  }}
                  className="absolute inset-0 will-change-transform"
                  style={{ transformOrigin: `50% ${RAIL_HOOK_TOP * 100}%` }}
                >
                  {/* Floor shadow in the garment's own shape (photos), narrowing as it turns side-on. */}
                  {shot && showFront ? (
                    <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.16]">
                      <span
                        ref={(el) => {
                          shadows.current[i] = el;
                        }}
                        className="absolute inset-0 will-change-transform"
                      >
                        <Image src={shot.front.url} alt="" fill sizes={HANGER_SIZES} draggable={false} className="object-contain object-top blur-[5px] brightness-0" />
                      </span>
                    </span>
                  ) : null}

                  {shot ? null : <DrawnHook />}

                  {shot ? (
                    <span
                      ref={(el) => {
                        sides.current[i] = el;
                      }}
                      className="absolute inset-0 will-change-transform"
                    >
                      <Image src={shot.side.url} alt="" fill loading="eager" sizes={HANGER_SIZES} draggable={false} className="object-contain object-top" />
                    </span>
                  ) : null}

                  <span
                    ref={(el) => {
                      fronts.current[i] = el;
                    }}
                    className="absolute inset-0 will-change-transform"
                    style={{ transform: `perspective(${PERSPECTIVE}px) rotateY(${RAIL_REST}deg)`, opacity: shot ? 0 : 1 }}
                  >
                    {shot ? (
                      showFront ? (
                        <>
                          <Image
                            src={shot.front.url}
                            alt=""
                            fill
                            sizes={HANGER_SIZES}
                            draggable={false}
                            className="object-contain object-top"
                            onLoad={(e) => {
                              // Light falls off as the garment turns away: a black layer masked to the garment's
                              // own outline (same file, already in the cache), opacity driven by the turn.
                              const shade = shades.current[i];
                              const url = e.currentTarget.currentSrc;
                              if (shade && url) {
                                const mask = `url("${url}") top center / contain no-repeat`;
                                shade.style.setProperty("mask", mask);
                                shade.style.setProperty("-webkit-mask", mask);
                                shade.style.display = "block";
                              }
                            }}
                          />
                          <span
                            ref={(el) => {
                              shades.current[i] = el;
                            }}
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 hidden bg-black"
                            style={{ opacity: 1 - railLight(RAIL_REST) }}
                          />
                        </>
                      ) : null
                    ) : (
                      <>
                        <GarmentArt image={{ ...imageFor(p, "front"), alt: "" }} className="absolute inset-x-0 bottom-0 top-[11%] bg-transparent" artClassName="top-[44%] size-[96%]" />
                        <DrawnShoulders style={hangerStyle} />
                      </>
                    )}
                  </span>

                  {/* Price tag on a string from the hook. */}
                  <span
                    ref={(el) => {
                      tags.current[i] = el;
                    }}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 origin-top"
                    style={{ top: `${(RAIL_HOOK_TOP + 0.075) * 100}%`, transform: "rotate(-10deg)" }}
                  >
                    <span className="ml-[3px] block h-3 w-px bg-ink/35" />
                    <span className="relative -ml-px block whitespace-nowrap border border-black/10 bg-white px-1.5 pb-1 pt-2 text-[9px] font-bold leading-none tracking-wide text-ink shadow-[0_2px_6px_rgba(0,0,0,0.14)] lg:text-[10px]">
                      <span className="absolute left-[3px] top-[3px] size-[3px] rounded-full bg-ink/30" />
                      {formatINR(p.price)}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative flex h-3 items-center justify-center gap-1.5" role={size.carousel && count > 1 ? "group" : undefined} aria-label={size.carousel && count > 1 ? "Choose a garment" : undefined}>
          {size.carousel && count > 1
            ? products.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  aria-label={`Show ${p.title}`}
                  aria-current={front === i}
                  onClick={() => {
                    choose(i);
                    setCarouselIndex(i);
                  }}
                  className={cn("h-1.5 transition-[width,background-color] duration-300", front === i ? "w-6 bg-ink" : "w-1.5 bg-ink/25 hover:bg-ink/45")}
                />
              ))
            : null}
        </div>

        <div id={captionId} aria-live="polite" className="relative flex min-h-[64px] flex-col items-center justify-center px-4 pb-4 pt-2 text-center">
          {current ? (
            <>
              <p className="max-w-full truncate text-[13px] font-medium lg:text-[14px]">{current.title}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <Price price={current.price} mrp={current.mrp} size="line" />
                {currentOff >= 30 ? <Badge tone="red">−{currentOff}%</Badge> : null}
              </div>
            </>
          ) : (
            <p className="text-[12px] text-ink-2 lg:text-[13px]">
              {hint}
              <span className="sr-only"> Use the arrow keys to move along the rail and Enter to open a garment.</span>
            </p>
          )}
        </div>
      </div>

      <Dialog.Root
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) closeItem();
        }}
      >
        {open !== null && products[open] ? (
          <RailDialog
            key={products[open].id}
            product={products[open]}
            shots={shots[open]}
            hangerStyle={hangerStyle}
            reduced={reduced}
            source={() => slots.current[open]?.getBoundingClientRect() ?? null}
            onDone={closeItem}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              if (returnTo.current !== null) slots.current[returnTo.current]?.focus({ preventScroll: true });
            }}
          />
        ) : null}
      </Dialog.Root>
    </section>
  );
}

type View = "front" | "back" | "side";

/**
 * The garment lifted off the rail: it flies from its hanger into the dialog (FLIP), then spins front ↔ back
 * (drag or buttons; spring) — plus the side shot for photographed colours. Price, colours, sizes, quick add, PDP link.
 */
function RailDialog({
  product,
  shots,
  hangerStyle,
  reduced,
  source,
  onDone,
  onCloseAutoFocus,
}: {
  product: Product;
  shots: HangerShots | null;
  hangerStyle: "wood" | "metal";
  reduced: boolean;
  source: () => DOMRect | null;
  onDone: () => void;
  onCloseAutoFocus: (e: Event) => void;
}) {
  const { addToBag } = useStoreUI();
  const [size, setSize] = useState<string>();
  const [view, setView] = useState<View>("front");
  const figureRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const angle = useRef({ value: 0, target: 0, velocity: 0, raf: 0, last: 0, dragging: false, startX: 0, startAngle: 0, moved: false });
  const off = percentOff(product.price, product.mrp);
  const oneSize = product.sizes.length === 1;
  const chosen = oneSize ? product.sizes[0].label : size;
  const views: View[] = shots ? ["front", "back", "side"] : ["front", "back"];
  const backImage = shots ? (shots.back ?? shots.front) : null;

  const apply = (v: number) => {
    if (spinRef.current) spinRef.current.style.transform = `rotateY(${v.toFixed(2)}deg)`;
  };

  const spin = useCallback(() => {
    const a = angle.current;
    if (reduced) {
      a.value = a.target;
      apply(a.value);
      return;
    }
    const loop = (now: number) => {
      const dt = a.last ? Math.min(0.034, (now - a.last) / 1000) : 1 / 60;
      a.last = now;
      a.velocity += (-90 * (a.value - a.target) - 2 * Math.sqrt(90) * 0.82 * a.velocity) * dt;
      a.value += a.velocity * dt;
      apply(a.value);
      if (Math.abs(a.value - a.target) < 0.05 && Math.abs(a.velocity) < 0.05) {
        a.value = a.target;
        apply(a.value);
        a.raf = 0;
        a.last = 0;
        return;
      }
      a.raf = requestAnimationFrame(loop);
    };
    if (!a.raf) a.raf = requestAnimationFrame(loop);
  }, [reduced]);

  const turnTo = useCallback(
    (next: View) => {
      setView(next);
      if (next === "side") return;
      const a = angle.current;
      const base = Math.round(a.value / 360) * 360;
      a.target = base + (next === "back" ? 180 : 0);
      if (Math.abs(a.target - a.value) > 180) a.target -= 360 * Math.sign(a.target - a.value);
      spin();
    },
    [spin],
  );

  useEffect(() => () => cancelAnimationFrame(angle.current.raf), []);

  // Lift: fly from the hanger's box on the rail to the dialog figure (transform only).
  useLayoutEffect(() => {
    const figure = figureRef.current;
    const from = source();
    if (!figure || !from || reduced || from.width === 0) return;
    const to = figure.getBoundingClientRect();
    if (to.height === 0) return;
    const scale = from.height / to.height;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top - to.top;
    const lift = Math.min(90, Math.abs(dy) * 0.25 + 30);
    const anim = figure.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
        { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - lift}px) scale(${((scale + 1) / 2) * 1.03}) rotate(${dx > 0 ? -2.5 : 2.5}deg)`, offset: 0.5 },
        { transform: "none" },
      ],
      { duration: 640, easing: "cubic-bezier(.22,.85,.3,1)" },
    );
    return () => anim.cancel();
  }, [source, reduced]);

  const faceFor = (face: "front" | "back") =>
    shots ? (
      <Image
        src={face === "front" ? shots.front.url : backImage!.url}
        alt={face === "front" ? (shots.front.alt || `${product.title}, front`) : ""}
        fill
        priority={face === "front"}
        sizes="(min-width: 1024px) 420px, 80vw"
        draggable={false}
        className={cn("object-contain object-top", face === "back" && !shots.back && "-scale-x-100")}
      />
    ) : (
      <>
        <DrawnHook />
        <GarmentArt image={{ ...imageFor(product, face), alt: face === "front" ? `${product.title}, front` : "" }} className="absolute inset-x-0 bottom-0 top-[11%] bg-transparent" artClassName="top-[44%] size-[96%]" />
        <DrawnShoulders style={hangerStyle} />
      </>
    );

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Dialog.Content
        onCloseAutoFocus={onCloseAutoFocus}
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(92dvh,780px)] w-[min(94vw,920px)] -translate-x-1/2 -translate-y-1/2 flex-col bg-white outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 lg:px-6">
          <div className="min-w-0">
            <Dialog.Title className="truncate text-[14px] font-semibold lg:text-[16px]">{product.title}</Dialog.Title>
            <Dialog.Description className="text-[12px] text-ink-2">Lifted off the rail · {product.colour.name}</Dialog.Description>
          </div>
          <Dialog.Close aria-label="Close" className="-mr-2 grid size-10 shrink-0 place-items-center hover:bg-soft">
            <Icon icon={Cancel01Icon} size={20} />
          </Dialog.Close>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:p-6">
          <div>
            <div className="relative bg-soft px-[6%] pt-[4%]">
              <div ref={figureRef} className="relative mx-auto aspect-[4/5] max-h-[44dvh] origin-top lg:max-h-[520px]">
                <div
                  className="absolute inset-0 cursor-grab touch-pan-y active:cursor-grabbing"
                  style={{ perspective: "1400px" }}
                  onPointerDown={(e) => {
                    if (view === "side") return;
                    const a = angle.current;
                    Object.assign(a, { dragging: true, moved: false, startX: e.clientX, startAngle: a.value, last: 0 });
                    cancelAnimationFrame(a.raf);
                    a.raf = 0;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const a = angle.current;
                    if (!a.dragging) return;
                    a.moved ||= Math.abs(e.clientX - a.startX) > 3;
                    a.value = clamp(a.startAngle + (e.clientX - a.startX) * 0.45, a.startAngle - 220, a.startAngle + 220);
                    apply(a.value);
                  }}
                  onPointerUp={() => {
                    const a = angle.current;
                    if (!a.dragging) return;
                    a.dragging = false;
                    const facing = ((a.value % 360) + 360) % 360;
                    turnTo(facing > 90 && facing < 270 ? "back" : "front");
                  }}
                  onPointerCancel={() => {
                    angle.current.dragging = false;
                    turnTo(view === "back" ? "back" : "front");
                  }}
                >
                  <div ref={spinRef} className={cn("absolute inset-0 transition-opacity duration-300 [transform-style:preserve-3d]", view === "side" && "opacity-0")}>
                    <div className="absolute inset-0 [backface-visibility:hidden]">{faceFor("front")}</div>
                    <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">{faceFor("back")}</div>
                  </div>
                  {shots ? (
                    <Image
                      src={shots.side.url}
                      alt={view === "side" ? (shots.side.alt || `${product.title}, side`) : ""}
                      fill
                      sizes="(min-width: 1024px) 420px, 80vw"
                      draggable={false}
                      aria-hidden={view !== "side"}
                      className={cn("pointer-events-none object-contain object-top transition-opacity duration-300", view === "side" ? "opacity-100" : "opacity-0")}
                    />
                  ) : null}
                </div>
              </div>
              {off >= 30 ? (
                <div className="pointer-events-none absolute left-2.5 top-2.5">
                  <Badge tone="red">−{off}%</Badge>
                </div>
              ) : null}
            </div>
            <div role="group" aria-label="View" className="mt-3 flex justify-center gap-1.5">
              {views.map((v) => {
                const pressed = v === view;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => turnTo(v)}
                    className={cn("h-9 min-w-20 border px-3 text-[11.5px] font-bold uppercase tracking-[0.12em]", pressed ? "border-black bg-black text-white" : "border-line hover:border-black")}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-center text-[11.5px] text-muted">Drag the garment to spin it.</p>
          </div>

          <div className="flex flex-col">
            <Price price={product.price} mrp={product.mrp} size="pdp" />
            <p className="mt-1 text-[11.5px] text-muted">Inclusive of all taxes</p>
            {product.colours.length > 1 ? (
              <div className="mt-4">
                <p className="type-label mb-2">Colour · <span className="font-medium normal-case tracking-normal text-ink-2">{product.colour.name}</span></p>
                <Swatches colours={product.colours} max={8} />
              </div>
            ) : null}
            {!oneSize ? <SizePicker sizes={product.sizes} value={size} onChange={setSize} className="mt-5" /> : null}
            <div className="mt-6 flex flex-col gap-2.5">
              <Button
                size="lg"
                className="w-full"
                disabled={!chosen}
                onClick={() => {
                  if (!chosen) return;
                  addToBag(product, chosen);
                  onDone();
                }}
              >
                {chosen ? "Add to bag" : "Select a size"}
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link href={`/products/${product.handle}`}>View full details</Link>
              </Button>
            </div>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
