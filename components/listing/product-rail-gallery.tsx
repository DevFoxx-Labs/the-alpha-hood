"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/store/badges";
import { GarmentArt } from "@/components/store/garment-art";
import { Price } from "@/components/store/price";
import { SizePicker } from "@/components/store/size-picker";
import { useStoreUI } from "@/components/store/store-ui-provider";
import { Swatches } from "@/components/store/swatches";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { type RailBody, stepRail } from "@/lib/catalog/rail";
import type { Product, ProductImage } from "@/lib/commerce/types";
import { formatINR, percentOff } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * PLP-08 ProductRailGallery — a showroom clothing rail above a collection's product grid.
 * Inspired by 21st.dev "product-rail-gallery" (DHxWhy, MIT); written for this store's tokens,
 * GarmentArt placeholders and commerce types.
 *
 * - Hangers sit side-on; hover / focus / first tap turns one to face you (perspective rotateY).
 * - Drag a hanger: neighbours get pushed along the rail, released garments swing and settle
 *   (`stepRail`, 1-D spring + pendulum, rAF only while something moves, transforms only).
 * - Click / Enter / second tap lifts it off the rail into a dialog with front + back views and quick add
 *   (Radix Dialog: focus trap, Escape, focus returns to the hanger).
 * - Arrow keys / Home / End move along the rail (roving tabindex).
 * - prefers-reduced-motion: no physics or swing; turning is an instant state change.
 * Prices shown here are display only — the cart re-prices on the server.
 */

export interface ProductRailGalleryProps {
  products: Product[];
  /** Small label above the title, e.g. the collection name. */
  eyebrow?: string;
  title?: string;
  hint?: string;
  hangerStyle?: "wood" | "metal";
  /** Called when a garment is lifted off (opened) or put back (closed). */
  onOpenChange?: (open: boolean, product: Product) => void;
  className?: string;
}

/** Hangers shown per breakpoint (<640, <1024, ≥1024); extras are hidden so the rail never gets cramped. */
const VISIBLE = { sm: 5, md: 6, lg: 8 } as const;
/** Closest two hooks may get, as a share of a hanger's width (a side-on garment is ~60% wide). */
const MIN_GAP_RATIO = 0.62;
const DRAG_THRESHOLD = 6;

const gutter = "mx-auto max-w-[1440px] px-2.5 lg:px-10";

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

function Hook() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 30" className="relative z-10 -mb-px h-[26px] w-[21px] shrink-0">
      <path d="M12 30 V17 C12 12 19 12 19 6.5 C19 2.5 15.5 1 12.5 1.5 C10 2 8.6 3.8 8.6 6" fill="none" stroke="#5f5f5f" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function Shoulders({ style }: { style: "wood" | "metal" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 14" preserveAspectRatio="none" className="absolute inset-x-[8%] top-[2%] z-10 h-3 lg:h-3.5">
      {style === "wood" ? (
        <path d="M50 1 L3 11 Q1 13 4 13 H96 Q99 13 97 11 Z" fill="#9b6b43" />
      ) : (
        <path d="M50 1.5 L3 12 H97 Z" fill="none" stroke="#8c8c8c" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export function ProductRailGallery({
  products,
  eyebrow,
  title = "Pick off the rail",
  hint = "Drag the hangers. Hover or tap to turn one, then open it to see the back.",
  hangerStyle = "wood",
  onOpenChange,
  className,
}: ProductRailGalleryProps) {
  const headingId = useId();
  const hintId = useId();
  const reduced = usePrefersReducedMotion();
  const [faced, setFaced] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const swingRefs = useRef<(HTMLDivElement | null)[]>([]);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const bodies = useRef<RailBody[]>([]);
  const raf = useRef<number | null>(null);
  const lastFrame = useRef(0);
  const drag = useRef<{ index: number; pointerId: number; startX: number; startOffset: number; moved: boolean; target: number } | null>(null);
  const suppressClick = useRef(false);
  const tapState = useRef<{ touch: boolean; wasFaced: boolean }>({ touch: false, wasFaced: false });

  /** Physics state per hanger, created on first use (never during render). */
  const bodyAt = useCallback((i: number) => (bodies.current[i] ??= { x: 0, v: 0, a: 0, av: 0 }), []);

  /** Indices currently on screen at this breakpoint (hidden ones have no layout box). */
  const visibleIndices = useCallback(
    () => itemRefs.current.flatMap((el, i) => (el && el.offsetParent !== null ? [i] : [])),
    [],
  );

  const paint = useCallback(() => {
    bodies.current.forEach((b, i) => {
      const el = swingRefs.current[i];
      if (el) el.style.transform = b.x || b.a ? `translate3d(${b.x.toFixed(2)}px,0,0) rotate(${b.a.toFixed(2)}deg)` : "";
    });
  }, []);

  /** One animation frame; reschedules itself through `frameRef` while anything moves. */
  const frameRef = useRef<FrameRequestCallback | null>(null);
  useEffect(() => {
    frameRef.current = (t: number) => {
      const dt = lastFrame.current ? (t - lastFrame.current) / 1000 : 1 / 60;
      lastFrame.current = t;
      const vis = visibleIndices();
      const d = drag.current;
      const subset = vis.map(bodyAt);
      const draggedAt = d && d.moved ? vis.indexOf(d.index) : -1;
      const rest = vis.map((i) => itemRefs.current[i]?.offsetLeft ?? 0);
      // Never wider than the resting spacing, or a tightly packed (mobile) rail would push itself apart.
      const spacing = rest.length > 1 ? rest[1] - rest[0] : Infinity;
      const moving = stepRail(subset, {
        rest,
        minGap: Math.min((itemRefs.current[vis[0]]?.offsetWidth ?? 0) * MIN_GAP_RATIO, spacing * 0.92),
        dragged: draggedAt >= 0 ? draggedAt : null,
        target: d?.target ?? 0,
        dt,
      });
      paint();
      if ((moving || drag.current) && frameRef.current) {
        raf.current = requestAnimationFrame(frameRef.current);
      } else {
        raf.current = null;
        lastFrame.current = 0;
      }
    };
  }, [bodyAt, paint, visibleIndices]);

  const kick = useCallback(() => {
    if (reduced || raf.current !== null || !frameRef.current) return;
    lastFrame.current = 0;
    raf.current = requestAnimationFrame(frameRef.current);
  }, [reduced]);

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
  }, []);

  // Reduced motion switched on mid-animation: stop and park every hanger.
  useEffect(() => {
    if (!reduced) return;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    bodies.current.forEach((b) => Object.assign(b, { x: 0, v: 0, a: 0, av: 0 }));
    paint();
  }, [reduced, paint]);

  // One gentle sway when the rail first scrolls into view (settles in ~2 s, so no pause control needed).
  useEffect(() => {
    const el = listRef.current;
    if (!el || reduced || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        products.forEach((_, i) => {
          const b = bodyAt(i);
          b.av += (i % 2 ? -1 : 1) * (40 + (i % 3) * 12);
        });
        kick();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [bodyAt, kick, products, reduced]);

  const face = (i: number | null) => {
    setFaced(i);
    if (i !== null) {
      bodyAt(i).av += 55;
      kick();
    }
  };

  /** Hanger to hand focus back to when the dialog closes (no Dialog.Trigger, so Radix can't know). */
  const returnTo = useRef<number | null>(null);
  const openItem = (i: number) => {
    returnTo.current = i;
    setOpen(i);
    onOpenChange?.(true, products[i]);
  };

  const closeItem = () => {
    if (open === null) return;
    const closing = products[open];
    setOpen(null);
    onOpenChange?.(false, closing);
  };

  const onPointerDown = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    tapState.current = { touch: e.pointerType !== "mouse", wasFaced: faced === i };
    if (e.button !== 0) return;
    drag.current = { index: i, pointerId: e.pointerId, startX: e.clientX, startOffset: bodyAt(i).x, moved: false, target: bodyAt(i).x };
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || reduced) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const li = itemRefs.current[d.index];
    const list = listRef.current;
    if (li && list) {
      const min = -li.offsetLeft;
      const max = list.clientWidth - li.offsetWidth - li.offsetLeft;
      d.target = Math.min(max, Math.max(min, d.startOffset + dx));
    }
    kick();
  };

  const endDrag = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.moved) {
      suppressClick.current = true;
      tapState.current = { touch: false, wasFaced: false };
    }
    drag.current = null;
    kick();
  };

  const onClick = (i: number) => () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    // Touch has no hover: first tap turns the garment, second tap lifts it off.
    if (tapState.current.touch && !tapState.current.wasFaced) {
      tapState.current = { touch: false, wasFaced: false };
      face(i);
      return;
    }
    tapState.current = { touch: false, wasFaced: false };
    openItem(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const vis = visibleIndices();
    if (!vis.length) return;
    const at = Math.max(0, vis.indexOf(active));
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = vis[Math.min(vis.length - 1, at + 1)];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = vis[Math.max(0, at - 1)];
    else if (e.key === "Home") next = vis[0];
    else if (e.key === "End") next = vis[vis.length - 1];
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    buttonRefs.current[next]?.focus();
  };

  const nSm = Math.min(VISIBLE.sm, products.length);
  const nMd = Math.min(VISIBLE.md, products.length);
  const nLg = Math.min(VISIBLE.lg, products.length);
  const listVars = { "--n-sm": nSm, "--n-md": nMd, "--n-lg": nLg } as CSSProperties;
  const openProduct = open !== null ? products[open] : null;

  return (
    <section aria-labelledby={headingId} className={cn(gutter, "mt-5 lg:mt-7", className)}>
      <div className="flex flex-col gap-1 px-1.5 lg:flex-row lg:items-end lg:justify-between lg:px-0">
        <div>
          {eyebrow ? <p className="type-label text-ink-2">{eyebrow}</p> : null}
          <h2 id={headingId} className="type-section mt-1">
            {title}
          </h2>
        </div>
        <p id={hintId} className="text-[12px] text-ink-2 lg:max-w-[340px] lg:text-right lg:text-[13px]">
          {hint}
          <span className="sr-only"> Use the arrow keys to move along the rail and Enter to open a garment.</span>
        </p>
      </div>

      <div className="relative mt-3 h-[192px] overflow-hidden bg-soft sm:h-[232px] lg:mt-4 lg:h-[300px]">
        {/* The rail: a steel bar with two wall brackets. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-[13px] h-[5px] bg-[#2b2b2b] shadow-[0_2px_0_rgba(0,0,0,0.08)]" />
        <div aria-hidden="true" className="absolute left-3 top-0 h-[22px] w-1.5 bg-[#2b2b2b] lg:left-6" />
        <div aria-hidden="true" className="absolute right-3 top-0 h-[22px] w-1.5 bg-[#2b2b2b] lg:right-6" />

        <ul
          ref={listRef}
          aria-labelledby={headingId}
          aria-describedby={hintId}
          onKeyDown={onKeyDown}
          style={listVars}
          className="absolute inset-x-4 bottom-0 top-[5px] [--n:var(--n-sm)] [--w:112px] sm:[--n:var(--n-md)] sm:[--w:140px] lg:inset-x-12 lg:[--n:var(--n-lg)] lg:[--w:190px]"
        >
          {products.map((p, i) => {
            const isFaced = faced === i;
            const off = percentOff(p.price, p.mrp);
            return (
              <li
                key={p.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                style={{
                  // Spread across the rail, but never more than 1.35 hanger-widths apart: a short rail stays a centred cluster.
                  "--step": "min(calc((100% - var(--w)) / max(1, var(--n) - 1)), calc(var(--w) * 1.35))",
                  left: `calc((100% - var(--w) - var(--step) * (var(--n) - 1)) / 2 + var(--step) * ${i})`,
                  zIndex: isFaced ? 40 : i + 1,
                } as CSSProperties}
                className={cn(
                  "pointer-events-none absolute top-0 h-full w-[var(--w)]",
                  i >= nLg ? "hidden" : i >= nMd ? "max-lg:hidden" : i >= nSm && "max-sm:hidden",
                )}
              >
                <div
                  ref={(el) => {
                    swingRefs.current[i] = el;
                  }}
                  className="h-full origin-top will-change-transform"
                >
                  <button
                    ref={(el) => {
                      buttonRefs.current[i] = el;
                    }}
                    type="button"
                    tabIndex={i === active ? 0 : -1}
                    aria-haspopup="dialog"
                    aria-label={`${p.title}, ${formatINR(p.price)}${off ? `, ${off}% off` : ""}. Open details`}
                    data-faced={isFaced}
                    onFocus={() => {
                      setActive(i);
                      face(i);
                    }}
                    onBlur={() => setFaced((f) => (f === i ? null : f))}
                    onPointerEnter={(e) => {
                      if (e.pointerType === "mouse") face(i);
                    }}
                    onPointerLeave={(e) => {
                      if (e.pointerType === "mouse" && document.activeElement !== e.currentTarget) setFaced((f) => (f === i ? null : f));
                    }}
                    onPointerDown={onPointerDown(i)}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onClick={onClick(i)}
                    className="group/hanger pointer-events-none relative flex w-full cursor-grab touch-pan-y select-none flex-col items-center outline-offset-[-2px] active:cursor-grabbing [-webkit-tap-highlight-color:transparent]"
                  >
                    {/* Hit area = the side-on garment's width, so on a packed rail you grab the one you can see. */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-auto absolute inset-y-0 left-[22%] right-[22%] z-20 group-data-[faced=true]/hanger:inset-x-0"
                    />
                    <Hook />
                    <div className="w-full [perspective:900px]">
                      <div
                        className={cn(
                          "relative w-full transition-transform duration-500 ease-out-store [transform-style:preserve-3d]",
                          isFaced ? "[transform:rotateY(0deg)_scale(1.04)]" : "[transform:rotateY(-52deg)]",
                        )}
                      >
                        <Shoulders style={hangerStyle} />
                        <GarmentArt
                          image={{ ...imageFor(p, "front"), alt: "" }}
                          className="aspect-square w-full bg-transparent"
                          artClassName="top-[46%] size-full"
                        />
                      </div>
                    </div>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none mt-1.5 w-[min(100%,170px)] translate-y-1 bg-white px-2 py-1.5 text-left opacity-0 shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-[opacity,transform] duration-200 group-data-[faced=true]/hanger:translate-y-0 group-data-[faced=true]/hanger:opacity-100"
                    >
                      <span className="block truncate text-[11px] leading-tight lg:text-[12px]">{p.title}</span>
                      <Price price={p.price} mrp={p.mrp} size="line" showMrp={false} className="mt-0.5" />
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <Dialog.Root
        open={openProduct !== null}
        onOpenChange={(next) => {
          if (!next) closeItem();
        }}
      >
        {openProduct ? <RailDialog
            key={openProduct.id}
            product={openProduct}
            onDone={closeItem}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              if (returnTo.current !== null) buttonRefs.current[returnTo.current]?.focus();
            }}
          /> : null}
      </Dialog.Root>
    </section>
  );
}

/** The garment lifted off the rail: front/back flip, price, colours, quick add, link to the PDP. */
function RailDialog({
  product,
  onDone,
  onCloseAutoFocus,
}: {
  product: Product;
  onDone: () => void;
  onCloseAutoFocus: (e: Event) => void;
}) {
  const { addToBag } = useStoreUI();
  const [back, setBack] = useState(false);
  const [size, setSize] = useState<string>();
  const off = percentOff(product.price, product.mrp);
  const oneSize = product.sizes.length === 1;
  const chosen = oneSize ? product.sizes[0].label : size;

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Dialog.Content onCloseAutoFocus={onCloseAutoFocus} className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(92dvh,760px)] w-[min(94vw,900px)] -translate-x-1/2 -translate-y-1/2 flex-col bg-white outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-4 data-[state=open]:duration-300">
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
            <div className="relative mx-auto aspect-[3/4] max-h-[46dvh] [perspective:1400px] lg:max-h-none">
              <div
                className={cn(
                  "relative size-full transition-transform duration-700 ease-out-store [transform-style:preserve-3d]",
                  back && "[transform:rotateY(180deg)]",
                )}
              >
                <GarmentArt image={{ ...imageFor(product, "front"), alt: `${product.title}, front` }} className="absolute inset-0 [backface-visibility:hidden]" />
                <GarmentArt
                  image={{ ...imageFor(product, "back"), alt: `${product.title}, back` }}
                  className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]"
                />
              </div>
              {off >= 30 ? (
                <div className="pointer-events-none absolute left-2.5 top-2.5">
                  <Badge tone="red">−{off}%</Badge>
                </div>
              ) : null}
            </div>
            <div role="group" aria-label="View" className="mt-3 flex justify-center gap-1.5">
              {(["Front", "Back"] as const).map((label) => {
                const pressed = (label === "Back") === back;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => setBack(label === "Back")}
                    className={cn("h-9 min-w-20 border px-3 text-[11.5px] font-bold uppercase tracking-[0.12em]", pressed ? "border-black bg-black text-white" : "border-line hover:border-black")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
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
