import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DynamicMarker } from "@/components/store/dynamic-marker";
import { ListingHeader, ListingPageSkeleton, ListingResults } from "@/components/listing/listing-page";
import { Holding } from "@/components/store/holding";
import { emptyQuery } from "@/lib/catalog/query";
import { getCategoryNode, getListing, storefrontAvailable, subcategoryParams } from "@/lib/storefront";

export const generateStaticParams = subcategoryParams;

async function resolve(category: string, sub: string) {
  const node = await getCategoryNode(category);
  const subcategory = node?.subcategories.find((s) => s.handle === sub);
  return node && subcategory ? { node, subcategory } : null;
}

export async function generateMetadata({ params }: PageProps<"/men/[category]/[sub]">): Promise<Metadata> {
  const { category, sub } = await params;
  const found = await resolve(category, sub);
  if (!found) return {};
  const name = `${found.subcategory.title} ${found.node.title.toLowerCase()}`;
  return {
    title: `Men's ${name}`,
    description: `Shop men's ${name} at The Alpha Hood.`,
    alternates: { canonical: `/men/${found.node.handle}/${found.subcategory.handle}` },
  };
}

/**
 * Instant navigation (Next 16 Cache Components): `params` are URL data, so everything that reads them streams
 * inside <Suspense> with a same-shaped fallback; the shell around it renders immediately.
 */
export default function SubcategoryPage({ params, searchParams }: PageProps<"/men/[category]/[sub]">) {
  // The marker renders in both branches: generateMetadata reads `params` even when the store isn't live yet.
  if (!storefrontAvailable()) {
    return (
      <>
        <DynamicMarker />
        <Holding />
      </>
    );
  }
  return (
    <>
      <DynamicMarker />
      <Suspense fallback={<ListingPageSkeleton />}>
        <SubcategoryContent params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** PLP-01 sub-category page, e.g. /men/jeans/baggy. */
async function SubcategoryContent({ params, searchParams }: PageProps<"/men/[category]/[sub]">) {
  const { category, sub } = await params;
  const found = await resolve(category, sub);
  if (!found) notFound();
  const { node, subcategory } = found;
  const scope = { kind: "category" as const, category: node.handle, subcategory: subcategory.handle };
  const base = await getListing(scope, emptyQuery());

  return (
    <>
      <ListingHeader
        path={`/men/${found.node.handle}/${found.subcategory.handle}`}
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Men", href: "/men" },
          { label: node.title, href: `/men/${node.handle}` },
          { label: subcategory.title },
        ]}
        title={`${subcategory.title} ${node.title}`}
        count={base?.scopeTotal}
        rail={[
          { title: "All", href: `/men/${node.handle}`, image: node.image, active: false },
          ...node.subcategories.map((s) => ({
            title: s.title,
            href: `/men/${node.handle}/${s.handle}`,
            image: s.image,
            active: s.handle === subcategory.handle,
          })),
        ]}
      />
      <ListingResults scope={scope} searchParams={searchParams} basePath={`/men/${node.handle}/${subcategory.handle}`} />
    </>
  );
}
