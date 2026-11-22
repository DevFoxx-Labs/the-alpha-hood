import { Mascot } from "@/components/brand/mascot";

/**
 * Shown in production until a real commerce platform + CMS are configured (never demo data).
 * MASCOT_PROMPTS §2 #15 "Hood-up drop" — the coming-soon moment. It's this page's LCP image: priority, sized.
 */
export function Holding() {
  return (
    <section className="on-dark grid min-h-[70dvh] items-center overflow-hidden bg-black text-white lg:grid-cols-2">
      <div className="order-2 flex flex-col items-center gap-5 px-6 pb-14 pt-4 text-center lg:order-1 lg:items-start lg:px-[72px] lg:py-20 lg:text-left">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">The Alpha Hood · Designed in India</p>
        <h1 className="font-display text-[62px] uppercase leading-[0.86] text-volt lg:text-[148px]">
          Coming
          <br />
          soon
        </h1>
        <p className="max-w-[420px] text-[14px] leading-[1.6] text-white/70 lg:text-[16px]">
          Built for the ones who lead. Streetwear and everyday menswear — the first drop lands here.
        </p>
      </div>
      <Mascot
        name="alpha-15-hood-up"
        priority
        sizes="(min-width: 1024px) 50vw, 80vw"
        className="order-1 mx-auto w-[78%] max-w-[420px] [mask-image:linear-gradient(to_bottom,black_75%,transparent)] lg:order-2 lg:w-full lg:max-w-[560px]"
      />
    </section>
  );
}
