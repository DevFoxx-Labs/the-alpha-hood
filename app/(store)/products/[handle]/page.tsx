import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/listing/listing-page";
import { ProductDetail } from "@/components/pdp/purchase-panel";
import { ReviewsSection } from "@/components/pdp/reviews-section";
import { Holding } from "@/components/store/holding";
import { SIZE_CHARTS } from "@/lib/catalog/size-charts";
import { STORE_CONFIG } from "@/lib/config/store";
import { formatINR } from "@/lib/format";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { productJsonLd, toJsonLd } from "@/lib/seo/json-ld";
import { getProductPage, productParams, storefrontAvailable } from "@/lib/storefront";

export const generateStaticParams = productParams;

export async function generateMetadata({ params }: PageProps<"/products/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const data = await getProductPage(handle);
  if (!data) return {};
  const { product } = data;
  return {
    title: product.title,
    description: `${product.title} — ${formatINR(product.price)}. ${product.description}`.slice(0, 160),
    alternates: { canonical: `/products/${product.handle}` },
    openGraph: { title: product.title, type: "website", url: `/products/${product.handle}` },
  };
}

/** M4 product page (reference/03-product-page.png): PDP-01…03, 05…08, 12. */
export default async function ProductPage({ params }: PageProps<"/products/[handle]">) {
  const { handle } = await params;
  if (!storefrontAvailable()) return <Holding />;
  const data = await getProductPage(handle);
  if (!data) notFound();
  const { product, category, reviewData, firstPage, coupon } = data;
  const categoryTitle = category?.title ?? product.category;
  const sub = category?.subcategories.find((s) => s.handle === product.subcategory);
  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Men", href: "/men" },
    { label: categoryTitle, href: `/men/${product.category}` },
    ...(sub ? [{ label: sub.title, href: `/men/${product.category}/${sub.handle}` }] : []),
    { label: product.title.split(" — ")[0] },
  ];
  const base = process.env.SITE_URL?.replace(/\/$/, "") ?? "";
  const ld = productJsonLd({
    product,
    url: `${base}/products/${product.handle}`,
    brand: STORE_CONFIG.name,
    breadcrumbs: crumbs.map((c) => ({ name: c.label, url: `${base}${c.href ?? `/products/${product.handle}`}` })),
    rating: reviewData?.scope === "style" ? reviewData.summary : null,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(ld) }} />
      <Breadcrumbs crumbs={crumbs} className="mx-auto hidden max-w-[1440px] px-10 pt-5 lg:block" />
      <div className="mx-auto max-w-[1440px] lg:mt-4 lg:px-10">
        <ProductDetail
          product={product}
          reviewSummary={reviewData?.scope === "style" ? reviewData.summary : null}
          coupon={coupon}
          sizeChart={product.sizeChart === "none" ? null : SIZE_CHARTS[product.sizeChart]}
          seller={{
            marketedBy: LEGAL_CONFIG.entityName,
            address: LEGAL_CONFIG.registeredAddress,
            supportEmail: LEGAL_CONFIG.supportEmail,
            supportPhone: LEGAL_CONFIG.supportPhone,
          }}
          freeShippingThreshold={STORE_CONFIG.freeShippingThreshold}
          returnWindowDays={STORE_CONFIG.returnWindowDays}
        />
      </div>
      {reviewData && firstPage ? (
        <div className="mx-auto max-w-[1440px] px-4 py-12 lg:px-10 lg:py-20">
          <ReviewsSection
            summary={reviewData.summary}
            scope={reviewData.scope}
            target={reviewData.scope === "style" ? { style: product.styleId } : { category: product.category }}
            initial={firstPage}
            categoryLabel={categoryTitle}
          />
        </div>
      ) : (
        <div className="mx-auto max-w-[1440px] px-4 py-12 lg:px-10">
          <h2 className="type-section">Ratings &amp; reviews</h2>
          <p className="mt-3 text-[13px] text-ink-2">No reviews yet. Verified buyers can review after delivery.</p>
        </div>
      )}
    </>
  );
}
