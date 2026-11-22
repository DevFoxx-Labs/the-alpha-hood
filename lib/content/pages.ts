import { STORE_CONFIG } from "@/lib/config/store";
import { formatINR } from "@/lib/format";
import { fillTokens, tokenValues } from "@/lib/legal";
import type { LegalConfig } from "@/lib/legal/config";
import type { NoticeBlock, NoticeSection } from "@/lib/legal/types";
import { PREPAID_OFFER } from "@/lib/promotions/automatic";
import { RETURN_RULES } from "@/lib/returns/rules";

/**
 * CMS-04 help & company pages. Text lives here once (like the legal notices) and every commercial number is a
 * token filled from the same config checkout uses, so a page can never promise a fee or window checkout
 * doesn't apply. Moves to the CMS when one is chosen (PRD §9). DRAFT copy: owner to review.
 */
export const CONTENT_SLUGS = ["shipping", "faq", "about", "contact"] as const;
export type ContentSlug = (typeof CONTENT_SLUGS)[number];

export interface ContentPage {
  slug: ContentSlug;
  path: string;
  title: string;
  description: string;
  lastUpdated: string;
  sections: NoticeSection[];
}

type RawPage = Omit<ContentPage, "sections"> & { sections: NoticeSection[] };

const PAGES: Record<ContentSlug, RawPage> = {
  shipping: {
    slug: "shipping",
    path: "/help/shipping",
    title: "Shipping & delivery",
    description: "Delivery times, shipping fees, Cash on Delivery and tracking.",
    lastUpdated: "2026-11-24",
    sections: [
      {
        id: "fees",
        heading: "Shipping fees",
        blocks: [
          {
            type: "list",
            items: [
              "Free standard shipping on orders of {{freeShippingThreshold}} or more (after discounts).",
              "Below that, standard shipping is {{shippingFee}}.",
              "Express delivery, where available for your pincode, is shown with its fee at checkout before you pay.",
              "The full price, including every fee and GST, is shown before you place the order.",
            ],
          },
        ],
      },
      {
        id: "times",
        heading: "Delivery times",
        blocks: [
          {
            type: "p",
            text: "Enter your pincode on any product page or at checkout to see the delivery date for your address. Orders placed before 2 pm IST are dispatched the same business day; Sundays and public holidays are not counted.",
          },
        ],
      },
      {
        id: "cod",
        heading: "Cash on Delivery",
        blocks: [
          {
            type: "list",
            items: [
              "Available on orders up to {{codMaxOrderValue}} in serviceable pincodes. A {{codFee}} handling fee applies.",
              "We may ask you to confirm a COD order by phone before we pack it.",
              "Pay online by UPI and get {{prepaidOffer}}.",
            ],
          },
        ],
      },
      {
        id: "tracking",
        heading: "Tracking your order",
        blocks: [
          {
            type: "p",
            text: "You get the courier and tracking number once your order ships. Track it from your account or at /track-order with your order number and phone.",
          },
        ],
      },
      {
        id: "issues",
        heading: "Missed or damaged deliveries",
        blocks: [
          {
            type: "list",
            items: [
              "If the courier can't reach you, they try again. Orders that come back to us are refunded if prepaid.",
              "Report a damaged parcel or wrong item within {{damageReportHours}} hours of delivery with photos — replacements and returns for these are always free. See /legal/refund-cancellation.",
            ],
          },
        ],
      },
    ],
  },
  faq: {
    slug: "faq",
    path: "/help/faq",
    title: "Frequently asked questions",
    description: "Orders, sizes, payments, returns and your account.",
    lastUpdated: "2026-11-24",
    sections: [
      {
        id: "size",
        heading: "How do I find my size?",
        blocks: [{ type: "p", text: "Every product page has a size guide with garment measurements. Not sure? Exchanges for a different size are free within {{returnWindowDays}} days of delivery. See /help/size-guide." }],
      },
      {
        id: "cancel",
        heading: "Can I cancel my order?",
        blocks: [{ type: "p", text: "Yes, from your account until it is packed, with no fee. Prepaid amounts are refunded to the original payment method. See /legal/refund-cancellation." }],
      },
      {
        id: "return",
        heading: "How do returns and exchanges work?",
        blocks: [
          {
            type: "p",
            text: "Request a return or size exchange from your account within {{returnWindowDays}} days of delivery. We arrange a pickup. Your first return is free; after that a {{returnFee}} fee applies (never for damaged or wrong items). Store credit comes with a {{storeCreditBonus}}% bonus if you choose it.",
          },
        ],
      },
      {
        id: "refund",
        heading: "When do I get my refund?",
        blocks: [{ type: "p", text: "We start the refund within {{refundInitiateDays}} days of the item passing quality check. Cash on Delivery orders are refunded to your UPI ID or as store credit." }],
      },
      {
        id: "payment",
        heading: "Which payment methods do you accept?",
        blocks: [{ type: "p", text: "UPI, cards, net banking, wallets and Cash on Delivery (up to {{codMaxOrderValue}}, {{codFee}} fee). We never see or store your card number." }],
      },
      {
        id: "account",
        heading: "Do I need an account?",
        blocks: [{ type: "p", text: "You sign in with your phone number and a one-time code at checkout. You can download your data or delete your account at any time from /privacy." }],
      },
      {
        id: "contact",
        heading: "How do I reach you?",
        blocks: [{ type: "p", text: "Email {{supportEmail}} or call {{supportPhone}} ({{supportHours}}). Complaints go to our Grievance Officer at /grievance." }],
      },
    ],
  },
  about: {
    slug: "about",
    path: "/about",
    title: "About us",
    description: "{{storeName}}: bold streetwear and everyday menswear, designed in India.",
    lastUpdated: "2026-11-24",
    sections: [
      {
        id: "story",
        heading: "Built for the ones who lead",
        blocks: [
          {
            type: "p",
            text: "{{storeName}} makes bold streetwear and everyday menswear — oversized tees, baggy denim, overshirts, knits and outerwear — designed in India, with new drops every week.",
          },
        ],
      },
      {
        id: "promise",
        heading: "Our promise",
        blocks: [
          {
            type: "list",
            items: [
              "Real measurements on every product page, and free size exchanges.",
              "The full price, with every fee and GST, before you pay.",
              "Your data used only for what you agreed to. See /privacy.",
            ],
          },
        ],
      },
      {
        id: "company",
        heading: "The company",
        blocks: [{ type: "p", text: "{{storeName}} is operated by {{entityName}}, {{registeredAddress}}. GSTIN {{gstin}}." }],
      },
    ],
  },
  contact: {
    slug: "contact",
    path: "/contact",
    title: "Contact us",
    description: "Customer care, the seller's details and the Grievance Officer.",
    lastUpdated: "2026-11-24",
    sections: [
      {
        id: "care",
        heading: "Customer care",
        blocks: [
          {
            type: "list",
            items: [
              "Email: {{supportEmail}}",
              "Phone: {{supportPhone}}",
              "Hours: {{supportHours}}",
              "For an order, include your order number. Track an order at /track-order.",
            ],
          },
        ],
      },
      {
        id: "seller",
        heading: "Seller details",
        blocks: [
          {
            type: "table",
            head: ["", ""],
            rows: [
              ["Legal name", "{{entityName}}"],
              ["Registered address", "{{registeredAddress}}"],
              ["GSTIN", "{{gstin}}"],
            ],
          },
        ],
      },
      {
        id: "grievance",
        heading: "Grievance Officer",
        blocks: [
          {
            type: "p",
            text: "{{grievanceName}}, {{grievanceDesignation}} — {{grievanceEmail}}, {{grievancePhone}}. We acknowledge complaints within {{ackHours}} hours and resolve them within {{resolveDays}} days. Details at /grievance.",
          },
        ],
      },
      {
        id: "privacy",
        heading: "Privacy requests",
        blocks: [{ type: "p", text: "To access, correct or delete your data, or withdraw consent, use /privacy/request or write to {{privacyEmail}}." }],
      },
    ],
  },
};

export function contentTokens(config?: LegalConfig): Record<string, string> {
  return {
    ...tokenValues(config),
    freeShippingThreshold: formatINR(STORE_CONFIG.freeShippingThreshold),
    shippingFee: formatINR(STORE_CONFIG.shippingFee),
    codFee: formatINR(STORE_CONFIG.codFee),
    codMaxOrderValue: formatINR(STORE_CONFIG.codMaxOrderValue),
    prepaidOffer: `${PREPAID_OFFER.percent}% off (up to ${formatINR(PREPAID_OFFER.max)})`,
    returnFee: formatINR(RETURN_RULES.returnFee),
    storeCreditBonus: String(RETURN_RULES.storeCreditBonusPercent),
  };
}

function fill(block: NoticeBlock, v: Record<string, string>): NoticeBlock {
  if (block.type === "p") return { type: "p", text: fillTokens(block.text, v) };
  if (block.type === "list") return { type: "list", items: block.items.map((i) => fillTokens(i, v)) };
  return { type: "table", head: block.head.map((h) => fillTokens(h, v)), rows: block.rows.map((r) => r.map((c) => fillTokens(c, v))) };
}

export function isContentSlug(value: string): value is ContentSlug {
  return (CONTENT_SLUGS as readonly string[]).includes(value);
}

export function renderContentPage(slug: ContentSlug, config?: LegalConfig): ContentPage {
  const page = PAGES[slug];
  const v = contentTokens(config);
  return {
    ...page,
    title: fillTokens(page.title, v),
    description: fillTokens(page.description, v),
    sections: page.sections.map((s) => ({ id: s.id, heading: fillTokens(s.heading, v), blocks: s.blocks.map((b) => fill(b, v)) })),
  };
}

export function contentPageList(): { slug: ContentSlug; path: string; lastUpdated: string }[] {
  return CONTENT_SLUGS.map((slug) => ({ slug, path: PAGES[slug].path, lastUpdated: PAGES[slug].lastUpdated }));
}
