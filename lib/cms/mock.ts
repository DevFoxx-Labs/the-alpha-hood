/**
 * Mock CMS content (CMS-01). Announcement messages, header links and the menu drawer are CMS-managed
 * in production (GLB-01, GLB-03); these demo values stand in until the CMS is chosen (PRD §9).
 * Offer claims here are DEMO copy — only publish offers that are actually live.
 */
import type { GarmentKind } from "@/lib/commerce/types";

export interface AnnouncementMessage {
  strong?: string;
  text: string;
  /** Shorter wording for the one-at-a-time mobile bar (≤ ~38 characters). */
  mobileText?: string;
  href?: string;
}

export const ANNOUNCEMENTS: AnnouncementMessage[] = [
  { strong: "Flat 10% off", text: "on your first order · code ALPHA10", mobileText: "on first order · ALPHA10" },
  { strong: "Free shipping", text: "above ₹999" },
  { strong: "Easy 7-day", text: "returns & exchanges" },
  { strong: "COD", text: "available" },
];

export interface NavLink {
  label: string;
  href: string;
  tone?: "sale";
}

export const HEADER_LINKS: NavLink[] = [
  { label: "New in", href: "/collections/new-in" },
  { label: "Bestsellers", href: "/collections/bestsellers" },
  { label: "Sale", href: "/collections/sale", tone: "sale" },
];

export interface MenuItem {
  label: string;
  href: string;
  badge?: { text: string; tone: "red" | "black" };
  tone?: "sale";
}

export interface MenuPromo {
  title: string;
  href: string;
  /** Placeholder fill until a campaign photo is uploaded. */
  fill: string;
  art?: GarmentKind;
}

export interface MenuTab {
  id: string;
  label: string;
  promos: [MenuPromo, MenuPromo];
  items: MenuItem[];
}

export const MENU: { tabs: MenuTab[]; footerTiles: { title: string; href: string; tone: "volt" | "black" }[] } = {
  tabs: [
    {
      id: "shop",
      label: "Shop",
      promos: [
        { title: "New\nIn", href: "/collections/new-in", fill: "#151515" },
        { title: "Winter\nEdit", href: "/collections/winter-edit", fill: "#5a1f2a" },
      ],
      items: [
        { label: "All", href: "/men" },
        { label: "Bestsellers", href: "/collections/bestsellers" },
        { label: "Shirts", href: "/men/shirts" },
        { label: "T-shirts | Polo", href: "/men/t-shirts" },
        { label: "Jeans", href: "/men/jeans" },
        { label: "Trousers", href: "/men/trousers" },
        { label: "Cargo pants", href: "/men/cargo-pants" },
        { label: "Joggers", href: "/men/joggers" },
        { label: "Hoodies", href: "/men/hoodies" },
        { label: "Sweaters", href: "/men/sweaters" },
        { label: "Jackets", href: "/men/jackets", badge: { text: "New", tone: "red" } },
        { label: "Co-ords", href: "/men/co-ords" },
        { label: "Shorts", href: "/men/shorts" },
        { label: "Sneakers", href: "/men/sneakers" },
        { label: "Sunglasses", href: "/men/sunglasses", badge: { text: "₹999", tone: "red" } },
        { label: "Accessories", href: "/men/accessories" },
        { label: "Plus size", href: "/collections/plus-size", badge: { text: "3XL–5XL", tone: "black" } },
        { label: "Sale", href: "/collections/sale", tone: "sale" },
      ],
    },
    {
      id: "collections",
      label: "Collections",
      promos: [
        { title: "Puffer\nSeason", href: "/collections/puffer-season", fill: "#3a3a3c" },
        { title: "Knit\nClub", href: "/collections/knit-club", fill: "#6b5a43" },
      ],
      items: [
        { label: "Winter drop", href: "/collections/winter-drop", badge: { text: "New", tone: "red" } },
        { label: "Smart casuals", href: "/collections/smart-casuals" },
        { label: "Streetwear", href: "/collections/streetwear" },
        { label: "Weekend uniform", href: "/collections/weekend-uniform" },
        { label: "Office ready", href: "/collections/office-ready" },
        { label: "Under ₹999", href: "/collections/under-999" },
        { label: "Combos", href: "/collections/combos" },
        { label: "Price drop", href: "/collections/price-drop", tone: "sale" },
      ],
    },
  ],
  footerTiles: [
    { title: "Gift\nCards", href: "/gift-cards", tone: "volt" },
    { title: "Alpha\nClub", href: "/alpha-club", tone: "black" },
  ],
};
