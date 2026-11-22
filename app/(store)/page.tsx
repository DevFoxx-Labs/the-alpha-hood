import type { Metadata } from "next";
import { HomeBlocks } from "@/components/home/home-blocks";
import { Holding } from "@/components/store/holding";
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
