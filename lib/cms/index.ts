import { type Env, mockDataAllowed } from "@/lib/mock-guard";
import { ANNOUNCEMENTS, HEADER_LINKS, MENU } from "./mock";
import { MOCK_HOMEPAGE, MOCK_LISTING_TILE, MOCK_TRENDING_SEARCHES, mockFooter } from "./mock-home";
import type { CmsAdapter } from "./types";

/**
 * Picks the CMS adapter (CMS-01). Provider pending (Sanity / Contentful / Strapi / Shopify metaobjects —
 * PRD §9). The mock holds DEMO offers, so like mock commerce it is refused in production unless
 * ALLOW_MOCK_DATA is exactly "true".
 */
export function resolveCms(env: Env = process.env): CmsAdapter {
  const provider = env.CMS_PROVIDER ?? "mock";
  if (provider !== "mock") throw new Error(`Unknown CMS_PROVIDER "${provider}"`);
  if (!mockDataAllowed(env)) return refusingCms();

  return {
    name: "mock",
    getAnnouncements: async () => ANNOUNCEMENTS,
    getHeaderLinks: async () => HEADER_LINKS,
    getMenu: async () => MENU,
    getHomepage: async () => MOCK_HOMEPAGE,
    getFooter: async () => mockFooter(env),
    getListingTile: async () => MOCK_LISTING_TILE,
    getTrendingSearches: async () => MOCK_TRENDING_SEARCHES,
  };
}

function refusingCms(): CmsAdapter {
  const fail = async (): Promise<never> => {
    throw new Error("Mock CMS is disabled in production. Set CMS_PROVIDER to a real CMS.");
  };
  return {
    name: "disabled",
    getAnnouncements: fail,
    getHeaderLinks: fail,
    getMenu: fail,
    getHomepage: fail,
    getFooter: fail,
    getListingTile: fail,
    getTrendingSearches: fail,
  };
}

export const cms = resolveCms(process.env);
export type { CmsAdapter, FooterContent, HomeBlock, HeroSlide, ListingTile } from "./types";
