import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { TileImage } from "@/lib/cms/types";
import type { Category, ProductImage } from "@/lib/commerce/types";
import { cn } from "@/lib/utils";
import { GarmentArt, ModelFigure } from "./garment-art";

/**
 * Homepage merchandising blocks from DESIGN.md §3: CategoryRail item, CollectionTile, OfferTile,
 * PromoBand. Photography is placeholder art until the real shoot (DESIGN.md §5).
 */

/** Desktop: label on top, cut-out below on white. Mobile: 72 px circular crop with label below. */
export function CategoryRailItem({ category }: { category: Category }) {
  return (
    <Link href={category.href ?? `/men/${category.handle}`} className="group flex shrink-0 flex-col items-center gap-1.5 lg:gap-4">
      <span className="order-2 text-[10.5px] font-semibold uppercase tracking-[0.05em] lg:order-1 lg:text-[14px] lg:tracking-[0.06em]">
        {category.title}
      </span>
      <GarmentArt
        image={{ ...category.image, alt: "" }}
        className="order-1 h-20 w-[72px] rounded-full lg:order-2 lg:h-[180px] lg:w-[170px] lg:rounded-none lg:bg-white"
        artClassName="transition-transform duration-[400ms] ease-out group-hover:scale-[1.04] lg:size-[82%]"
      />
    </Link>
  );
}

export function CollectionTile({
  title,
  tagline,
  href,
  fill,
  look,
  image,
  className,
}: {
  title: string;
  tagline: string;
  href: string;
  fill: string;
  look: { top: string; bottom: string; skin?: string };
  /** Campaign / mascot art; the tile is painted in its baked background colour so the edge disappears. */
  image?: TileImage;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("on-dark group relative block h-[420px] overflow-hidden lg:h-[620px]", className)}
      style={{ backgroundColor: image?.bg ?? fill }}
    >
      {image ? (
        <Image
          src={image.src}
          width={image.width}
          height={image.height}
          alt=""
          sizes="(min-width: 1024px) 34vw, 78vw"
          className="absolute inset-x-0 bottom-0 mx-auto h-[94%] w-auto max-w-none object-contain transition-transform duration-[400ms] ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
        />
      ) : (
        <ModelFigure
          {...look}
          label=""
          className="absolute inset-x-0 bottom-0 mx-auto h-[88%] w-full transition-transform duration-[400ms] ease-out group-hover:scale-[1.04]"
        />
      )}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
      <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 lg:inset-x-6 lg:bottom-6">
        <h3 className="whitespace-pre-line font-display text-[30px] uppercase leading-[0.9] text-white lg:text-[54px] lg:leading-[0.88]">
          {title}
        </h3>
        <p className="max-w-[120px] text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90 lg:text-[11px]">
          {tagline}
        </p>
      </div>
    </Link>
  );
}

export function OfferTile({
  lines,
  price,
  href,
  image,
  dark = false,
}: {
  lines: string[];
  price: string;
  href: string;
  image: Pick<ProductImage, "art" | "colour">;
  dark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex h-[220px] overflow-hidden lg:h-[300px]",
        dark ? "on-dark bg-black text-white" : "bg-soft-2 text-black",
      )}
    >
      <GarmentArt
        image={{ ...image, alt: "" }}
        className="absolute bottom-0 left-0 top-0 w-[55%] bg-transparent"
        artClassName="transition-transform duration-[400ms] ease-out group-hover:scale-[1.04]"
      />
      <div className="relative ml-auto mt-auto p-3.5 text-right font-display uppercase leading-[0.9] lg:p-5">
        {lines.map((l) => (
          <span key={l} className="block text-[20px] lg:text-[26px]">
            {l}
          </span>
        ))}
        <span className="mt-1 block text-[28px] text-accent lg:text-[40px]">{price}</span>
      </div>
    </Link>
  );
}

export function PromoBand({
  left,
  right,
  highlight,
  href,
  image,
}: {
  left: string;
  right: string;
  /** Part of `right` rendered in red (the %). */
  highlight: string;
  href: string;
  image?: TileImage;
}) {
  const [before, after] = right.split(highlight);
  return (
    <Link
      href={href}
      className="grid h-[220px] grid-cols-[1fr_auto_1fr] items-center gap-3 overflow-hidden bg-soft-2 px-4 lg:h-[300px] lg:gap-10 lg:px-10"
      style={image?.bg ? { backgroundColor: image.bg } : undefined}
    >
      <p className="whitespace-pre-line text-right font-display text-[30px] uppercase leading-[0.9] lg:text-[78px] lg:leading-[0.88]">
        {left}
      </p>
      {image ? (
        <Image
          src={image.src}
          width={image.width}
          height={image.height}
          alt=""
          sizes="(min-width: 1024px) 240px, 160px"
          className="h-[214px] w-auto self-end lg:h-[296px]"
        />
      ) : (
        <ModelFigure top="#1d2a44" bottom="#d8c9a8" label="" className="h-[190px] w-[90px] self-end lg:h-[270px] lg:w-[150px]" />
      )}
      <p className="whitespace-pre-line font-display text-[30px] uppercase leading-[0.9] lg:text-[78px] lg:leading-[0.88]">
        {before}
        <span className="text-accent">{highlight}</span>
        {after}
      </p>
    </Link>
  );
}

/** Small arrow link used under rails ("SHOP ALL →"). */
export function ArrowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] underline underline-offset-4"
    >
      {children}
      <Icon icon={ArrowRight01Icon} size={14} />
    </Link>
  );
}

/**
 * Editorial campaign band (MASCOT_PROMPTS §7 collection launch): 4:5 art beside an Anton headline on black.
 * Mobile: art on top, text below. Lazy-loaded (below the fold).
 */
export function CampaignBand({
  kicker,
  headline,
  text,
  cta,
  image,
}: {
  kicker: string;
  headline: string[];
  text: string;
  cta: { label: string; href: string };
  image: TileImage & { alt: string };
}) {
  return (
    <section className="on-dark grid bg-black text-white lg:grid-cols-2" aria-label={kicker}>
      <div className="relative aspect-[4/5] lg:aspect-auto lg:min-h-[640px]" style={image.bg ? { backgroundColor: image.bg } : undefined}>
        <Image src={image.src} alt={image.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover object-center" />
      </div>
      <div className="flex flex-col justify-center gap-5 px-6 py-12 lg:px-[72px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-volt lg:text-[12px]">{kicker}</p>
        <h2 className="font-display text-[56px] uppercase leading-[0.88] lg:text-[112px]">
          {headline.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))}
        </h2>
        <p className="max-w-[440px] text-[14px] leading-[1.6] text-white/80 lg:text-[16px]">{text}</p>
        <Link
          href={cta.href}
          className="inline-flex h-12 items-center gap-2 self-start bg-white px-6 text-[12px] font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-volt"
        >
          {cta.label}
          <Icon icon={ArrowRight01Icon} size={16} />
        </Link>
      </div>
    </section>
  );
}
