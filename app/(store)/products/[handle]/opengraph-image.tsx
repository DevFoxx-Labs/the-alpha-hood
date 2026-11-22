import { STORE_CONFIG } from "@/lib/config/store";
import { OG_SIZE, ogCard, ogPrice } from "@/lib/seo/og";
import { getProductPage, productParams } from "@/lib/storefront";

export const alt = `Product from ${STORE_CONFIG.name}`;
export const size = OG_SIZE;
export const contentType = "image/png";
export const generateStaticParams = productParams;

/** Per-product share card: name, category and the server price (CMS-03 Open Graph images). */
export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const data = await getProductPage(handle);
  if (!data) return ogCard({ eyebrow: "The Alpha Hood", title: STORE_CONFIG.tagline });
  const { product } = data;
  return ogCard({ eyebrow: product.category.replace(/-/g, " "), title: product.title.split(" — ")[0], footer: ogPrice(product.price) });
}
