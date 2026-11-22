import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingHeader, ListingResults } from "@/components/listing/listing-page";
import { Holding } from "@/components/store/holding";
import { emptyQuery } from "@/lib/catalog/query";
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

/** PLP-01 collection page, e.g. /collections/winter-drop. */
export default async function CollectionPage({ params, searchParams }: PageProps<"/collections/[handle]">) {
  const { handle } = await params;
  if (!storefrontAvailable()) return <Holding />;
  const collection = await getCollectionInfo(handle);
  if (!collection) notFound();
  const scope = { kind: "collection" as const, collection: collection.handle };
  const base = await getListing(scope, emptyQuery());

  return (
    <>
      <ListingHeader
        crumbs={[{ label: "Home", href: "/" }, { label: collection.title }]}
        title={collection.title}
        count={base?.scopeTotal}
        description={collection.description}
      />
      <ListingResults scope={scope} searchParams={searchParams} basePath={`/collections/${collection.handle}`} />
    </>
  );
}
