import { MASCOT, MASCOT_HERO } from "@/lib/brand/mascot";
import type { FooterContent, HomeBlock, ListingTile } from "./types";

/**
 * Demo homepage + footer content (reference/01-homepage.png). Every offer, price and claim here is DEMO
 * copy — the live store must only publish offers that are actually running (PRD §14, DESIGN.md §6).
 */
export const MOCK_HOMEPAGE: HomeBlock[] = [
  {
    id: "hero",
    type: "hero",
    slides: [
      // Mascot campaign art (MASCOT_PROMPTS §7: #21 rooftop hero, #15 hood-up drop, #10 run) until the
      // product campaign shoot replaces slides 2–3 with real models.
      {
        id: "own-the-city",
        kicker: "The Alpha Hood · Designed in India",
        headline: ["Own", "the city"],
        subline: "Streetwear and everyday menswear. Built for the ones who lead.",
        cta: { label: "Shop new in", href: "/collections/new-in" },
        textTone: "volt",
        image: { desktop: MASCOT_HERO.rooftop.desktop, mobile: MASCOT_HERO.rooftop.mobile, alt: "Alpha, the brand's wolf mascot, in a black hoodie on a Mumbai rooftop at night" },
        placeholder: { fill: "#1b2c49", look: { top: "#151515", bottom: "#151515", skin: "#C9946B" } },
      },
      {
        id: "winter-drop",
        kicker: "Winter drop · 2026",
        headline: ["Hood", "up"],
        subline: "Heavyweight hoodies, puffers and knits. Layers built for the streets.",
        cta: { label: "Shop the drop", href: "/collections/winter-drop" },
        textTone: "white",
        image: { desktop: MASCOT_HERO["hood-up"].desktop, mobile: MASCOT_HERO["hood-up"].mobile, alt: "Alpha pulling his black hood up in golden smoke" },
        placeholder: { fill: "#0a0a0a", look: { top: "#151515", bottom: "#151515", skin: "#C9946B" } },
      },
      {
        id: "bestsellers",
        kicker: "Bestsellers",
        headline: ["Built to", "lead"],
        subline: "The pieces everyone is wearing this season.",
        cta: { label: "Shop bestsellers", href: "/collections/bestsellers" },
        textTone: "volt",
        image: { desktop: MASCOT_HERO.run.desktop, mobile: MASCOT_HERO.run.mobile, alt: "Alpha running with a black mailer box under his arm" },
        placeholder: { fill: "#0a0a0a", look: { top: "#151515", bottom: "#151515", skin: "#C9946B" } },
      },
    ],
  },
  { id: "categories", type: "category_rail", lead: "Shop by", title: "Category", viewAllHref: "/men" },
  {
    // DEMO: the mascot stands in for the brand ambassador until the real shoot (Admin → Homepage replaces it).
    id: "ambassador",
    type: "ambassador",
    eyebrow: "Brand ambassador · Signed collection",
    line1: "Signed by",
    line2: "the alpha.",
    text: "Exclusive pieces, each hand-signed by our ambassador and made in small numbers. Once they're gone, they're gone.",
    ambassadorName: "Alpha",
    cta: { label: "Shop the signed collection", href: "/collections/bestsellers" },
    desktopImage: MASCOT_HERO["hood-up"].desktop,
    mobileImage: MASCOT_HERO["hood-up"].mobile,
    alt: "The brand ambassador in a black hoodie",
    productIds: [],
  },
  {
    id: "promo",
    type: "promo_band",
    left: "Last call\non bestsellers",
    right: "Up to 40%\noff",
    highlight: "40%",
    href: "/collections/sale",
    image: MASCOT["alpha-06-shopping-haul"],
  },
  {
    id: "collections",
    type: "collection_tiles",
    tiles: [
      { title: "Puffer\nseason", tagline: "Warmth with an attitude", href: "/collections/puffer-season", fill: MASCOT["season-16-winter"].bg, look: { top: "#151515", bottom: "#151515" }, image: MASCOT["season-16-winter"] },
      { title: "Smart\ncasuals", tagline: "Monday to Friday, sorted", href: "/collections/smart-casuals", fill: MASCOT["season-17-linen"].bg, look: { top: "#efe9da", bottom: "#d8c9a8" }, image: MASCOT["season-17-linen"] },
      { title: "Denim\ndays", tagline: "Baggy, washed, worn in", href: "/men/jeans", fill: MASCOT["season-19-denim"].bg, look: { top: "#8fb3d1", bottom: "#8fb3d1" }, image: MASCOT["season-19-denim"] },
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
  { id: "look-street-uniform", type: "shop_the_look", lookId: "street-uniform", lead: "Shop", title: "The look" },
  { id: "new-arrivals", type: "product_grid", lead: "Fresh", title: "New arrivals", viewAllHref: "/collections/new-in", sort: "newest", limit: 4 },
  {
    id: "the-pack",
    type: "campaign_band",
    kicker: "The Pack",
    headline: ["One pack.", "Every fit."],
    text: "Puffers, overshirts, varsity jackets and the hoodie that started it all. Find the look that leads.",
    cta: { label: "Meet the pack", href: "/about" },
    image: { ...MASCOT["scene-22-the-pack"], alt: "Alpha and three wolf friends in streetwear under a city underpass" },
  },
  {
    id: "alpha-club",
    type: "club_band",
    title: "Alpha Club",
    text: "Free to join. Hood Coins on every order, 30-day returns, early access to drops and a code to share with friends.",
    cta: { label: "Join the club", href: "/alpha-club" },
  },
  { id: "wear-the-hood", type: "ugc_grid", title: "#WearTheHood", text: "Real fits from the pack. Share yours from your account after delivery." },
  {
    // DEMO art; Admin → Homepage sets the real limited drop.
    id: "limited-edition",
    type: "limited_edition",
    eyebrow: "Limited edition · Numbered & signed",
    line1: "Limited",
    line2: "Edition.",
    text: "A small run, numbered and signed by our ambassador, with a certificate of authenticity. When the last one sells, it's over.",
    cta: { label: "Shop the drop", href: "/collections/new-in" },
    editionSize: 100,
    cutoutImage: MASCOT["alpha-01-hero-stance"].src,
    cutoutAlt: "The ambassador holding the limited-edition piece",
    sceneImage: MASCOT["scene-25-lookbook"].src,
    productIds: [],
  },
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

const blockById = (id: string) => MOCK_HOMEPAGE.find((b) => b.id === id)!;

/**
 * "Exclusive drop" landing page (Admin → Homepage → Landing page layout): a few signed, limited pieces instead of a
 * full catalogue. No discount promos, combo offers, category rails or empty tabs. Hero, ambassador, limited edition,
 * campaign and SEO content are shared with the full-store layout (one admin content for both). DEMO copy.
 */
export const MOCK_DROP_HOMEPAGE: HomeBlock[] = [
  {
    id: "hero",
    type: "hero",
    slides: [
      {
        id: "the-drop",
        kicker: "The signed drop · Limited",
        headline: ["The", "drop"],
        subline: "Two pieces. Hand-signed by our ambassador. Made in small numbers.",
        cta: { label: "Shop the hoodie", href: "#spotlight-hoodie" },
        textTone: "volt",
        image: { desktop: MASCOT_HERO["hood-up"].desktop, mobile: MASCOT_HERO["hood-up"].mobile, alt: "The signed black hoodie" },
        placeholder: { fill: "#0a0a0a", look: { top: "#151515", bottom: "#151515", skin: "#C9946B" } },
      },
    ],
  },
  blockById("ambassador"),
  {
    id: "spotlight-hoodie",
    type: "product_spotlight",
    lead: "Piece 01",
    title: "The Hoodie",
    productId: "",
    demoCategory: "hoodies",
    details: ["Heavyweight 450 GSM brushed fleece", "Boxy, dropped-shoulder fit", "Hand-signed on the inside hem", "Numbered, with a certificate of authenticity"],
    signedBy: "Alpha",
    editionSize: 100,
    reverse: false,
  },
  {
    id: "spotlight-tee",
    type: "product_spotlight",
    lead: "Piece 02",
    title: "The Tee",
    productId: "",
    demoCategory: "t-shirts",
    details: ["240 GSM combed cotton", "Oversized fit, holds its shape", "Pick your colour", "Signed print on the back"],
    signedBy: "Alpha",
    editionSize: null,
    reverse: true,
  },
  {
    id: "exclusive",
    type: "exclusive_points",
    title: "Why it's exclusive",
    points: [
      { title: "Hand-signed", text: "Every piece carries our ambassador's autograph — signed by hand, not printed." },
      { title: "Numbered", text: "Your piece has its own number in the edition. When the run ends, it doesn't come back." },
      { title: "Certified", text: "A certificate of authenticity ships with every order." },
      { title: "Boxed", text: "Packed in our collector's box, ready to keep or to gift." },
    ],
  },
  blockById("limited-edition"),
  blockById("alpha-club"),
  blockById("wear-the-hood"),
  blockById("trust"),
  {
    id: "seo",
    type: "seo",
    heading: "About The Alpha Hood drop",
    groups: [
      {
        title: "Shop",
        links: [
          { label: "Signed hoodie", href: "/men/hoodies" },
          { label: "Signed tee", href: "/men/t-shirts" },
          { label: "Size guide", href: "/help/size-guide" },
          { label: "Alpha Club", href: "/alpha-club" },
        ],
      },
    ],
    text: ["The Alpha Hood releases streetwear in small, signed drops. Each piece is hand-signed by our brand ambassador, numbered and shipped with a certificate of authenticity. Prices include all taxes."],
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
          { label: "FAQ", href: "/help/faq" },
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

/** PLP-05 grid tile (reference/02 shows Alpha Club, which is P1 — a combo tile links to a live collection). */
export const MOCK_LISTING_TILE: ListingTile = {
  id: "combo-bottoms",
  kicker: "Combo offer",
  lines: ["Any 2", "bottoms", "₹2,999"],
  highlightLine: 2,
  text: "Mix and match jeans, trousers, cargos and joggers.",
  cta: { label: "Shop combos", href: "/collections/combo-bottoms" },
};

export const MOCK_TRENDING_SEARCHES = ["Baggy jeans", "Oversized tee", "Puffer jacket", "Linen shirt", "Korean trousers", "Hoodie"];
