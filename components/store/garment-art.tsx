import Image from "next/image";
import { useId } from "react";
import { isProductPhotoUrl } from "@/lib/catalog/photo-url";
import type { GarmentKind, ProductImage } from "@/lib/commerce/types";
import { cn } from "@/lib/utils";

/**
 * PLACEHOLDER product "photography": flat garment drawings ported from reference/prototype/garments.js.
 * These are stand-ins for real product photos (DESIGN.md §5) and must be replaced before launch.
 * Rendered as JSX (no raw HTML injection); `colour` comes from catalogue data and is only used as a fill.
 */

const SHIRT_BODY =
  "M33 14 L44 10 L50 18 L56 10 L67 14 L84 28 L90 72 L81 74 L74 40 L72 92 L28 92 L26 40 L19 74 L10 72 L16 28 Z";

const HEX_RE = /^#[0-9a-f]{3,8}$/i;

/** Which half of the placeholder figure wears the garment in the "on model" view. */
const MODEL_LOOK: Partial<Record<GarmentKind, "top" | "bottom">> = {
  tee: "top", oversized: "top", shirt: "top", check: "top", hoodie: "top", jacket: "top", puffer: "top", sweater: "top", polo: "top",
  jeans: "bottom", baggy: "bottom", cargo: "bottom", trouser: "bottom",
};

function Shape({ kind, c, patternId }: { kind: GarmentKind; c: string; patternId: string }) {
  switch (kind) {
    case "tee":
      return (
        <>
          <path d="M32 16 L43 11 Q50 17 57 11 L68 16 L88 30 L79 43 L70 37 L70 90 L30 90 L30 37 L21 43 L12 30 Z" fill={c} />
          <path d="M43 11 Q50 19 57 11" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth={1.2} />
        </>
      );
    case "oversized":
      return (
        <>
          <path d="M28 15 L42 10 Q50 16 58 10 L72 15 L94 34 L82 48 L72 40 L73 92 L27 92 L28 40 L18 48 L6 34 Z" fill={c} />
          <path d="M42 10 Q50 18 58 10" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth={1.2} />
        </>
      );
    case "shirt":
      return (
        <>
          <path d={SHIRT_BODY} fill={c} />
          <path d="M44 10 L50 22 L56 10 M50 22 L50 92" fill="none" stroke="rgba(0,0,0,.28)" strokeWidth={1.2} />
          <g fill="rgba(255,255,255,.7)">
            {[32, 45, 58, 71].map((cy) => (
              <circle key={cy} cx={50} cy={cy} r={1.1} />
            ))}
          </g>
          <rect x={56} y={30} width={9} height={8} fill="none" stroke="rgba(0,0,0,.25)" strokeWidth={1} />
        </>
      );
    case "check":
      return (
        <>
          <defs>
            <pattern id={patternId} width={8} height={8} patternUnits="userSpaceOnUse">
              <rect width={8} height={8} fill={c} />
              <rect width={4} height={8} fill="rgba(255,255,255,.22)" />
              <rect width={8} height={4} fill="rgba(0,0,0,.18)" />
            </pattern>
          </defs>
          <path d={SHIRT_BODY} fill={`url(#${patternId})`} />
          <path d="M44 10 L50 22 L56 10 M50 22 L50 92" fill="none" stroke="rgba(0,0,0,.3)" strokeWidth={1.2} />
        </>
      );
    case "hoodie":
      return (
        <>
          <path d="M36 18 Q50 0 64 18 L84 30 L90 74 L81 76 L74 42 L72 90 L28 90 L26 42 L19 76 L10 74 L16 30 Z" fill={c} />
          <path d="M38 20 Q50 8 62 20 Q56 30 50 30 Q44 30 38 20Z" fill="rgba(0,0,0,.22)" />
          <path d="M47 30 L46 44 M53 30 L54 44" stroke="rgba(255,255,255,.7)" strokeWidth={1} />
          <path d="M34 62 L66 62 L63 78 L37 78 Z" fill="rgba(0,0,0,.12)" />
          <rect x={26} y={86} width={46} height={4} fill="rgba(0,0,0,.15)" />
        </>
      );
    case "jacket":
      return (
        <>
          <path d="M34 14 L44 10 L50 16 L56 10 L66 14 L85 28 L91 74 L81 76 L74 42 L73 92 L27 92 L26 42 L19 76 L9 74 L15 28 Z" fill={c} />
          <path d="M44 10 L42 20 L50 26 L58 20 L56 10" fill="rgba(0,0,0,.25)" />
          <path d="M50 26 L50 92" stroke="rgba(255,255,255,.55)" strokeWidth={1.3} strokeDasharray="2 1.5" />
          <rect x={32} y={56} width={11} height={12} fill="rgba(0,0,0,.14)" />
          <rect x={57} y={56} width={11} height={12} fill="rgba(0,0,0,.14)" />
          <rect x={27} y={87} width={46} height={5} fill="rgba(0,0,0,.18)" />
        </>
      );
    case "puffer":
      return (
        <>
          <path d="M32 14 L44 9 L50 15 L56 9 L68 14 L86 28 L92 74 L81 76 L74 42 L74 92 L26 92 L26 42 L19 76 L8 74 L14 28 Z" fill={c} />
          <path d="M27 36 H73 M26 50 H74 M26 64 H74 M26 78 H74" stroke="rgba(0,0,0,.2)" strokeWidth={1.2} />
          <path d="M50 15 V92" stroke="rgba(255,255,255,.5)" strokeWidth={1.2} />
        </>
      );
    case "sweater":
      return (
        <>
          <path d="M34 15 L44 11 Q50 16 56 11 L66 15 L84 28 L90 74 L81 76 L74 42 L72 90 L28 90 L26 42 L19 76 L10 74 L16 28 Z" fill={c} />
          <path d="M38 30 V86 M44 30 V86 M50 30 V86 M56 30 V86 M62 30 V86" stroke="rgba(0,0,0,.14)" strokeWidth={1} />
          <path d="M44 11 L50 24 L56 11" fill="rgba(0,0,0,.18)" />
          <rect x={28} y={85} width={44} height={5} fill="rgba(0,0,0,.15)" />
        </>
      );
    case "jeans":
      return (
        <>
          <path d="M30 8 L70 8 L76 92 L56 92 L50 34 L44 92 L24 92 Z" fill={c} />
          <path d="M30 14 H70" stroke="rgba(0,0,0,.25)" strokeWidth={1.4} />
          <path d="M36 14 Q38 24 46 24 M64 14 Q62 24 54 24" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth={1} />
          <path d="M50 14 V34" stroke="rgba(0,0,0,.25)" strokeWidth={1} />
          <path d="M30 40 Q34 60 32 88 M70 40 Q66 60 68 88" stroke="rgba(255,255,255,.18)" strokeWidth={5} fill="none" />
        </>
      );
    case "baggy":
      return (
        <>
          <path d="M28 8 L72 8 L84 92 L56 92 L50 36 L44 92 L16 92 Z" fill={c} />
          <path d="M28 14 H72" stroke="rgba(0,0,0,.25)" strokeWidth={1.4} />
          <path d="M50 14 V36" stroke="rgba(0,0,0,.25)" />
          <path d="M26 50 Q30 70 24 90 M74 50 Q70 70 76 90" stroke="rgba(255,255,255,.2)" strokeWidth={6} fill="none" />
        </>
      );
    case "cargo":
      return (
        <>
          <path d="M30 8 L70 8 L77 92 L56 92 L50 34 L44 92 L23 92 Z" fill={c} />
          <path d="M30 14 H70" stroke="rgba(0,0,0,.25)" strokeWidth={1.4} />
          <rect x={24} y={48} width={13} height={16} fill="rgba(0,0,0,.18)" />
          <rect x={63} y={48} width={13} height={16} fill="rgba(0,0,0,.18)" />
        </>
      );
    case "trouser":
      return (
        <>
          <path d="M32 8 L68 8 L72 92 L55 92 L50 32 L45 92 L28 92 Z" fill={c} />
          <path d="M32 14 H68" stroke="rgba(0,0,0,.25)" strokeWidth={1.4} />
          <path d="M41 20 L39 90 M59 20 L61 90" stroke="rgba(255,255,255,.25)" strokeWidth={1} />
        </>
      );
    case "sneaker":
      return (
        <>
          <path d="M8 62 Q10 48 24 46 L42 44 Q50 30 62 33 L67 45 Q86 49 92 60 L92 68 L8 68 Z" fill={c} />
          <rect x={8} y={66} width={84} height={8} rx={2} fill="#f2f2f2" stroke="rgba(0,0,0,.15)" />
          <path d="M46 44 L60 50 M44 50 L58 56" stroke="rgba(0,0,0,.3)" strokeWidth={1.4} />
        </>
      );
    case "shades":
      return (
        <>
          <path d="M10 42 H90" stroke={c} strokeWidth={3} />
          <rect x={14} y={40} width={30} height={20} rx={8} fill={c} />
          <rect x={56} y={40} width={30} height={20} rx={8} fill={c} />
          <path d="M18 44 L26 44" stroke="rgba(255,255,255,.4)" strokeWidth={2} />
        </>
      );
    case "cap":
      return (
        <>
          <path d="M22 60 Q22 30 50 28 Q78 30 78 60 Z" fill={c} />
          <path d="M60 60 Q86 58 94 66 L60 66 Z" fill={c} opacity={0.85} />
          <circle cx={50} cy={28} r={2.5} fill="rgba(0,0,0,.3)" />
        </>
      );
    case "polo":
      return (
        <>
          <path d="M32 16 L43 11 L50 18 L57 11 L68 16 L88 30 L79 43 L70 37 L70 90 L30 90 L30 37 L21 43 L12 30 Z" fill={c} />
          <path d="M43 11 L46 22 L50 18 L54 22 L57 11" fill="rgba(0,0,0,.2)" />
          <path d="M50 18 V34" stroke="rgba(255,255,255,.6)" />
        </>
      );
  }
}

export function GarmentArt({
  image,
  className,
  artClassName,
  priority = false,
  sizes = "(min-width: 1024px) 25vw, 50vw",
}: {
  image: Pick<ProductImage, "art" | "colour" | "alt" | "view" | "url">;
  className?: string;
  /** Size of the drawing inside the well. Default 74% like the prototype. */
  artClassName?: string;
  /** Real photos only: the LCP image of the page (never lazy, fetchpriority high). */
  priority?: boolean;
  /** Real photos only: rendered width hint for the srcset. */
  sizes?: string;
}) {
  const patternId = useId().replace(/:/g, "");
  // A real product photo (own-backend media, served from /api/media/<id>) replaces the drawing. The container keeps
  // its own aspect ratio, so swapping art for a photo never shifts layout (CLS).
  if (isProductPhotoUrl(image.url)) {
    return (
      <div className={cn("relative overflow-hidden bg-soft", className)}>
        <Image src={image.url} alt={image.alt} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  const colour = HEX_RE.test(image.colour) ? image.colour : "#333333";
  const a11y = image.alt ? { role: "img" as const, "aria-label": image.alt } : { "aria-hidden": true as const };

  // Placeholder "on model" shot: the garment colour on the matching half of a figure.
  if (image.view === "model" && image.art in MODEL_LOOK) {
    const bottomPiece = MODEL_LOOK[image.art] === "bottom";
    return (
      <div {...a11y} className={cn("relative overflow-hidden bg-soft-2", className)}>
        <ModelFigure
          top={bottomPiece ? "#2a2a2a" : colour}
          bottom={bottomPiece ? colour : "#1f2937"}
          label=""
          className="absolute inset-x-0 bottom-0 mx-auto h-[92%] w-full"
        />
      </div>
    );
  }

  return (
    <div {...a11y} className={cn("relative overflow-hidden bg-soft", className)}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        className={cn(
          "absolute left-1/2 top-[52%] size-[74%] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_18px_18px_rgba(0,0,0,0.12)]",
          image.view === "back" && "-scale-x-100",
          image.view === "detail" && "top-[62%] size-[190%]",
          artClassName,
        )}
      >
        <Shape kind={image.art} c={colour} patternId={`ck${patternId}`} />
      </svg>
    </div>
  );
}

/** Placeholder on-model figure (hero, collection tiles, promo band). Replace with photography. */
export function ModelFigure({
  top,
  bottom,
  skin = "#C9946B",
  className,
  label,
}: {
  top: string;
  bottom: string;
  skin?: string;
  className?: string;
  label: string;
}) {
  return (
    <svg viewBox="0 0 100 102" preserveAspectRatio="xMidYMax meet" role="img" aria-label={label} className={className}>
      <ellipse cx={50} cy={14} rx={7} ry={8.5} fill={skin} />
      <path d="M43 9 Q50 2 57 9 L57 12 Q50 7 43 12Z" fill="#222" />
      <rect x={47} y={21} width={6} height={5} fill={skin} />
      <path d="M35 26 L65 26 L72 34 L76 62 L70 63 L66 40 L65 60 L35 60 L34 40 L30 63 L24 62 L28 34 Z" fill={top} />
      <path d="M36 59 L64 59 L66 96 L53 96 L50 66 L47 96 L34 96 Z" fill={bottom} />
      <rect x={33} y={95} width={14} height={4} rx={1.5} fill="#f1f1f1" />
      <rect x={53} y={95} width={14} height={4} rx={1.5} fill="#f1f1f1" />
      <ellipse cx={27} cy={64} rx={2.6} ry={3} fill={skin} />
      <ellipse cx={73} cy={64} rx={2.6} ry={3} fill={skin} />
    </svg>
  );
}
