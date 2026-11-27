import type { Metadata } from "next";
import { ListingHeader, ListingResults } from "@/components/listing/listing-page";
import { Holding } from "@/components/store/holding";
import { emptyQuery } from "@/lib/catalog/query";
import { getListing, getShopAllCategories } from "@/lib/storefront";

export const metadata: Metadata = {
  title: "Men's clothing — shirts, tees, jeans & more",
  description: "Shop all men's streetwear and everyday wear: shirts, oversized tees, baggy jeans, hoodies and jackets.",
  alternates: { canonical: "/men" },
};

/** PLP-01: every style, with the top-level category rail (the categories chosen in Admin → Categories → Shop all page). */
export default async function MenPage({ searchParams }: PageProps<"/men">) {
  const [tree, base] = await Promise.all([getShopAllCategories(), getListing({ kind: "all" }, emptyQuery())]);
  if (!tree || !base) return <Holding />;
  return (
    <>
      <ListingHeader
        path="/men"
        crumbs={[{ label: "Home", href: "/" }, { label: "Men" }]}
        title="Men"
        count={base.scopeTotal}
        rail={[
          { title: "All", href: "/men", image: { art: "oversized", colour: "#1b1b1b" }, active: true },
          ...tree.map((c) => ({ title: c.title, href: `/men/${c.handle}`, image: c.image, active: false })),
        ]}
      />
      <ListingResults scope={{ kind: "all" }} searchParams={searchParams} basePath="/men" />
    </>
  );
}
