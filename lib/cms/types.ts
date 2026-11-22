import type { GarmentKind } from "@/lib/commerce/types";
import type { AnnouncementMessage, MenuTab, NavLink } from "./mock";

/**
 * CMS content model (CMS-01/02). Platform-neutral like lib/commerce: Sanity / Contentful / Strapi /
 * Shopify metaobjects map onto these types in their adapter (provider decision pending — PRD §9).
 */
export type Device = "mobile" | "desktop";

/** CMS-02 scheduling + device targeting, available on every block and hero slide. */
export interface Targeting {
  /** ISO timestamps; inclusive start, exclusive end. */
  startsAt?: string;
  endsAt?: string;
  /** Omit for all devices. */
  devices?: Device[];
}

export interface FigureLook {
  top: string;
  bottom: string;
  skin?: string;
}

/** HOME-01. `image` URLs come from the CMS asset pipeline; until the shoot, `placeholder` drives the art. */
export interface HeroSlide extends Targeting {
  id: string;
  kicker: string;
  /** Lines of the giant Anton headline. */
  headline: string[];
  subline: string;
  cta: { label: string; href: string };
  textTone: "volt" | "white";
  image?: { desktop: string; mobile: string; alt: string };
  placeholder: { fill: string; look: FigureLook };
}

/** Campaign / mascot art for a tile or band: a /public path plus the colour baked into its background. */
export interface TileImage {
  src: string;
  width: number;
  height: number;
  /** Panel colour so the image edge disappears (null = transparent image). */
  bg: string | null;
}

export type HomeBlock = Targeting & { id: string } & (
    | { type: "hero"; slides: HeroSlide[] }
    | { type: "category_rail"; lead: string; title: string; viewAllHref: string }
    | { type: "promo_band"; left: string; right: string; highlight: string; href: string; image?: TileImage }
    | {
        type: "collection_tiles";
        tiles: { title: string; tagline: string; href: string; fill: string; look: FigureLook; image?: TileImage }[];
      }
    | {
        /** Editorial band: art on one side, headline + CTA on the other (MASCOT_PROMPTS §7 collection launch). */
        type: "campaign_band";
        kicker: string;
        headline: string[];
        text: string;
        cta: { label: string; href: string };
        image: TileImage & { alt: string };
      }
    | {
        type: "offer_tiles";
        tiles: { lines: string[]; price: string; href: string; art: GarmentKind; colour: string; dark?: boolean }[];
      }
    | {
        type: "product_tabs";
        title: string;
        viewAllHref: string;
        perTab: number;
        tabs: { label: string; category?: string }[];
      }
    | { type: "product_grid"; lead?: string; title: string; viewAllHref: string; sort: "featured" | "newest"; limit: number }
    | { type: "trust_strip" }
    | {
        type: "seo";
        heading: string;
        groups: { title: string; links: NavLink[] }[];
        text: string[];
      }
  );

export interface FooterContent {
  blurb: string;
  columns: { title: string; links: NavLink[] }[];
  newsletter: { heading: string; text: string };
  /** Only configured profiles are shown (no dead links). */
  social: { label: string; href: string }[];
  paymentMethods: string[];
}

/** PLP-05 merchandising tile inserted into listing grids. */
export interface ListingTile extends Targeting {
  id: string;
  kicker: string;
  lines: string[];
  /** Index of the line shown in volt. */
  highlightLine?: number;
  text: string;
  cta: { label: string; href: string };
}

export interface CmsAdapter {
  readonly name: string;
  getAnnouncements(): Promise<AnnouncementMessage[]>;
  getHeaderLinks(): Promise<NavLink[]>;
  getMenu(): Promise<{ tabs: MenuTab[]; footerTiles: { title: string; href: string; tone: "volt" | "black" }[] }>;
  getHomepage(): Promise<HomeBlock[]>;
  getFooter(): Promise<FooterContent>;
  getListingTile(): Promise<ListingTile | null>;
  /** SRCH-01 trending searches. */
  getTrendingSearches(): Promise<string[]>;
}
