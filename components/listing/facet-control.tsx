"use client";

import { CheckboxFilter, ColourFilter, PriceFilter, SizeFilter } from "@/components/store/filters";
import { Switch } from "@/components/ui/switch";
import { toggleValue } from "@/lib/catalog/query";
import { DISCOUNT_STEPS, type CatalogQuery, type CatalogResult, type MultiFilter } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

export type PanelKey = MultiFilter | "price" | "discount" | "availability";

export const PANEL_LABELS: Record<PanelKey, string> = {
  size: "Size",
  fit: "Fit",
  colour: "Colour",
  price: "Price",
  fabric: "Fabric",
  sleeve: "Sleeve",
  pattern: "Pattern",
  occasion: "Occasion",
  discount: "Discount",
  availability: "Availability",
};

/** Panels in reference/02 order that have something to show for this result. */
export function availablePanels(result: CatalogResult): PanelKey[] {
  const keys = new Set(result.facets.map((f) => f.key));
  const order: PanelKey[] = ["size", "fit", "colour", "price", "fabric", "sleeve", "pattern", "occasion", "discount", "availability"];
  return order.filter((k) => {
    if (k === "price") return result.priceRange !== null && result.priceRange.max > result.priceRange.min;
    if (k === "discount") return Object.values(result.discountCounts).some((n) => n > 0);
    if (k === "availability") return true;
    return keys.has(k);
  });
}

export function selectedIn(key: PanelKey, q: CatalogQuery): number {
  if (key === "price") return q.price ? 1 : 0;
  if (key === "discount") return q.discount ? 1 : 0;
  if (key === "availability") return q.inStockOnly ? 1 : 0;
  return q.filters[key].length;
}

/** The control for one filter panel (sidebar section, quick-filter popover or mobile sheet pane). */
export function FacetControl({
  panel,
  result,
  query,
  onChange,
}: {
  panel: PanelKey;
  result: CatalogResult;
  query: CatalogQuery;
  onChange: (next: CatalogQuery) => void;
}) {
  if (panel === "price") {
    const range = result.priceRange!;
    const value: [number, number] = query.price
      ? [Math.max(range.min, query.price.min), Math.min(range.max, query.price.max)]
      : [range.min, range.max];
    return (
      <PriceFilter
        key={`${value[0]}-${value[1]}`}
        min={range.min}
        max={range.max}
        value={value}
        onCommit={([min, max]) =>
          onChange({ ...query, price: min <= range.min && max >= range.max ? null : { min, max }, page: 1 })
        }
      />
    );
  }

  if (panel === "discount") {
    return (
      <ul className="space-y-1" role="radiogroup" aria-label="Minimum discount">
        {DISCOUNT_STEPS.map((step) => {
          const on = query.discount === step;
          const count = result.discountCounts[step] ?? 0;
          return (
            <li key={step}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                disabled={count === 0 && !on}
                onClick={() => onChange({ ...query, discount: on ? null : step, page: 1 })}
                className={cn(
                  "flex w-full items-center justify-between py-1 text-left text-[13px] disabled:opacity-40",
                  on && "font-bold",
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span aria-hidden="true" className={cn("grid size-4 place-items-center rounded-full border", on ? "border-black" : "border-[#bdbdbd]")}>
                    {on ? <span className="size-2 rounded-full bg-black" /> : null}
                  </span>
                  {step}% and above
                </span>
                <span className="tabular text-[11.5px] font-normal text-muted">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (panel === "availability") {
    return (
      <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
        Hide out of stock
        <Switch checked={query.inStockOnly} onCheckedChange={(on) => onChange({ ...query, inStockOnly: on, page: 1 })} />
      </label>
    );
  }

  const facet = result.facets.find((f) => f.key === panel);
  if (!facet) return null;
  const toggle = (value: string) => onChange(toggleValue(query, panel, value));
  const selected = query.filters[panel];

  if (panel === "size") return <SizeFilter sizes={facet.values} selected={selected} onToggle={toggle} />;
  if (panel === "colour") {
    return (
      <ColourFilter
        colours={facet.values.map((v) => ({ value: v.value, name: v.label, hex: v.hex ?? "#ccc", count: v.count }))}
        selected={selected}
        onToggle={toggle}
      />
    );
  }
  return <CheckboxFilter options={facet.values} selected={selected} onToggle={toggle} />;
}
