import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingHeader, ListingResults } from "@/components/listing/listing-page";
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

/** PLP-01 sub-category page, e.g. /men/jeans/baggy. */
export default async function SubcategoryPage({ params, searchParams }: PageProps<"/men/[category]/[sub]">) {
  const { category, sub } = await params;
  if (!storefrontAvailable()) return <Holding />;
  const found = await resolve(category, sub);
  if (!found) notFound();
  const { node, subcategory } = found;
  const scope = { kind: "category" as const, category: node.handle, subcategory: subcategory.handle };
  const base = await getListing(scope, emptyQuery());

  return (
    <>
      <ListingHeader
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
