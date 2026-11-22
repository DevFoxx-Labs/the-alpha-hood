import type { FooterContent, HomeBlock } from "./types";

/**
 * Demo homepage + footer content (reference/01-homepage.png). Every offer, price and claim here is DEMO
 * copy — the live store must only publish offers that are actually running (PRD §14, DESIGN.md §6).
 */
export const MOCK_HOMEPAGE: HomeBlock[] = [
  {
    id: "hero",
    type: "hero",
    slides: [
      {
        id: "winter-drop",
        kicker: "Winter drop · 2026",
        headline: ["Own", "the cold"],
        subline: "Layers built for the streets. Puffers, knits & heavyweight hoodies.",
        cta: { label: "Shop the drop", href: "/collections/winter-drop" },
        textTone: "volt",
        placeholder: { fill: "#161616", look: { top: "#151515", bottom: "#2d3f5a", skin: "#C9946B" } },
      },
      {
        id: "weekend-uniform",
        kicker: "New in",
        headline: ["The weekend", "uniform"],
        subline: "Relaxed cargos, boxy overshirts and heavyweight tees.",
        cta: { label: "Shop new in", href: "/collections/new-in" },
        textTone: "white",
        placeholder: { fill: "#2f3326", look: { top: "#7a5230", bottom: "#59603f", skin: "#B98563" } },
      },
      {
        id: "bestsellers",
        kicker: "Bestsellers",
        headline: ["Built to", "lead"],
        subline: "The pieces everyone is wearing this season.",
        cta: { label: "Shop bestsellers", href: "/collections/bestsellers" },
        textTone: "volt",
        placeholder: { fill: "#3a1219", look: { top: "#e8e1cf", bottom: "#1b1b1b", skin: "#8a5a3c" } },
      },
    ],
  },
  { id: "categories", type: "category_rail", lead: "Shop by", title: "Category", viewAllHref: "/men" },
  {
    id: "promo",
    type: "promo_band",
    left: "Last call\non bestsellers",
    right: "Up to 40%\noff",
    highlight: "40%",
    href: "/collections/sale",
  },
  {
    id: "collections",
    type: "collection_tiles",
    tiles: [
      { title: "Puffer\nseason", tagline: "Warmth with an attitude", href: "/collections/puffer-season", fill: "#8a8c90", look: { top: "#5a1f2a", bottom: "#151515", skin: "#B98563" } },
      { title: "Smart\ncasuals", tagline: "Monday to Friday, sorted", href: "/collections/smart-casuals", fill: "#5a5a5a", look: { top: "#151515", bottom: "#d8c9a8", skin: "#C9946B" } },
      { title: "Knit\nclub", tagline: "Texture that talks", href: "/collections/knit-club", fill: "#cfc6b4", look: { top: "#efe9da", bottom: "#2d3f5a", skin: "#8a5a3c" } },
    ],
  },
  {
    id: "offers",
    type: "offer_tiles",
    tiles: [
      { lines: ["Any 2", "bottoms"], price: "₹2,999", href: "/collections/combo-bottoms", art: "trouser", colour: "#c8b99b" },
      { lines: ["Combo", "hoodies"], price: "2 for ₹2,499", href: "/collections/combo-hoodies", art: "hoodie", colour: "#3a3a3c", dark: true },
      { lines: ["Sunglasses", "starting"], price: "₹999", href: "/men/sunglasses", art: "shades", colour: "#1b1b1b" },
      { lines: ["Any 3", "tees"], price: "₹1,999", href: "/collections/combo-tees", art: "tee", colour: "#f4f2ec" },
    ],
  },
  {
    id: "trending",
    type: "product_tabs",
    title: "Trending",
    viewAllHref: "/collections/bestsellers",
    perTab: 8,
    tabs: [
      { label: "All" },
      { label: "Shirts", category: "shirts" },
      { label: "Jackets", category: "jackets" },
      { label: "Jeans", category: "jeans" },
      { label: "Sweaters", category: "sweaters" },
      { label: "Trousers", category: "trousers" },
      { label: "T-shirts", category: "t-shirts" },
      { label: "Hoodies", category: "hoodies" },
      { label: "Shoes", category: "sneakers" },
    ],
  },
  { id: "new-arrivals", type: "product_grid", lead: "Fresh", title: "New arrivals", viewAllHref: "/collections/new-in", sort: "newest", limit: 4 },
  { id: "trust", type: "trust_strip" },
  {
    id: "seo",
    type: "seo",
    heading: "More about shopping at The Alpha Hood",
    groups: [
      {
        title: "Top categories",
        links: [
          { label: "T-shirts", href: "/men/t-shirts" },
          { label: "Oversized T-shirts", href: "/men/t-shirts/oversized" },
          { label: "Shirts", href: "/men/shirts" },
          { label: "Jeans", href: "/men/jeans" },
          { label: "Baggy jeans", href: "/men/jeans/baggy" },
          { label: "Cargo pants", href: "/men/cargo-pants" },
          { label: "Trousers", href: "/men/trousers" },
          { label: "Hoodies", href: "/men/hoodies" },
          { label: "Sweaters", href: "/men/sweaters" },
          { label: "Jackets", href: "/men/jackets" },
          { label: "Co-ords", href: "/men/co-ords" },
          { label: "Shorts", href: "/men/shorts" },
          { label: "Sneakers", href: "/men/sneakers" },
          { label: "Sunglasses", href: "/men/sunglasses" },
          { label: "Accessories", href: "/men/accessories" },
        ],
      },
      {
        title: "Popular searches",
        links: [
          { label: "Black oversized t-shirt", href: "/search?q=black+oversized+t-shirt" },
          { label: "Baggy jeans for men", href: "/search?q=baggy+jeans" },
          { label: "Korean trousers", href: "/search?q=korean+trousers" },
          { label: "Linen shirts", href: "/search?q=linen+shirt" },
          { label: "Check shirts", href: "/search?q=check+shirt" },
          { label: "Puffer jacket men", href: "/search?q=puffer+jacket" },
          { label: "Streetwear men", href: "/search?q=streetwear" },
          { label: "Polo t-shirts", href: "/search?q=polo" },
          { label: "Cargo pants men", href: "/search?q=cargo+pants" },
          { label: "White sneakers", href: "/search?q=white+sneakers" },
        ],
      },
    ],
    text: [
      "The Alpha Hood is a streetwear and everyday menswear label designed in India for the ones who lead. From heavyweight oversized tees and baggy denim to boxy overshirts, knits and puffers, every drop is built for how you actually dress — on the street, at work and on the weekend.",
      "Shop new arrivals every week, combo offers on tees and bottoms, and easy size exchanges. Prices include all taxes, and Cash on Delivery is available on eligible pincodes.",
    ],
  },
];

export function mockFooter(env: Record<string, string | undefined>): FooterContent {
  const social: FooterContent["social"] = [];
  const add = (label: string, url: string | undefined) => {
    // Only https profile links configured by the owner (no dead or injected links).
    if (url && /^https:\/\/[^\s"'<>]+$/.test(url)) social.push({ label, href: url });
  };
  add("Instagram", env.SOCIAL_INSTAGRAM_URL);
  add("YouTube", env.SOCIAL_YOUTUBE_URL);
  add("Facebook", env.SOCIAL_FACEBOOK_URL);
  add("X", env.SOCIAL_X_URL);

  return {
    blurb: "Streetwear & everyday menswear, designed in India. Built for the ones who lead.",
    columns: [
      {
        title: "Shop",
        links: [
          { label: "New in", href: "/collections/new-in" },
          { label: "Bestsellers", href: "/collections/bestsellers" },
          { label: "T-shirts", href: "/men/t-shirts" },
          { label: "Jeans", href: "/men/jeans" },
          { label: "Sale", href: "/collections/sale" },
        ],
      },
      {
        title: "Help",
        links: [
          { label: "Track order", href: "/track-order" },
          { label: "Returns & exchanges", href: "/legal/refund-cancellation" },
          { label: "Shipping", href: "/help/shipping" },
          { label: "Size guide", href: "/help/size-guide" },
          { label: "Contact us", href: "/contact" },
        ],
      },
      {
        title: "Company",
        links: [
          { label: "About us", href: "/about" },
          { label: "Alpha Club", href: "/alpha-club" },
          { label: "Grievance officer", href: "/grievance" },
          { label: "Privacy & your data", href: "/privacy" },
        ],
      },
    ],
    newsletter: {
      heading: "Get first dibs on drops",
      text: "New drops, restocks and offers — by email or WhatsApp. Only if you say yes.",
    },
    social,
    paymentMethods: ["UPI", "Visa", "Mastercard", "RuPay", "COD"],
  };
}
