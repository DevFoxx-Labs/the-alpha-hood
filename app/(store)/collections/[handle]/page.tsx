import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DynamicMarker } from "@/components/store/dynamic-marker";
import { ListingHeader, ListingPageSkeleton, ListingResults } from "@/components/listing/listing-page";
import { ProductRailGallery } from "@/components/listing/product-rail-gallery";
import { Holding } from "@/components/store/holding";
import { emptyQuery } from "@/lib/catalog/query";
import { pickRailProducts, RAIL_MIN_ITEMS } from "@/lib/catalog/rail";
import { collectionParams, getCollectionInfo, getListing, storefrontAvailable } from "@/lib/storefront";

export const generateStaticParams = collectionParams;

export async function generateMetadata({ params }: PageProps<"/collections/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const collection = await getCollectionInfo(handle);
  if (!collection) return {};
  return {
    title: collection.title,
    description: collection.description,
    alternates: { canonical: `/collections/${collection.handle}` },
  };
}

/**
 * Instant navigation (Next 16 Cache Components): `params` are URL data, so everything that reads them streams
 * inside <Suspense> with a same-shaped fallback; the shell around it renders immediately.
 */
export default function CollectionPage({ params, searchParams }: PageProps<"/collections/[handle]">) {
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
        <CollectionContent params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** PLP-01 collection page, e.g. /collections/winter-drop. */
async function CollectionContent({ params, searchParams }: PageProps<"/collections/[handle]">) {
  const { handle } = await params;
  const collection = await getCollectionInfo(handle);
  if (!collection) notFound();
  const scope = { kind: "collection" as const, collection: collection.handle };
  const base = await getListing(scope, emptyQuery());
  // PLP-08: the collection's own products, so every collection gets a different rail.
  const rail = pickRailProducts(base?.products ?? []);

  return (
    <>
      <ListingHeader
        path={`/collections/${collection.handle}`}
        crumbs={[{ label: "Home", href: "/" }, { label: collection.title }]}
        title={collection.title}
        count={base?.scopeTotal}
        description={collection.description}
      />
      {rail.length >= RAIL_MIN_ITEMS ? (
        <ProductRailGallery
          products={rail}
          eyebrow={`${collection.title} · on the rail`}
          title={collection.handle === "sale" || collection.handle === "price-drop" ? "Steals on the rail" : "Top picks"}
        />
      ) : null}
      <ListingResults scope={scope} searchParams={searchParams} basePath={`/collections/${collection.handle}`} />
    </>
  );
}
