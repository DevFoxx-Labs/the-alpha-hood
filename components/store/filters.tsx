"use client";

import { Add01Icon, ArrowDown01Icon, Cancel01Icon, FilterHorizontalIcon, MinusSignIcon } from "@hugeicons/core-free-icons";
import { Collapsible } from "radix-ui";
import { useId, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Slider } from "@/components/ui/slider";
import { formatINR, rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * DESIGN.md §3 FilterSidebar building blocks + SortMenu + filter chips (PLP-02/03).
 * Presentational for M1: state is local. M3 moves every value into the URL (shareable, `noindex`).
 */

export function FilterSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen} className="group border-b border-line py-4">
      <Collapsible.Trigger className="flex w-full items-center justify-between text-[12.5px] font-bold uppercase tracking-[0.12em]">
        {title}
        <Icon icon={Add01Icon} size={16} className="group-data-[state=open]:hidden" />
        <Icon icon={MinusSignIcon} size={16} className="hidden group-data-[state=open]:block" />
      </Collapsible.Trigger>
      <Collapsible.Content className="pt-3.5">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

export function SizeFilter({ sizes, selected, onToggle }: { sizes: string[]; selected: string[]; onToggle: (s: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {sizes.map((s) => {
        const on = selected.includes(s);
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(s)}
            className={cn(
              "h-9 border text-[12px] font-medium transition-colors",
              on ? "border-black bg-black text-white" : "border-line hover:border-black",
            )}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

export function CheckboxFilter({
  options,
  selected,
  onToggle,
}: {
  options: { label: string; count: number }[];
  selected: string[];
  onToggle: (label: string) => void;
}) {
  const base = useId();
  return (
    <ul className="space-y-2.5">
      {options.map((o, i) => (
        <li key={o.label} className="flex items-center gap-2.5">
          <Checkbox id={`${base}-${i}`} checked={selected.includes(o.label)} onCheckedChange={() => onToggle(o.label)} />
          <label htmlFor={`${base}-${i}`} className="flex flex-1 cursor-pointer items-center justify-between text-[13px]">
            {o.label}
            <span className="tabular text-[11.5px] text-muted">{o.count}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export function ColourFilter({
  colours,
  selected,
  onToggle,
}: {
  colours: { name: string; hex: string }[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-x-1 gap-y-3">
      {colours.map((c) => {
        const on = selected.includes(c.name);
        return (
          <button
            key={c.name}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(c.name)}
            className="flex flex-col items-center gap-1 text-[10.5px] text-ink-2"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-[22px] rounded-full border border-black/15",
                on && "ring-2 ring-black ring-offset-2",
              )}
              style={{
                background:
                  c.hex === "multi"
                    ? "conic-gradient(#e4002b,#f4e04d,#1f8a4c,#2b6cd4,#7a2bd4,#e4002b)"
                    : c.hex,
              }}
            />
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

export function PriceFilter({ min, max }: { min: number; max: number }) {
  const [value, setValue] = useState([min, max]);
  return (
    <div>
      <Slider
        min={min}
        max={max}
        step={100}
        minStepsBetweenThumbs={1}
        value={value}
        onValueChange={setValue}
        thumbLabels={["Minimum price", "Maximum price"]}
      />
      <p className="tabular mt-2 flex justify-between text-[12px]">
        <span>{formatINR(rupees(value[0]))}</span>
        <span>{formatINR(rupees(value[1]))}</span>
      </p>
    </div>
  );
}

export function AppliedChips({ chips, onRemove, onClear }: { chips: string[]; onRemove: (c: string) => void; onClear: () => void }) {
  return (
    <div className="border-b border-line pb-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[12.5px] font-bold uppercase tracking-[0.12em]">Applied</p>
        {chips.length ? (
          <button type="button" onClick={onClear} className="text-[11px] font-bold uppercase tracking-[0.1em] underline underline-offset-4">
            Clear all
          </button>
        ) : null}
      </div>
      {chips.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => onRemove(c)}
                aria-label={`Remove filter ${c}`}
                className="inline-flex items-center gap-1 bg-soft px-2.5 py-1.5 text-[12px] hover:bg-soft-2"
              >
                {c}
                <Icon icon={Cancel01Icon} size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted">No filters applied</p>
      )}
    </div>
  );
}

/** Filter bar chips (desktop): black FILTERS (n) + quick filter dropdown chips. */
export function FilterBarChip({ label, active = false, count }: { label: string; active?: boolean; count?: number }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 border px-3.5 text-[11.5px] font-semibold uppercase tracking-[0.1em]",
        active ? "border-black bg-black text-white" : "border-line bg-white hover:border-black",
      )}
    >
      {active ? <Icon icon={FilterHorizontalIcon} size={16} /> : null}
      {label}
      {count !== undefined ? <span className="tabular">({count})</span> : null}
      {!active ? <Icon icon={ArrowDown01Icon} size={14} /> : null}
    </button>
  );
}

export const SORT_OPTIONS = [
  { value: "popularity", label: "Popularity" },
  { value: "new", label: "New arrivals" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "discount", label: "Discount" },
  { value: "rating", label: "Customer rating" },
] as const;

export function SortMenu({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[12px] text-ink-2">Sort by:</span>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-9 min-w-[150px] items-center justify-between gap-3 border border-black px-3 text-[11.5px] font-semibold uppercase tracking-[0.1em]">
          {current.label}
          <Icon icon={ArrowDown01Icon} size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={current.value} onValueChange={onChange}>
            {SORT_OPTIONS.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
