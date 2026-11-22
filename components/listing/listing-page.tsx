import Link from "next/link";
import { Suspense } from "react";
import { ProductGrid } from "@/components/home/product-grid";
import { GarmentArt } from "@/components/store/garment-art";
import { ProductCard } from "@/components/store/product-card";
import { SectionHeader } from "@/components/store/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProductImage } from "@/lib/commerce/types";
import { parseQuery } from "@/lib/catalog/query";
import type { CatalogScope } from "@/lib/catalog/types";
import { getBestsellers, getListing, getListingTile } from "@/lib/storefront";
import { cn } from "@/lib/utils";
import { ListingView } from "./listing-view";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export interface Crumb {
  label: string;
  href?: string;
}

export interface RailItem {
  title: string;
  href: string;
  image: Pick<ProductImage, "art" | "colour">;
  active: boolean;
}

const gutter = "mx-auto max-w-[1440px] px-2.5 lg:px-10";

/** PLP-01 header: breadcrumbs, Anton H1 + muted style count, optional sub-category image rail. */
export function ListingHeader({
  crumbs,
  title,
  count,
  description,
  rail,
}: {
  crumbs: Crumb[];
  title: string;
  count?: number;
  description?: string;
  rail?: RailItem[];
}) {
  return (
    <header className={cn(gutter, "pt-5 lg:pt-6")}>
      <nav aria-label="Breadcrumb" className="px-1.5 lg:px-0">
        <ol className="flex flex-wrap items-center gap-1 text-[12px] text-ink-2">
          {crumbs.map((c, i) => (
            <li key={c.label} className="flex items-center gap-1">
              {i > 0 ? <span aria-hidden="true">/</span> : null}
              {c.href ? (
                <Link href={c.href} className="hover:text-ink hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page" className="font-semibold text-ink">
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <div className="mt-2 flex items-baseline gap-2.5 px-1.5 lg:px-0">
        <h1 className="font-display text-[34px] uppercase leading-none lg:text-[52px]">{title}</h1>
        {count !== undefined ? <span className="tabular text-[13px] text-ink-2 lg:text-[16px]">{count} styles</span> : null}
      </div>
      {description ? <p className="mt-2 px-1.5 text-[13px] text-ink-2 lg:px-0 lg:text-[14px]">{description}</p> : null}
      {rail && rail.length > 1 ? (
        <nav aria-label="Sub-categories" className="scrollbar-none -mx-2.5 mt-4 overflow-x-auto px-2.5 lg:mx-0 lg:mt-5 lg:px-0">
          <ul className="flex gap-2 lg:gap-4">
            {rail.map((r) => (
              <li key={r.href} className="shrink-0">
                <Link href={r.href} aria-current={r.active ? "page" : undefined} className="group flex w-[76px] flex-col items-center gap-2 lg:w-[92px]">
                  <GarmentArt
                    image={{ ...r.image, alt: "" }}
                    className={cn(
                      "h-[86px] w-[76px] border-2 lg:h-[104px] lg:w-[92px]",
                      r.active ? "border-black" : "border-transparent group-hover:border-line-2",
                    )}
                    artClassName="size-[70%]"
                  />
                  <span className={cn("text-center text-[10.5px] uppercase tracking-[0.06em] lg:text-[11.5px]", r.active ? "font-bold" : "font-medium")}>
                    {r.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

/** Streams the filtered grid; everything above it is in the static shell (LCP-friendly). */
export function ListingResults(props: {
  scope: CatalogScope;
  searchParams: SearchParams;
  basePath: string;
  search?: boolean;
}) {
  return (
    <section aria-label="Products" className={cn(gutter, "mt-5 pb-14 lg:mt-6 lg:pb-20")}>
      <Suspense fallback={<ListingSkeleton />}>
        <Results {...props} />
      </Suspense>
    </section>
  );
}

async function Results({
  scope,
  searchParams,
  basePath,
  search = false,
}: {
  scope: CatalogScope;
  searchParams: SearchParams;
  basePath: string;
  search?: boolean;
}) {
  const query = parseQuery(await searchParams, { search });
  const [result, tile] = await Promise.all([getListing(scope, query), getListingTile()]);
  if (!result) return null;
  const baseParams: Record<string, string> = scope.kind === "search" ? { q: scope.q } : {};
  const fallback = result.total === 0 ? <EmptySuggestions /> : null;
  return (
    <ListingView
      result={result}
      query={query}
      basePath={basePath}
      baseParams={baseParams}
      search={search}
      tile={search ? null : tile}
      emptyFallback={fallback}
    />
  );
}

async function EmptySuggestions() {
  const products = await getBestsellers(4);
  if (!products.length) return null;
  return (
    <div>
      <SectionHeader title="Bestsellers" viewAllHref="/collections/bestsellers" />
      <ProductGrid className="mt-5">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </ProductGrid>
    </div>
  );
}

export function ListingSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="hidden gap-2 border-b border-line pb-4 lg:flex">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24" />
        ))}
      </div>
      <div className="lg:mt-6 lg:grid lg:grid-cols-[264px_1fr] lg:gap-8">
        <div className="hidden space-y-3 lg:block">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-4 lg:grid-cols-3 lg:gap-x-[18px] lg:gap-y-7">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[3/4] w-full" />
              <Skeleton className="mt-2.5 h-3.5 w-4/5" />
              <Skeleton className="mt-2 h-3.5 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
