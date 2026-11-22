import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingHeader, ListingResults } from "@/components/listing/listing-page";
import { Holding } from "@/components/store/holding";
import { emptyQuery } from "@/lib/catalog/query";
import { categoryParams, getCategoryNode, getListing, storefrontAvailable } from "@/lib/storefront";

export const generateStaticParams = categoryParams;

export async function generateMetadata({ params }: PageProps<"/men/[category]">): Promise<Metadata> {
  const { category } = await params;
  const node = await getCategoryNode(category);
  if (!node) return {};
  return {
    title: `Men's ${node.title}`,
    description: `Shop men's ${node.title.toLowerCase()} at The Alpha Hood — new drops every week, easy size exchanges.`,
    alternates: { canonical: `/men/${node.handle}` },
  };
}

/** PLP-01 category page, e.g. /men/shirts. */
export default async function CategoryPage({ params, searchParams }: PageProps<"/men/[category]">) {
  const { category } = await params;
  if (!storefrontAvailable()) return <Holding />;
  const node = await getCategoryNode(category);
  if (!node) notFound();
  const scope = { kind: "category" as const, category: node.handle };
  const base = await getListing(scope, emptyQuery());

  return (
    <>
      <ListingHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Men", href: "/men" }, { label: node.title }]}
        title={node.title}
        count={base?.scopeTotal}
        rail={[
          { title: "All", href: `/men/${node.handle}`, image: node.image, active: true },
          ...node.subcategories.map((s) => ({ title: s.title, href: `/men/${node.handle}/${s.handle}`, image: s.image, active: false })),
        ]}
      />
      <ListingResults scope={scope} searchParams={searchParams} basePath={`/men/${node.handle}`} />
    </>
  );
}
