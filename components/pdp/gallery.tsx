"use client";

import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon, ZoomInAreaIcon } from "@hugeicons/core-free-icons";
import { Dialog } from "radix-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { GarmentArt } from "@/components/store/garment-art";
import { Icon } from "@/components/ui/icon";
import type { ProductImage } from "@/lib/commerce/types";
import { cn } from "@/lib/utils";

/**
 * PDP-01 gallery. Desktop: one large image + a 2-column grid; click opens a zoom lightbox.
 * Mobile: full-width swipe carousel (scroll-snap) with dots; tap opens the lightbox with pinch-zoom.
 * Images belong to the current colour — each colour is its own URL, so switching colour switches images.
 */
export function ProductGallery({
  images,
  badge,
  overlay,
}: {
  images: ProductImage[];
  badge?: React.ReactNode;
  /** Mobile-only buttons on the image (wishlist / share). */
  overlay?: React.ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { root: el, threshold: 0.6 },
    );
    for (const child of el.children) io.observe(child);
    return () => io.disconnect();
  }, [images]);

  const scrollTo = (i: number) => {
    const el = track.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  return (
    <div>
      {/* Mobile carousel */}
      <div className="relative lg:hidden">
        <div
          ref={track}
          className="scrollbar-none flex h-[470px] snap-x snap-mandatory overflow-x-auto"
          aria-roledescription="carousel"
          aria-label="Product images"
        >
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              data-index={i}
              onClick={() => setOpen(i)}
              aria-label={`${img.alt} — open zoom (${i + 1} of ${images.length})`}
              className="h-full w-full shrink-0 snap-start"
            >
              <GarmentArt image={img} className="size-full" />
            </button>
          ))}
        </div>
        {badge ? <div className="pointer-events-none absolute left-3 top-3">{badge}</div> : null}
        {overlay ? <div className="absolute right-2 top-2 flex flex-col gap-1">{overlay}</div> : null}
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show image ${i + 1}`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => scrollTo(i)}
              className="grid size-5 place-items-center"
            >
              <span className={cn("block h-1.5 rounded-full transition-all", i === active ? "w-4 bg-black" : "w-1.5 bg-black/30")} />
            </button>
          ))}
        </div>
      </div>

      {/* Desktop grid */}
      <div className="hidden grid-cols-2 gap-1 lg:grid">
        {images.map((img, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`${img.alt} — open zoom`}
            className={cn(
              "group relative block cursor-zoom-in overflow-hidden",
              i === 0
                ? "col-span-2 aspect-[25/26]"
                : // An odd last image spans the row instead of leaving an empty cell.
                  i === images.length - 1 && (images.length - 1) % 2 === 1
                  ? "col-span-2 aspect-[3/2]"
                  : "aspect-[3/4]",
            )}
          >
            <GarmentArt image={img} className="size-full transition-transform duration-[400ms] ease-out group-hover:scale-[1.02]" />
            {i === 0 ? (
              <>
                {badge ? <span className="pointer-events-none absolute left-4 top-4">{badge}</span> : null}
                <span className="absolute bottom-4 right-4 grid size-9 place-items-center bg-white">
                  <Icon icon={ZoomInAreaIcon} size={18} />
                </span>
              </>
            ) : null}
          </button>
        ))}
      </div>

      <Lightbox images={images} index={open} onIndex={setOpen} />
    </div>
  );
}

function Lightbox({ images, index, onIndex }: { images: ProductImage[]; index: number | null; onIndex: (i: number | null) => void }) {
  const [zoom, setZoom] = useState({ scale: 1, x: 50, y: 50 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  const go = useCallback(
    (delta: number) => {
      if (index === null) return;
      setZoom({ scale: 1, x: 50, y: 50 });
      onIndex((index + delta + images.length) % images.length);
    },
    [index, images.length, onIndex],
  );

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  return (
    <Dialog.Root
      open={index !== null}
      onOpenChange={(o) => {
        if (!o) {
          onIndex(null);
          setZoom({ scale: 1, x: 50, y: 50 });
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-white" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
          }}
        >
          <Dialog.Title className="sr-only">Product images</Dialog.Title>
          <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <span className="tabular text-[12px] text-ink-2" aria-live="polite">
              {index !== null ? `${index + 1} / ${images.length}` : null}
            </span>
            <Dialog.Close aria-label="Close" className="grid size-10 place-items-center">
              <Icon icon={Cancel01Icon} size={22} />
            </Dialog.Close>
          </div>
          {index !== null ? (
            <div
              className="relative flex-1 touch-none overflow-hidden"
              onPointerDown={(e) => {
                pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (pointers.current.size === 2) pinchStart.current = { dist: dist(), scale: zoom.scale };
              }}
              onPointerMove={(e) => {
                if (!pointers.current.has(e.pointerId)) {
                  if (e.pointerType === "mouse" && zoom.scale > 1) {
                    const r = e.currentTarget.getBoundingClientRect();
                    setZoom((z) => ({ ...z, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }));
                  }
                  return;
                }
                pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (pointers.current.size === 2 && pinchStart.current) {
                  const scale = Math.min(4, Math.max(1, (dist() / pinchStart.current.dist) * pinchStart.current.scale));
                  setZoom((z) => ({ ...z, scale }));
                }
              }}
              onPointerUp={(e) => {
                pointers.current.delete(e.pointerId);
                if (pointers.current.size < 2) pinchStart.current = null;
              }}
              onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
              onClick={(e) => {
                if (e.detail === 0) return;
                const r = e.currentTarget.getBoundingClientRect();
                setZoom((z) =>
                  z.scale > 1
                    ? { scale: 1, x: 50, y: 50 }
                    : { scale: 2.2, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 },
                );
              }}
            >
              <div
                className={cn("mx-auto h-full max-w-[900px] transition-transform duration-200", zoom.scale > 1 ? "cursor-zoom-out" : "cursor-zoom-in")}
                style={{ transform: `scale(${zoom.scale})`, transformOrigin: `${zoom.x}% ${zoom.y}%` }}
              >
                <GarmentArt image={images[index]} className="size-full bg-white" />
              </div>
              <button
                type="button"
                aria-label="Previous image"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-soft hover:bg-soft-2"
              >
                <Icon icon={ArrowLeft01Icon} size={20} />
              </button>
              <button
                type="button"
                aria-label="Next image"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-soft hover:bg-soft-2"
              >
                <Icon icon={ArrowRight01Icon} size={20} />
              </button>
            </div>
          ) : null}
          <p className="py-3 text-center text-[12px] text-ink-2">Tap or pinch to zoom</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
