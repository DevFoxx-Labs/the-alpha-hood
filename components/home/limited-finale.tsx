import Image from "next/image";
import Link from "next/link";
import type { HomeBlock } from "@/lib/cms/types";
import type { Product } from "@/lib/commerce/types";
import { CelebrationSparkles } from "./sparkles";
import { piecesLeft, SignaturePiece } from "./signature-pieces";

type Block = Extract<HomeBlock, { type: "limited_edition" }>;

/**
 * Limited-edition drop — the GymYardHQ download finale: volt, pinned, full height (view timeline --ltd). Line 1 sweeps
 * in from the left behind the art, the scene slides in on the right, the cut-out swings in on the left (sparks burst
 * where it lands), line 2 sweeps in from the right in front, then the call to action. Pieces left come from the real
 * stock of the picked products. Static composition when motion is reduced or scroll timelines are missing.
 */
export function LimitedFinale({ block, products }: { block: Block; products: Product[] }) {
  const left = products.reduce((n, p) => n + piecesLeft(p), 0);
  const edition = block.editionSize ? `Edition of ${block.editionSize.toLocaleString("en-IN")}` : null;
  return (
    <section aria-labelledby={`${block.id}-h`} className="ltd relative bg-volt text-ink">
      <div className="ltd-stage relative h-dvh min-h-[640px] overflow-hidden">
        <h2 id={`${block.id}-h`} className="sr-only">
          {block.line1} {block.line2} — {block.eyebrow}
        </h2>

        {/* line 1 — behind the art */}
        <p aria-hidden="true" className="ltd-line1 absolute inset-x-0 top-[9vh] z-0 whitespace-nowrap text-center font-display text-[min(17vw,26vh)] uppercase leading-none lg:top-[7vh]">
          {block.line1}
        </p>

        {/* right: the scene (desktop) */}
        <div aria-hidden="true" className="ltd-scene absolute bottom-0 right-0 z-10 hidden lg:block lg:h-[86%] lg:w-[46%]">
          <div className="absolute inset-0 [mask-image:linear-gradient(to_right,transparent,#000_30%)]">
            <Image src={block.sceneImage} alt="" fill sizes="(min-width: 1024px) 46vw, 100vw" className="object-cover object-[60%_20%]" />
          </div>
        </div>

        {/* left: the cut-out, with sparks where it lands */}
        <div className="ltd-duo absolute bottom-0 left-1/2 z-10 h-[46%] -translate-x-1/2 lg:left-[2vw] lg:h-[70%] lg:translate-x-0">
          <Image src={block.cutoutImage} alt={block.cutoutAlt} width={1122} height={1402} sizes="(min-width: 1024px) 34vw, 50vw" className="h-full w-auto max-w-none drop-shadow-[0_30px_40px_rgb(0_0_0/0.35)]" />
          <CelebrationSparkles scale={1.7} top="8%" />
        </div>

        {/* call to action — centre */}
        <div className="ltd-cta absolute inset-x-0 top-[24vh] z-20 mx-auto max-w-sm px-5 text-center lg:left-[33vw] lg:right-auto lg:top-[calc(7vh+min(17vw,26vh)+2vh)] lg:w-[27vw] lg:max-w-none lg:px-0 lg:text-left">
          <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-ink/70">{block.eyebrow}</p>
          <p className="mt-3 text-[16px] font-medium leading-relaxed text-ink/85">{block.text}</p>
          {edition || products.length ? (
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] font-bold uppercase tracking-[0.12em] lg:justify-start">
              {edition ? <span>{edition}</span> : null}
              {/* A count above the edition size would contradict it (stock not set to the edition yet): show only the edition. */}
              {products.length && !(block.editionSize && left > block.editionSize) ? (
                <span className={left <= 10 ? "text-accent" : undefined}>{left === 0 ? "Sold out" : `${left.toLocaleString("en-IN")} left`}</span>
              ) : null}
            </p>
          ) : null}
          <Link href={block.cta.href} className="mt-6 inline-flex h-14 items-center bg-black px-7 text-[13px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-ink">
            {block.cta.label} →
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
    </section>
  );
}
