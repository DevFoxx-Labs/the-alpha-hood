import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OutlineMarquee } from "@/components/brand/outline-marquee";
import { devPagesEnabled } from "@/lib/dev-tools";

export const metadata: Metadata = {
  title: "Outline-text background (demo)",
  robots: { index: false, follow: false },
};

/**
 * Dev-only demo of <OutlineMarquee> (owner's brief: docs/samples/outline-text-background/, where the original
 * sample.html is kept unchanged). It shows a dark hero with a headline, the light theme, and the props.
 */
export default function OutlineMarqueeDemoPage() {
  if (!devPagesEnabled()) notFound();
  return (
    <main>
      <section className="on-dark relative isolate grid min-h-[90svh] place-items-center overflow-hidden bg-black px-6 text-center text-white">
        <OutlineMarquee accentRow={1} />
        <div className="relative z-[1]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-volt">Dark theme · accentRow={"{1}"}</p>
          <h1 className="mt-3 font-display text-[60px] uppercase leading-[0.86] lg:text-[128px]">
            Built for
            <br />
            the ones who lead
          </h1>
        </div>
      </section>

      <section className="relative isolate grid min-h-[70svh] place-items-center overflow-hidden bg-white px-6 text-center">
        <OutlineMarquee theme="light" rows={4} />
        <div className="relative z-[1]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-ink-2">Light theme</p>
          <h2 className="mt-3 font-display text-[48px] uppercase leading-[0.9] lg:text-[96px]">Light section</h2>
        </div>
      </section>

      <section className="relative isolate grid min-h-[60svh] place-items-center overflow-hidden bg-soft px-6 text-center">
        <OutlineMarquee theme="light" rows={3} speed={2} opacity={0.12} className="[--olm-fade:var(--color-soft)]" />
        <div className="relative z-[1]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-ink-2">Light on soft · speed 2 · opacity 0.12 · custom fade</p>
          <h2 className="mt-3 font-display text-[48px] uppercase leading-[0.9] lg:text-[96px]">New drop</h2>
        </div>
      </section>

      <section className="on-dark relative isolate grid min-h-[60svh] place-items-center overflow-hidden bg-black px-6 text-center text-white">
        <OutlineMarquee text="ALPHA CLUB" rows={2} speed={0.5} grain={false} />
        <div className="relative z-[1]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">text=&quot;ALPHA CLUB&quot; · 2 rows · speed 0.5 · no grain</p>
          <h2 className="mt-3 font-display text-[48px] uppercase leading-[0.9] lg:text-[96px]">Members only</h2>
        </div>
      </section>
    </main>
  );
}
