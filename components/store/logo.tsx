import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Brand logo from the logo kit (docs/brand/logo-kit, web copies in /public/brand/logo). Usage rules from the
 * brand sheet: horizontal lockup by default, never stretched / rotated / recoloured, clear space = the "A"
 * height, minimum 120 px wide for the lockup and 16 px for the mark. Width and height are always set (no CLS).
 *
 * Variants: `color` (black mark + wordmark, yellow eyes) on light backgrounds; `color-on-dark` on black.
 * The lockup is the ™ version (™ at the top-right of the "D" of HOOD, from docs/brand/logo-kit/logo-symbols/tm,
 * `*_tm-top.svg`). Use ® only once the mark is registered.
 */
const LOCKUP = { w: 1131, h: 360 } as const;

export function LogoMark({ tone = "dark", size = 28, className }: { tone?: "dark" | "light"; size?: number; className?: string }) {
  return (
    // Plain <img>: a static SVG that the image optimiser can't improve (it would only add a request hop).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === "light" ? "/brand/logo/mark_color-on-dark.svg" : "/brand/logo/mark_color.svg"}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      decoding="async"
      // Size comes from the width/height attributes; a className (e.g. `lg:size-40`) can override it.
      className={cn("shrink-0 select-none", className)}
    />
  );
}

export function Logo({
  href = "/",
  tone = "dark",
  compact = false,
  className,
  onClick,
}: {
  href?: string;
  tone?: "dark" | "light";
  /** Always use the small mobile size (e.g. inside drawers and checkout). */
  compact?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const src = tone === "light" ? "/brand/logo/primary-horizontal_color-on-dark_tm.svg" : "/brand/logo/primary-horizontal_color_tm.svg";
  return (
    <Link href={href} onClick={onClick} aria-label="The Alpha Hood — home" className={cn("inline-flex shrink-0 items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={LOCKUP.w}
        height={LOCKUP.h}
        fetchPriority={tone === "dark" && !compact ? "high" : undefined}
        decoding="async"
        draggable={false}
        // Header slot is 64 px: lockup 40 px tall on mobile (≈ 120 px wide, the kit's minimum), 48 px on desktop.
        className={cn("h-10 w-auto select-none", !compact && "lg:h-12")}
      />
    </Link>
  );
}
