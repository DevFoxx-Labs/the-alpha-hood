import type { HomeBlock } from "@/lib/cms/types";

type Block = Extract<HomeBlock, { type: "exclusive_points" }>;

/** "Exclusive drop" layout: why the pieces are worth their price — numbered tiles on black (volt numbers). */
export function ExclusivePoints({ block }: { block: Block }) {
  return (
    <section aria-labelledby={`${block.id}-h`} className="on-dark bg-black text-white">
      <div className="mx-auto max-w-[1440px] px-4 py-12 lg:px-10 lg:py-20">
        <h2 id={`${block.id}-h`} className="font-display text-[44px] uppercase leading-none lg:text-[80px]">
          {block.title}
        </h2>
        <ol className="mt-8 grid gap-px bg-white/15 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4">
          {block.points.map((p, i) => (
            <li key={p.title} className="bg-black p-6 lg:p-8">
              <span className="font-display text-[48px] leading-none text-volt lg:text-[64px]">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-4 text-[15px] font-bold uppercase tracking-[0.12em]">{p.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-white/70">{p.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
