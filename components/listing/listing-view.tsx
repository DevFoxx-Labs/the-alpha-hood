"use client";

import { Cancel01Icon, FilterHorizontalIcon, GridViewIcon, LayoutGridIcon, SortingDownIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { ProductCard } from "@/components/store/product-card";
import { track } from "@/lib/analytics/client";
import { itemFromProduct } from "@/lib/analytics/events";
import {
  AppliedChips,
  FilterBarChip,
  FilterSection,
  SEARCH_SORT_OPTIONS,
  SORT_OPTIONS,
  SortMenu,
} from "@/components/store/filters";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { valueLabel } from "@/lib/catalog/attributes";
import { activeFilterCount, clearFilters, serializeQuery, toggleValue } from "@/lib/catalog/query";
import type { CatalogQuery, CatalogResult, MultiFilter, SortKey } from "@/lib/catalog/types";
import { MULTI_FILTERS } from "@/lib/catalog/types";
import type { ListingTile as Tile } from "@/lib/cms/types";
import { formatINR, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";
import { availablePanels, FacetControl, PANEL_LABELS, type PanelKey, selectedIn } from "./facet-control";
import { ListingTile } from "./listing-tile";

const QUICK: PanelKey[] = ["size", "fit", "colour", "price", "fabric", "sleeve"];
const TILE_AT = 4;

/**
 * PLP-02…06 interactive listing. Every change is a URL change (shareable, back-button safe) inside a
 * transition: the old grid stays visible and dims while the server renders the new one; filter controls
 * update optimistically for instant feedback (INP).
 */
export function ListingView({
  result,
  query,
  basePath,
  baseParams = {},
  search = false,
  tile,
  emptyFallback,
}: {
  result: CatalogResult;
  query: CatalogQuery;
  basePath: string;
  /** Params that belong to the page, not the filters (e.g. `q` on /search). */
  baseParams?: Record<string, string>;
  search?: boolean;
  tile?: Tile | null;
  /** Rendered when nothing matches (PLP-06 suggestions, e.g. bestsellers). */
  emptyFallback?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(query);
  const [sidebar, setSidebar] = useState(true);

  const urlFor = useCallback(
    (next: CatalogQuery) => {
      const params = new URLSearchParams(baseParams);
      const qs = [params.toString(), serializeQuery(next, { search })].filter(Boolean).join("&");
      return qs ? `${basePath}?${qs}` : basePath;
    },
    [basePath, baseParams, search],
  );

  const go = useCallback(
    (next: CatalogQuery, { replace = false } = {}) => {
      startTransition(() => {
        setOptimistic(next);
        const url = urlFor(next);
        if (replace) router.replace(url, { scroll: false });
        else router.push(url, { scroll: false });
      });
    },
    [router, setOptimistic, urlFor],
  );

  const panels = availablePanels(result);
  const filterCount = activeFilterCount(optimistic);
  const chips = appliedChips(optimistic);
  const removeChip = (id: string) => go(removeById(optimistic, id));
  const sortOptions = search ? SEARCH_SORT_OPTIONS : SORT_OPTIONS;
  const setSort = (s: string) => go({ ...optimistic, sort: s as SortKey, page: 1 });

  const hasMore = result.products.length < result.total;
  const listName = search ? "Search results" : `Listing ${basePath}`;

  // ANL-01 view_item_list (and `search` on /search) each time a new set of results is shown.
  const searchTerm = baseParams.q ?? "";
  useEffect(() => {
    track("view_item_list", { listName, items: result.products.map((p, i) => itemFromProduct(p, { listName, index: i })) });
    if (search && searchTerm) track("search", { query: searchTerm, results: result.total });
  }, [result, listName, search, searchTerm]);

  const nextPage = { ...query, page: query.page + 1 };

  // PLP-04: infinite scroll on mobile (Load more stays as the fallback and on desktop).
  const sentinel = useRef<HTMLDivElement>(null);
  const requested = useRef(0);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const io = new IntersectionObserver(
      (entries) => {
        if (!mq.matches || !entries[0].isIntersecting || pending) return;
        if (requested.current >= query.page + 1) return;
        requested.current = query.page + 1;
        go({ ...query, page: query.page + 1 }, { replace: true });
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, pending, query, go]);

  const cards = result.products.map((p, i) => <ProductCard key={p.id} product={p} listName={listName} index={i} />);
  if (tile && cards.length > TILE_AT + 1 && filterCount === 0) {
    cards.splice(TILE_AT, 0, <ListingTile key="tile" tile={tile} />);
  }

  return (
    <div>
      {/* Desktop filter bar */}
      <div className="hidden items-center justify-between gap-4 border-b border-line pb-4 lg:flex">
        <div className="flex flex-wrap items-center gap-2">
          <FilterBarChip
            label="Filters"
            active
            count={filterCount}
            aria-expanded={sidebar}
            aria-controls="filter-sidebar"
            onClick={() => setSidebar((s) => !s)}
          />
          {QUICK.filter((k) => panels.includes(k)).map((k) => (
            <Popover key={k}>
              <PopoverTrigger asChild>
                <FilterBarChip label={PANEL_LABELS[k]} count={selectedIn(k, optimistic) || undefined} />
              </PopoverTrigger>
              <PopoverContent aria-label={`${PANEL_LABELS[k]} filter`}>
                <FacetControl panel={k} result={result} query={optimistic} onChange={go} />
              </PopoverContent>
            </Popover>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <SortMenu value={optimistic.sort} onChange={setSort} options={sortOptions} />
          <button
            type="button"
            onClick={() => setSidebar((s) => !s)}
            aria-pressed={!sidebar}
            aria-label={sidebar ? "Show 4 columns (hide filters)" : "Show 3 columns with filters"}
            className="grid size-9 place-items-center border border-line hover:border-black"
          >
            <Icon icon={sidebar ? LayoutGridIcon : GridViewIcon} size={18} />
          </button>
        </div>
      </div>

      {/* Mobile applied chips */}
      {chips.length ? (
        <div className="scrollbar-none -mx-2.5 mb-3 flex gap-1.5 overflow-x-auto px-2.5 lg:hidden">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => removeChip(c.id)}
              aria-label={`Remove filter ${c.label}`}
              className="inline-flex shrink-0 items-center gap-1 bg-soft px-2.5 py-1.5 text-[12px]"
            >
              {c.label}
              <Icon icon={Cancel01Icon} size={12} />
            </button>
          ))}
          <button type="button" onClick={() => go(clearFilters(optimistic))} className="shrink-0 px-2 text-[11px] font-bold uppercase tracking-[0.1em] underline underline-offset-4">
            Clear all
          </button>
        </div>
      ) : null}

      <div className={cn("lg:mt-6 lg:grid lg:gap-8", sidebar ? "lg:grid-cols-[264px_1fr]" : "lg:grid-cols-1")}>
        {sidebar ? (
          <aside id="filter-sidebar" aria-label="Filters" className="hidden lg:block">
            <AppliedChips chips={chips} onRemove={removeChip} onClear={() => go(clearFilters(optimistic))} />
            {panels.map((k, i) => (
              <FilterSection key={k} title={PANEL_LABELS[k]} defaultOpen={i < 4 || selectedIn(k, optimistic) > 0} selectedCount={selectedIn(k, optimistic)}>
                <FacetControl panel={k} result={result} query={optimistic} onChange={go} />
              </FilterSection>
            ))}
          </aside>
        ) : null}

        <div aria-busy={pending} className={cn("transition-opacity duration-200", pending && "opacity-50")}>
          <p role="status" className="sr-only">
            {pending ? "Updating results" : `${result.total} styles`}
          </p>
          {result.total === 0 ? (
            <EmptyState query={optimistic} onRemove={removeChip} onClear={() => go(clearFilters(optimistic))} chips={chips} fallback={emptyFallback} />
          ) : (
            <>
              <div className={cn("grid grid-cols-2 gap-x-2 gap-y-4 lg:gap-x-[18px] lg:gap-y-7", sidebar ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
                {cards}
              </div>
              <div ref={sentinel} aria-hidden="true" />
              <Progress shown={result.products.length} total={result.total} />
              {hasMore ? (
                <div className="mt-4 flex justify-center">
                  <Button asChild variant="outline" size="lg" className="w-full max-w-[264px]">
                    <Link
                      href={urlFor(nextPage)}
                      scroll={false}
                      replace
                      onClick={(e) => {
                        e.preventDefault();
                        go(nextPage, { replace: true });
                      }}
                      aria-disabled={pending}
                    >
                      {pending ? "Loading…" : "Load more"}
                    </Link>
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <MobileBar
        result={result}
        query={optimistic}
        panels={panels}
        sortOptions={sortOptions}
        filterCount={filterCount}
        onSort={setSort}
        onApply={go}
        countBase={`/api/catalog?${new URLSearchParams({ ...baseParams, ...scopeParamsFromPath(basePath) }).toString()}`}
        search={search}
      />
    </div>
  );
}

function Progress({ shown, total }: { shown: number; total: number }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-2.5">
      <div className="h-0.5 w-[230px] bg-line" aria-hidden="true">
        <div className="h-full bg-black transition-[width]" style={{ width: `${Math.min(100, (shown / total) * 100)}%` }} />
      </div>
      <p className="tabular text-[12.5px] text-ink-2">
        Showing {shown} of {total} styles
      </p>
    </div>
  );
}

function EmptyState({
  query,
  chips,
  onRemove,
  onClear,
  fallback,
}: {
  query: CatalogQuery;
  chips: { id: string; label: string }[];
  onRemove: (id: string) => void;
  onClear: () => void;
  fallback?: React.ReactNode;
}) {
  const filtered = activeFilterCount(query) > 0;
  return (
    <div className="py-10 lg:py-14">
      <div className="mx-auto max-w-[520px] text-center">
        <h2 className="font-display text-[30px] uppercase leading-none lg:text-[40px]">
          {filtered ? "No styles match" : "Nothing here yet"}
        </h2>
        <p className="mt-3 text-[14px] text-ink-2">
          {filtered ? "Try removing a filter:" : "New styles are on the way. Meanwhile, here's what's selling."}
        </p>
        {filtered ? (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {chips.map((c) => (
              <button key={c.id} type="button" onClick={() => onRemove(c.id)} className="inline-flex items-center gap-1 bg-soft px-2.5 py-1.5 text-[12px] hover:bg-soft-2">
                {c.label}
                <Icon icon={Cancel01Icon} size={12} />
              </button>
            ))}
            <Button size="sm" variant="outline" onClick={onClear} className="ml-1">
              Clear all
            </Button>
          </div>
        ) : null}
      </div>
      {fallback ? <div className="mt-12">{fallback}</div> : null}
    </div>
  );
}

/** Sticky mobile bar "SORT | FILTER (n)" above the tab bar + sort/filter bottom sheets (DESIGN.md §4.2). */
function MobileBar({
  result,
  query,
  panels,
  sortOptions,
  filterCount,
  onSort,
  onApply,
  countBase,
  search,
}: {
  result: CatalogResult;
  query: CatalogQuery;
  panels: PanelKey[];
  sortOptions: readonly { value: string; label: string }[];
  filterCount: number;
  onSort: (s: string) => void;
  onApply: (q: CatalogQuery) => void;
  countBase: string;
  search: boolean;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const btn = "flex h-12 flex-1 items-center justify-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]";
  return (
    <>
      <div className="fixed inset-x-0 bottom-[calc(64px+max(0px,env(safe-area-inset-bottom)-12px))] z-20 flex border-y border-line bg-white lg:hidden">
        <button type="button" className={btn} onClick={() => setSortOpen(true)} aria-haspopup="dialog">
          <Icon icon={SortingDownIcon} size={18} />
          Sort
        </button>
        <span aria-hidden="true" className="my-3 w-px bg-line" />
        <button type="button" className={btn} onClick={() => setFilterOpen(true)} aria-haspopup="dialog">
          <Icon icon={FilterHorizontalIcon} size={18} />
          Filter{filterCount ? <span className="tabular">({filterCount})</span> : null}
        </button>
      </div>
      <div className="h-14 lg:hidden" aria-hidden="true" />

      <Sheet open={sortOpen} onOpenChange={setSortOpen}>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <SheetTitle>Sort by</SheetTitle>
            <button type="button" aria-label="Close" onClick={() => setSortOpen(false)} className="grid size-10 place-items-center">
              <Icon icon={Cancel01Icon} size={20} />
            </button>
          </div>
          <ul role="radiogroup" aria-label="Sort by" className="px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
            {sortOptions.map((o) => {
              const on = query.sort === o.value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setSortOpen(false);
                      onSort(o.value);
                    }}
                    className={cn("flex h-12 w-full items-center justify-between text-[14px]", on && "font-bold")}
                  >
                    {o.label}
                    <span aria-hidden="true" className={cn("grid size-[18px] place-items-center rounded-full border", on ? "border-black" : "border-[#bdbdbd]")}>
                      {on ? <span className="size-2.5 rounded-full bg-black" /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>

      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="bottom" className="h-[85dvh]" aria-describedby="mobile-filter-desc">
          {filterOpen ? (
            <MobileFilters
              result={result}
              initial={query}
              panels={panels}
              countBase={countBase}
              search={search}
              onClose={() => setFilterOpen(false)}
              onApply={(q) => {
                setFilterOpen(false);
                onApply(q);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function MobileFilters({
  result,
  initial,
  panels,
  countBase,
  search,
  onClose,
  onApply,
}: {
  result: CatalogResult;
  initial: CatalogQuery;
  panels: PanelKey[];
  countBase: string;
  search: boolean;
  onClose: () => void;
  onApply: (q: CatalogQuery) => void;
}) {
  const [draft, setDraft] = useState<CatalogQuery>({ ...initial, page: 1 });
  const [active, setActive] = useState<PanelKey>(panels[0] ?? "availability");
  const [count, setCount] = useState<number | null>(result.total);

  // "Apply (n results)": ask the server how many match the draft (debounced, cancellable).
  useEffect(() => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      fetch(`${countBase}&${serializeQuery(draft, { search })}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ total: number }>) : Promise.reject(new Error())))
        .then((d) => setCount(d.total))
        .catch(() => {
          if (!ctrl.signal.aborted) setCount(null);
        });
    }, 250);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [draft, countBase, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <SheetTitle>Filters</SheetTitle>
        <SheetDescription id="mobile-filter-desc" className="sr-only">
          Choose filters, then apply.
        </SheetDescription>
        <button type="button" aria-label="Close" onClick={onClose} className="grid size-10 place-items-center">
          <Icon icon={Cancel01Icon} size={20} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <ul role="tablist" aria-orientation="vertical" aria-label="Filter categories" className="w-[38%] shrink-0 overflow-y-auto bg-soft">
          {panels.map((k) => {
            const n = selectedIn(k, draft);
            return (
              <li key={k}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active === k}
                  aria-controls="mobile-filter-pane"
                  onClick={() => setActive(k)}
                  className={cn(
                    "flex h-12 w-full items-center justify-between border-l-[3px] px-3 text-left text-[12px] font-semibold uppercase tracking-[0.08em]",
                    active === k ? "border-black bg-white" : "border-transparent text-ink-2",
                  )}
                >
                  {PANEL_LABELS[k]}
                  {n ? <span className="tabular text-[11px]">{n}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div id="mobile-filter-pane" role="tabpanel" aria-label={PANEL_LABELS[active]} className="flex-1 overflow-y-auto p-4">
          <FacetControl panel={active} result={result} query={draft} onChange={setDraft} />
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-line p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <Button variant="outline" onClick={() => setDraft(clearFilters(draft))}>
          Clear
        </Button>
        <Button onClick={() => onApply(draft)} disabled={count === 0}>
          Apply{count !== null ? ` (${count})` : ""}
        </Button>
      </div>
    </div>
  );
}

function appliedChips(q: CatalogQuery): { id: string; label: string }[] {
  const chips: { id: string; label: string }[] = [];
  for (const key of MULTI_FILTERS) {
    for (const v of q.filters[key]) {
      const label = valueLabel(key, v);
      chips.push({ id: `${key}:${v}`, label: key === "size" ? `Size: ${label}` : label });
    }
  }
  if (q.price) chips.push({ id: "price", label: `${formatINR(rupees(q.price.min))}–${formatINR(rupees(q.price.max))}` });
  if (q.discount) chips.push({ id: "discount", label: `${q.discount}%+ off` });
  if (q.inStockOnly) chips.push({ id: "instock", label: "In stock" });
  return chips;
}

function removeById(q: CatalogQuery, id: string): CatalogQuery {
  if (id === "price") return { ...q, price: null, page: 1 };
  if (id === "discount") return { ...q, discount: null, page: 1 };
  if (id === "instock") return { ...q, inStockOnly: false, page: 1 };
  const [key, value] = id.split(":") as [MultiFilter, string];
  return toggleValue(q, key, value);
}

/** Maps a listing path to the /api/catalog scope params. */
export function scopeParamsFromPath(path: string): Record<string, string> {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "men" && parts[1]) return { scope: "category", category: parts[1], ...(parts[2] ? { sub: parts[2] } : {}) };
  if (parts[0] === "collections" && parts[1]) return { scope: "collection", collection: parts[1] };
  if (parts[0] === "search") return { scope: "search" };
  return { scope: "all" };
}
