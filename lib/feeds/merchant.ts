import type { Product } from "@/lib/commerce/types";
import { siteUrl } from "@/lib/seo/site";

/**
 * ANL-02 product feed in the Google Merchant Center RSS 2.0 format, which Meta Commerce Manager also reads.
 * One item per size (variant) grouped by `item_group_id` = product id — the same id the analytics events
 * send, so dynamic ads and conversions match the catalogue. Prices come from the catalogue (server), sale price
 * only when it is below MRP. Text is XML-escaped; control characters are dropped.
 */
/** Google product taxonomy, as text paths (accepted by Merchant Center and Meta). Unknown → "Clothing". */
const TOPS = "Apparel & Accessories > Clothing > Shirts & Tops";
const PANTS = "Apparel & Accessories > Clothing > Pants";
const GOOGLE_CATEGORY: Record<string, string> = {
  "t-shirts": TOPS,
  shirts: TOPS,
  hoodies: TOPS,
  sweaters: TOPS,
  jeans: PANTS,
  trousers: PANTS,
  "cargo-pants": PANTS,
  joggers: PANTS,
  shorts: "Apparel & Accessories > Clothing > Shorts",
  jackets: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets",
  "co-ords": "Apparel & Accessories > Clothing > Outfit Sets",
  sneakers: "Apparel & Accessories > Shoes",
  sunglasses: "Apparel & Accessories > Clothing Accessories > Sunglasses",
  accessories: "Apparel & Accessories > Clothing Accessories",
};
const CLOTHING = "Apparel & Accessories > Clothing";

const CONTROL = new RegExp("[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]", "g");
export function xml(text: string): string {
  return text
    .replace(CONTROL, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const money = (paise: number) => `${(paise / 100).toFixed(2)} INR`;
const variantId = (p: Product, size: string) => `${p.id}-${size.replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 50);

export interface FeedItem {
  id: string;
  groupId: string;
  title: string;
  description: string;
  link: string;
  imageLink: string | null;
  availability: "in_stock" | "out_of_stock";
  price: string;
  salePrice: string | null;
  brand: string;
  color: string;
  size: string;
  googleCategory: string;
  productType: string;
  mpn: string;
}

export function feedItems(products: Product[], brand: string): FeedItem[] {
  return products.flatMap((p) => {
    const photo = p.images.find((i) => i.url);
    const imageLink = photo?.url ? new URL(photo.url, siteUrl("/")).toString() : null;
    return p.sizes.map((s) => ({
      id: variantId(p, s.label),
      groupId: p.id,
      title: `${p.title} — Size ${s.label}`.slice(0, 150),
      description: p.description.slice(0, 5000),
      link: siteUrl(`/products/${p.handle}`),
      imageLink,
      availability: s.stock > 0 ? ("in_stock" as const) : ("out_of_stock" as const),
      price: money(Math.max(p.mrp, p.price)),
      salePrice: p.price < p.mrp ? money(p.price) : null,
      brand,
      color: p.colour.name,
      size: s.label,
      googleCategory: GOOGLE_CATEGORY[p.category] ?? CLOTHING,
      productType: ["Men", p.category, p.subcategory].filter(Boolean).join(" > "),
      mpn: `${p.sku}-${s.label}`.slice(0, 70),
    }));
  });
}

function itemXml(i: FeedItem): string {
  const tag = (name: string, value: string | null) => (value === null ? "" : `<${name}>${xml(value)}</${name}>`);
  return [
    "<item>",
    tag("g:id", i.id),
    tag("g:item_group_id", i.groupId),
    tag("g:title", i.title),
    tag("g:description", i.description),
    tag("g:link", i.link),
    tag("g:image_link", i.imageLink),
    tag("g:availability", i.availability),
    tag("g:price", i.price),
    tag("g:sale_price", i.salePrice),
    tag("g:brand", i.brand),
    tag("g:condition", "new"),
    tag("g:gender", "male"),
    tag("g:age_group", "adult"),
    tag("g:color", i.color),
    tag("g:size", i.size),
    tag("g:size_system", "IN"),
    tag("g:google_product_category", i.googleCategory),
    tag("g:product_type", i.productType),
    tag("g:mpn", i.mpn),
    tag("g:identifier_exists", "no"),
    "</item>",
  ].join("");
}

export function merchantFeedXml(products: Product[], { brand, title }: { brand: string; title: string }): string {
  const items = feedItems(products, brand);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    `<title>${xml(title)}</title>`,
    `<link>${xml(siteUrl("/"))}</link>`,
    `<description>${xml(`${title} product feed`)}</description>`,
    ...items.map(itemXml),
    "</channel>",
    "</rss>",
  ].join("\n");
}
