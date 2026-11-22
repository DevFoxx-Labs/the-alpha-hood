import type { Metadata } from "next";
import { Suspense } from "react";
import { ListingHeader, ListingResults, ListingSkeleton } from "@/components/listing/listing-page";
import { Holding } from "@/components/store/holding";
import { SearchForm } from "@/components/search/search-form";
import { emptyQuery, normaliseSearchTerm } from "@/lib/catalog/query";
import { getCategoryTree, getListing, storefrontAvailable } from "@/lib/storefront";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};

/** SRCH-02 results page with the same filters/sort as category pages. */
export default function SearchPage({ searchParams }: PageProps<"/search">) {
  if (!storefrontAvailable()) return <Holding />;
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1440px] px-2.5 pt-6 lg:px-10">
          <ListingSkeleton />
        </div>
      }
    >
      <SearchResults searchParams={searchParams} />
    </Suspense>
  );
}

async function SearchResults({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const params = await searchParams;
  const q = normaliseSearchTerm(Array.isArray(params.q) ? params.q[0] : params.q);

  if (!q) {
    const tree = (await getCategoryTree()) ?? [];
    return (
      <div className="mx-auto max-w-[860px] px-4 py-10 lg:py-16">
        <h1 className="type-section">Search</h1>
        <SearchForm className="mt-6" />
        <h2 className="mt-10 text-[12px] font-bold uppercase tracking-[0.12em]">Browse categories</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {tree.map((c) => (
            <li key={c.handle}>
              <a href={`/men/${c.handle}`} className="inline-block border border-line px-3 py-2 text-[13px] hover:border-black">
                {c.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const scope = { kind: "search" as const, q };
  const base = await getListing(scope, emptyQuery("relevance"));
  return (
    <>
      <ListingHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Search" }]}
        title={`“${q}”`}
        count={base?.scopeTotal}
      />
      <div className="mx-auto max-w-[1440px] px-4 pt-4 lg:px-10">
        <SearchForm defaultValue={q} className="max-w-[560px]" />
      </div>
      <ListingResults scope={scope} searchParams={searchParams} basePath="/search" search />
    </>
  );
}
