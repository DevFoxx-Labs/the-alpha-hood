import type { Metadata } from "next";
import { HomeBlocks } from "@/components/home/home-blocks";
import { Holding } from "@/components/store/holding";
import { STORE_CONFIG } from "@/lib/config/store";
import { isPlaceholder, LEGAL_CONFIG } from "@/lib/legal/config";
import { siteJsonLd, toJsonLd } from "@/lib/seo/json-ld";
import { SITE_ORIGIN } from "@/lib/seo/site";
import { getHomePage, getShell } from "@/lib/storefront";

const DESCRIPTION =
  "Oversized tees, baggy jeans, overshirts, knits and puffers. New drops every week, combo offers and easy size exchanges.";

export const metadata: Metadata = {
  title: { absolute: "The Alpha Hood — Streetwear & everyday menswear, designed in India" },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
};

/** M2 homepage (reference/01-homepage.png): CMS blocks in CMS order. CMS-03: Organization + WebSite data. */
export default async function Home() {
  const [blocks, shell] = await Promise.all([getHomePage(), getShell()]);
  if (!blocks) return <Holding />;
  const real = (v: string) => (isPlaceholder(v) ? null : v);
  const ld = siteJsonLd({
    origin: SITE_ORIGIN,
    name: STORE_CONFIG.name,
    description: DESCRIPTION,
    sameAs: shell?.footer.social.map((s) => s.href) ?? [],
    email: real(LEGAL_CONFIG.supportEmail),
    phone: real(LEGAL_CONFIG.supportPhone),
  });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(ld) }} />
      <HomeBlocks blocks={blocks} />
    </>
  );
}
