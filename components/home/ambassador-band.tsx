import { getImageProps } from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { HomeBlock } from "@/lib/cms/types";
import type { Product } from "@/lib/commerce/types";
import { SignaturePiece } from "./signature-pieces";

type Block = Extract<HomeBlock, { type: "ambassador" }>;

/**
 * Brand-ambassador exclusives — the GymYardHQ hero, as a homepage band. Full-bleed scene (wide on desktop, subject
 * right; tall on phones, subject below the copy). Two giant lines sweep in from opposite sides as the band enters
 * and split apart as it leaves; line 1 turns to glass over the subject; the copy, the "Signed by" line and the CTA
 * sit on the dark side; the signed pieces float between the copy and the subject. All motion: globals.css (.amb-*).
 * The visual lines are aria-hidden; the h2 carries the same words.
 */
export function AmbassadorBand({ block, products }: { block: Block; products: Product[] }) {
  const common = { alt: "", sizes: "100vw", loading: "lazy" as const };
  const {
    props: { srcSet: desktopSet },
  } = getImageProps({ ...common, src: block.desktopImage, width: 1920, height: 840 });
  const {
    props: { srcSet: mobileSet, ...img },
  } = getImageProps({ ...common, src: block.mobileImage, width: 1080, height: 1350 });

  return (
    <section aria-labelledby={`${block.id}-h`} className="amb on-dark relative isolate overflow-hidden bg-black text-white">
      <h2 id={`${block.id}-h`} className="sr-only">
        {block.line1} {block.line2} — {block.eyebrow}
      </h2>

      {/* depth layer: slowest — the scene zooms gently through the band */}
      <div aria-hidden="true" className="amb-bg absolute inset-0 -z-10">
        <picture>
          <source media="(min-width: 1024px)" srcSet={desktopSet} />
          {/* eslint-disable-next-line jsx-a11y/alt-text -- decorative (alt="" from getImageProps); the description is on role="img" below */}
          <img {...img} srcSet={mobileSet} className="absolute bottom-0 left-0 h-auto w-full lg:inset-0 lg:h-full lg:object-cover lg:object-[72%_40%]" />
        </picture>
      </div>
      <span role="img" aria-label={block.alt} className="sr-only" />

      {/* blends: top seam, text side, bottom */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-black to-transparent" />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-[65%] bg-gradient-to-b from-black via-black/85 to-transparent lg:hidden" />
      <div aria-hidden="true" className="absolute inset-y-0 left-0 -z-10 hidden w-[70%] lg:block" style={{ backgroundImage: "linear-gradient(to right, var(--color-black) 0%, var(--color-black) 22%, color-mix(in oklab, var(--color-black) 70%, transparent) 55%, transparent 100%)" }} />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-black to-transparent" />

      <div className="relative flex min-h-[100svh] flex-col lg:min-h-[max(680px,100dvh)]">
        {/* top: eyebrow + line 1 (outer span = exit, inner span = entrance, so the transforms never clash) */}
        <div aria-hidden="true" className="pt-10 text-center lg:pt-[5vh]">
          <p className="amb-out-l whitespace-nowrap">
            <span className="amb-in-l inline-flex items-center gap-[0.55em] text-[min(3.2vw,5.4vh)] font-bold uppercase tracking-[0.3em] text-white/75 max-lg:text-[11px]">
              <span className="h-[0.42em] w-[0.42em] shrink-0 rounded-full bg-volt" />
              {block.eyebrow}
            </span>
          </p>
          <p className="amb-out-l mt-[1.2vh] whitespace-nowrap">
            <span className="amb-in-l relative block font-display text-[min(11vw,18vh)] uppercase leading-[0.9]" style={{ "--d": "4%" } as CSSProperties}>
              <span className="amb-ghost block drop-shadow-[0_6px_18px_rgb(0_0_0/0.55)]">{block.line1}</span>
              <span className="amb-ghost-stroke absolute inset-0 hidden text-transparent [-webkit-text-stroke:1.5px_rgb(255_255_255/0.75)] lg:block">{block.line1}</span>
            </span>
          </p>
        </div>

        {/* middle: copy on the dark side */}
        <div className="relative mx-auto w-full max-w-[1280px] flex-1 px-5 max-lg:order-2 lg:flex lg:items-center lg:px-10">
          <div className="amb-copy-out max-w-md py-6 lg:py-0">
            <p className="amb-rise text-[15px] leading-relaxed text-white/75 lg:text-[17px]" style={{ "--d": "0%" } as CSSProperties}>
              {block.text}
            </p>
            <p className="amb-rise mt-4 text-[12px] font-semibold uppercase tracking-[0.22em] text-volt" style={{ "--d": "2%" } as CSSProperties}>
              ✍ Hand-signed by {block.ambassadorName}
            </p>
            <div className="amb-rise mt-7" style={{ "--d": "4%" } as CSSProperties}>
              <Link href={block.cta.href} className="inline-flex h-14 items-center border border-volt bg-volt px-7 text-[13px] font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-transparent hover:text-volt">
                {block.cta.label} →
              </Link>
            </div>
          </div>

          {/* signed pieces float between the copy and the subject (desktop) */}
          {products.length ? (
            <div className="pointer-events-auto absolute left-[44%] top-1/2 hidden -translate-y-1/2 xl:block">
              <div className="amb-cards-out">
                {/* rise (scroll) and float (loop) on separate elements: one animation per element, or they cancel */}
                <div className="amb-rise" style={{ "--d": "6%" } as CSSProperties}>
                  <div className="amb-float flex gap-3">
                    {products.slice(0, 2).map((p) => (
                      <SignaturePiece key={p.id} product={p} signedBy={block.ambassadorName} tone="dark" className="w-[190px]" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* phones: room for the subject between the copy and line 2 */}
        <div aria-hidden="true" className="h-[70vw] lg:hidden max-lg:order-3" />

        {/* bottom: line 2, in front of the scene */}
        <p aria-hidden="true" className="amb-out-r relative z-10 whitespace-nowrap text-center max-lg:order-1 max-lg:mt-[0.8vh] lg:pb-[3vh]">
          <span className="amb-in-r block font-display text-[min(14vw,22vh)] uppercase leading-[0.9] text-volt drop-shadow-[0_6px_18px_rgb(0_0_0/0.55)]" style={{ "--d": "2%" } as CSSProperties}>
            {block.line2}
          </span>
        </p>
      </div>

      {/* every signed piece: a scrollable row under the band (all screens; desktop shows the first two above too) */}
      {products.length ? (
        <div className="relative z-10 mx-auto max-w-[1280px] px-5 pb-12 lg:px-10 lg:pb-16">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">The signed collection</p>
          <ul className="scrollbar-none -mx-5 flex snap-x gap-3 overflow-x-auto px-5 lg:mx-0 lg:px-0">
            {products.map((p) => (
              <li key={p.id} className="snap-start">
                <SignaturePiece product={p} signedBy={block.ambassadorName} tone="dark" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
