import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import type { HomeBlock } from "@/lib/cms/types";
import type { Product } from "@/lib/commerce/types";
import { frontWords, Tape } from "./brand-marquee";
import { EditionTally, LimitedCues } from "./limited-cues";
import { editionLeft, SignaturePiece } from "./signature-pieces";

type Block = Extract<HomeBlock, { type: "limited_edition" }>;

/** Drop-tape words. Every claim comes from the block: no edition size means no "Only N", no signature means no "Hand-signed". */
export function dropTapeWords(block: Pick<Block, "editionSize" | "signatureImage">, left: number | null) {
  const rest = [
    ...(block.editionSize ? [`Only ${block.editionSize.toLocaleString("en-IN")} made`] : []),
    ...(block.signatureImage ? ["Hand-signed"] : []),
    "When it's gone, it's gone",
  ];
  return frontWords(["Limited edition", ...rest], [], left);
}

/** The three lines of the "authentic" stamp. "Signed" only when there is a real signature. */
export function stampLines(block: Pick<Block, "editionSize" | "signatureImage">): [string, string, string] {
  return ["Authentic", block.editionSize ? `Only ${block.editionSize.toLocaleString("en-IN")}` : "Limited", block.signatureImage ? "Signed" : "Alpha Hood"];
}

/** Claw marks: three tapered blades, staggered. */
const CLAWS = [0, 1, 2];

/**
 * Limited-edition drop, after the GymYardHQ download finale: volt background, pinned, full height (view timeline --ltd).
 * - A black drop tape runs across the top ("Limited edition · Only 100 made · 37 left · When it's gone, it's gone").
 * - Line 1 sweeps in behind the art as an outline, then fills with ink as you scroll.
 * - The scene slides in on the right.
 * - ALPHA drops in from above with weight. On touchdown, three claw marks slash behind him, his shadow squashes,
 *   shock lines kick out at his feet and an "Authentic · Only 100" stamp slams onto the art.
 * - Line 2 lands in front and the stage shakes once. The real signature, if uploaded, writes itself on.
 * - The call to action slides in, and the pieces-left count runs down to the real stock.
 *
 * Scrubbed entrances use CSS scroll timelines. The impacts play at their own speed, from cues (limited-cues.tsx).
 * Only transform and opacity animate. With reduced motion, or without scroll timelines, everything is static in its
 * final place. Pieces left come from the real stock of the picked products (editionLeft).
 */
export function LimitedFinale({ block, products }: { block: Block; products: Product[] }) {
  const left = editionLeft(products, block.editionSize);
  const edition = block.editionSize ? `Edition of ${block.editionSize.toLocaleString("en-IN")}` : null;
  const [stampTop, stampMid, stampBottom] = stampLines(block);
  return (
    <section aria-labelledby={`${block.id}-h`} className="ltd relative bg-volt text-ink">
      <LimitedCues />
      {/* drop tape — straddles the top edge of the section (half over the section above), like the hero tapes.
          In the flow and outside the pinned stage, so the stage layout and the fixed header are untouched. */}
      <div aria-hidden="true" className="mq pointer-events-none relative z-20 -mt-[calc(20px+4.5vw)] h-[calc(40px+9vw)] overflow-x-clip md:-mt-[calc(23px+2.75vw)] md:h-[calc(46px+5.5vw)] xl:-mt-[calc(26px+1.8vw)] xl:h-[calc(52px+3.6vw)]">
        <div className="absolute -inset-x-[8vw] top-1/2 -translate-y-1/2 -rotate-4 md:-rotate-2 xl:-rotate-[1.5deg]">
          <div className="mq-push-l">
            <Tape words={dropTapeWords(block, left)} tone="back" />
          </div>
        </div>
      </div>
      <div className="ltd-stage relative h-dvh min-h-[640px] overflow-hidden">
        <h2 id={`${block.id}-h`} className="sr-only">
          {block.line1} {block.line2} — {block.eyebrow}
        </h2>

        <div className="ltd-shake absolute inset-0">
          {/* line 1 — behind the art; an outline that fills with ink */}
          <p aria-hidden="true" className="ltd-line1 absolute inset-x-0 top-[9vh] z-0 whitespace-nowrap text-center font-display text-[min(17vw,26vh)] uppercase leading-none lg:top-[7vh]">
            <span className="block text-transparent [-webkit-text-stroke:2px_var(--color-ink)]">{block.line1}</span>
            <span className="ltd-fill absolute inset-0 overflow-hidden">
              <span className="ltd-fill-in block">{block.line1}</span>
            </span>
          </p>

          {/* right: the scene (desktop) */}
          <div aria-hidden="true" className="ltd-scene absolute bottom-0 right-0 z-10 hidden lg:block lg:h-[86%] lg:w-[46%]">
            <div className="absolute inset-0 [mask-image:linear-gradient(to_right,transparent,#000_30%)]">
              <Image src={block.sceneImage} alt="" fill sizes="(min-width: 1024px) 46vw, 100vw" className="object-cover object-[60%_20%]" />
            </div>
          </div>

          {/* left: ALPHA drops in; claws, shadow, shock lines and the stamp on touchdown */}
          <div className="ltd-duo absolute bottom-0 left-1/2 z-10 h-[46%] -translate-x-1/2 lg:left-[2vw] lg:h-[70%] lg:translate-x-0">
            <span aria-hidden="true" className="ltd-claw pointer-events-none absolute left-[55%] top-[38%] flex w-[95%] -translate-x-1/2 -translate-y-1/2 -rotate-[58deg] flex-col gap-[clamp(8px,1.4vw,20px)]">
              {CLAWS.map((i) => (
                <i key={i} className="block h-[clamp(14px,2.4vw,34px)] bg-ink [clip-path:polygon(0_50%,12%_8%,70%_0,100%_50%,70%_100%,12%_92%)]" style={{ "--d": `${i * 70}ms`, marginLeft: `${[6, 0, 10][i]}%`, width: `${[82, 100, 76][i]}%` } as CSSProperties} />
              ))}
            </span>
            <span aria-hidden="true" className="ltd-shadow pointer-events-none absolute bottom-[-1.5%] left-1/2 h-[5%] w-[62%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-md" />
            <span aria-hidden="true" className="pointer-events-none absolute bottom-[3%] right-[84%] flex flex-col items-end gap-1.5">
              <i className="ltd-shock-l block h-[3px] w-10 bg-ink lg:w-14" />
              <i className="ltd-shock-l block h-[3px] w-6 bg-ink lg:w-9" style={{ "--d": "50ms" } as CSSProperties} />
            </span>
            <span aria-hidden="true" className="pointer-events-none absolute bottom-[3%] left-[84%] flex flex-col items-start gap-1.5">
              <i className="ltd-shock-r block h-[3px] w-10 bg-ink lg:w-14" />
              <i className="ltd-shock-r block h-[3px] w-6 bg-ink lg:w-9" style={{ "--d": "50ms" } as CSSProperties} />
            </span>
            <span className="ltd-squash relative block h-full">
              <Image src={block.cutoutImage} alt={block.cutoutAlt} width={1122} height={1402} sizes="(min-width: 1024px) 34vw, 50vw" className="h-full w-auto max-w-none drop-shadow-[0_30px_40px_rgb(0_0_0/0.35)]" />
            </span>
            <span aria-hidden="true" className="ltd-stamp pointer-events-none absolute right-[70%] top-[14%] z-10 block whitespace-nowrap border-[3px] border-ink p-[3px] text-center text-ink mix-blend-multiply lg:left-[-2%] lg:right-auto">
              <span className="block border-[1.5px] border-ink px-2.5 py-1.5 lg:px-3.5 lg:py-2">
                <span className="block text-[9px] font-bold uppercase tracking-[0.3em] lg:text-[11px]">{stampTop}</span>
                <span className="block font-display text-[22px] uppercase leading-none lg:text-[30px]">{stampMid}</span>
                <span className="block text-[9px] font-bold uppercase tracking-[0.3em] lg:text-[11px]">{stampBottom}</span>
              </span>
            </span>
          </div>

          {/* call to action — centre */}
          <div className="ltd-cta absolute inset-x-0 top-[24vh] z-20 mx-auto max-w-sm px-5 text-center lg:left-[33vw] lg:right-auto lg:top-[calc(7vh+min(17vw,26vh)+2vh)] lg:w-[27vw] lg:max-w-none lg:px-0 lg:text-left">
            <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-ink/70">{block.eyebrow}</p>
            <p className="mt-3 text-[16px] font-medium leading-relaxed text-ink/85">{block.text}</p>
            {edition || left !== null ? (
              <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] font-bold uppercase tracking-[0.12em] lg:justify-start">
                {edition ? <span>{edition}</span> : null}
                {/* null: no products, or a count above the edition size would contradict it (editionLeft). */}
                {left !== null ? (
                  <span className={left <= 10 ? "text-accent" : undefined}>{left === 0 ? "Sold out" : <EditionTally from={block.editionSize ?? left} to={left} />}</span>
                ) : null}
              </p>
            ) : null}
            {block.signatureImage ? (
              <div className="ltd-sign relative mx-auto mt-3 h-10 w-[160px] lg:mx-0 lg:h-14 lg:w-[220px]">
                <span className="ltd-sign-wipe absolute inset-0 overflow-hidden">
                  <span className="ltd-sign-in absolute inset-0">
                    <Image src={block.signatureImage} alt="The ambassador's signature" fill sizes="220px" className="object-contain object-center lg:object-left" />
                  </span>
                </span>
              </div>
            ) : null}
            <Link href={block.cta.href} className="group/cta relative mt-6 inline-flex h-14 items-center gap-2 overflow-hidden bg-black px-7 text-[13px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-ink">
              {block.cta.label}
              <span aria-hidden="true" className="transition-transform duration-200 group-hover/cta:translate-x-1.5 group-focus-visible/cta:translate-x-1.5">
                →
              </span>
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 bg-volt transition-transform duration-300 ease-out group-hover/cta:scale-x-100 group-focus-visible/cta:scale-x-100" />
            </Link>
            {products.length ? (
              <ul className="mt-5 hidden gap-2 lg:flex">
                {products.slice(0, 2).map((p) => (
                  <li key={p.id}>
                    <SignaturePiece product={p} tone="light" className="w-[150px] p-2 text-[12px]" />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* line 2 — in front of the art */}
          <p aria-hidden="true" className="ltd-line2 absolute inset-x-0 bottom-[3vh] z-20 whitespace-nowrap text-center font-display text-[min(16vw,24vh)] uppercase leading-none text-white drop-shadow-[0_6px_18px_color-mix(in_oklab,var(--color-ink)_55%,transparent)]">
            {block.line2}
          </p>
        </div>
      </div>
    </section>
  );
}
