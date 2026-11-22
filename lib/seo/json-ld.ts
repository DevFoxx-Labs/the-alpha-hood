import type { Product } from "@/lib/commerce/types";
import type { ReviewSummary } from "@/lib/reviews/types";

/**
 * Structured data (PDP-12 / CMS-03). `toJsonLd` escapes `<`, `>`, `&` and line separators so catalogue
 * text can never close the <script> tag (XSS) — the only safe way to inline JSON in HTML.
 */
const LINE_SEPARATORS = new RegExp("[\\u2028\\u2029]", "g");

export function toJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEPARATORS, (c) => (c.charCodeAt(0) === 0x2028 ? "\\u2028" : "\\u2029"));
}

export function productJsonLd({
  product,
  url,
  brand,
  breadcrumbs,
  rating,
}: {
  product: Product;
  url: string;
  brand: string;
  breadcrumbs: { name: string; url: string }[];
  /** Only the style's own reviews — never the category fallback. */
  rating: ReviewSummary | null;
}) {
  const inStock = product.sizes.some((s) => s.stock > 0);
  const productLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    sku: product.sku,
    color: product.colour.name,
    brand: { "@type": "Brand", name: brand },
    url,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "INR",
      price: (product.price / 100).toFixed(2),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  if (rating && rating.count > 0) {
    productLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: rating.average.toFixed(1),
      reviewCount: rating.count,
      bestRating: "5",
      worstRating: "1",
    };
  }
  return [productLd, breadcrumbJsonLd(breadcrumbs)];
}

export function breadcrumbJsonLd(crumbs: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, item: b.url })),
  };
}

/** Homepage (CMS-03): Organization + WebSite with a sitelinks SearchAction pointing at /search. */
export function siteJsonLd({ origin, name, description, sameAs, email, phone }: { origin: string; name: string; description: string; sameAs: string[]; email: string | null; phone: string | null }) {
  const organization: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name,
    url: `${origin}/`,
    logo: `${origin}/icon`,
    description,
  };
  if (sameAs.length) organization.sameAs = sameAs;
  if (email || phone) {
    organization.contactPoint = {
      "@type": "ContactPoint",
      contactType: "customer service",
      areaServed: "IN",
      availableLanguage: ["en", "hi"],
      ...(email ? { email } : {}),
      ...(phone ? { telephone: phone } : {}),
    };
  }
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name,
    url: `${origin}/`,
    inLanguage: "en-IN",
    publisher: { "@id": `${origin}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${origin}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
  return [organization, website];
}
