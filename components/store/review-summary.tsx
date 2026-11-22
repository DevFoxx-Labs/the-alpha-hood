import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { ProductImage } from "@/lib/commerce/types";
import { GarmentArt } from "./garment-art";

/**
 * PDP-08 / DESIGN.md §3 ReviewSummary: big Anton rating, distribution bars (black on light grey),
 * fit meter, WRITE A REVIEW outline button; review cards with black rating chip, title, "Verified buyer",
 * text, 64×80 photos and size/fit/date meta. Only real reviews are ever shown (PRD §14).
 */
export function ReviewSummary({
  average,
  count,
  distribution,
  fit,
  footer,
}: {
  average: number;
  count: number;
  /** Percent per star, index 0 = 5★ … 4 = 1★. */
  distribution: [number, number, number, number, number];
  /** 0 = runs small, 0.5 = true to size, 1 = runs large; null hides the meter. */
  fit: number | null;
  /** e.g. the "verified buyers only" note or a WRITE A REVIEW button (M6). */
  footer?: React.ReactNode;
}) {
  return (
    <div className="max-w-[320px]">
      <p className="flex items-baseline gap-2">
        <span className="font-display text-[56px] leading-none lg:text-[72px]">{average.toFixed(1)}</span>
        <span className="text-[28px]" aria-hidden="true">
          ★
        </span>
        <span className="sr-only">out of 5</span>
      </p>
      <p className="mt-1 text-[12px] text-muted">Based on {count.toLocaleString("en-IN")} verified ratings</p>
      <ul className="mt-3 space-y-1">
        {distribution.map((pct, i) => (
          <li key={i} className="tabular grid grid-cols-[22px_1fr_34px] items-center gap-2 text-[11px]">
            <span>{5 - i}★</span>
            <span className="h-1 bg-line" aria-hidden="true">
              <span className="block h-full bg-black" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-right text-ink-2">
              {pct}%<span className="sr-only"> of ratings are {5 - i} stars</span>
            </span>
          </li>
        ))}
      </ul>
      {fit !== null ? (
      <div className="mt-5">
        <p className="text-[12px] font-semibold">How it fits</p>
        <div className="relative mt-3 h-px bg-line" aria-hidden="true">
          <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black" style={{ left: `${fit * 100}%` }} />
        </div>
        <p className="mt-2 flex justify-between text-[10.5px] text-muted">
          <span>Runs small</span>
          <span>True to size</span>
          <span>Runs large</span>
        </p>
        <p className="sr-only">
          Fit: {fit < 0.4 ? "runs small" : fit > 0.6 ? "runs large" : "true to size"}
        </p>
      </div>
      ) : null}
      {footer ? <div className="mt-5">{footer}</div> : null}
    </div>
  );
}

export function ReviewCard({
  rating,
  title,
  body,
  meta,
  verified,
  photos = [],
}: {
  rating: number;
  title: string;
  body: string;
  meta: string;
  verified: boolean;
  photos?: Pick<ProductImage, "art" | "colour" | "alt">[];
}) {
  return (
    <article className="border-b border-line py-5 first:pt-0">
      <header className="flex flex-wrap items-center gap-2">
        <span className="tabular bg-black px-1.5 py-0.5 text-[10.5px] font-bold text-white">
          {rating}★<span className="sr-only"> out of 5</span>
        </span>
        <h4 className="text-[13px] font-semibold">{title}</h4>
        {verified ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green">
            <Icon icon={CheckmarkCircle02Icon} size={13} />
            Verified buyer
          </span>
        ) : null}
      </header>
      <p className="type-body mt-2">{body}</p>
      {photos.length > 0 ? (
        <div className="mt-3 flex gap-2">
          {photos.map((p, i) => (
            <GarmentArt key={i} image={p} className="h-20 w-16" />
          ))}
        </div>
      ) : null}
      <p className="mt-2.5 text-[11px] text-muted">{meta}</p>
    </article>
  );
}
