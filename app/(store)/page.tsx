import type { Metadata } from "next";
import { HomeBlocks } from "@/components/home/home-blocks";
import { getHomePage } from "@/lib/storefront";

export const metadata: Metadata = {
  title: { absolute: "The Alpha Hood — Streetwear & everyday menswear, designed in India" },
  description:
    "Oversized tees, baggy jeans, overshirts, knits and puffers. New drops every week, combo offers and easy size exchanges.",
  alternates: { canonical: "/" },
};

/** M2 homepage (reference/01-homepage.png): CMS blocks in CMS order. */
export default async function Home() {
  const blocks = await getHomePage();
  if (!blocks) return <Holding />;
  return <HomeBlocks blocks={blocks} />;
}

/** Shown in production until a real commerce platform + CMS are configured (never demo data). */
function Holding() {
  return (
    <section className="on-dark grid min-h-[70dvh] place-items-center bg-black px-6 text-center text-white">
      <div className="flex flex-col items-center gap-5">
        <h1 className="font-display text-[62px] uppercase leading-[0.86] text-volt lg:text-[148px]">
          Coming
          <br />
          soon
        </h1>
        <p className="text-[14px] text-white/70">Built for the ones who lead.</p>
      </div>
    </section>
  );
}
