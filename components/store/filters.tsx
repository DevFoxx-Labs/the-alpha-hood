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
 * Value-based and controlled: the listing keeps every value in the URL (components/listing).
 * Options with a count of 0 are disabled unless selected (so a selection can always be removed).
 */

export function FilterSection({
  title,
  defaultOpen = true,
  selectedCount = 0,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  selectedCount?: number;
  children: React.ReactNode;
}) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen} className="group border-b border-line py-4">
      <Collapsible.Trigger className="flex w-full items-center justify-between text-[12.5px] font-bold uppercase tracking-[0.12em]">
        <span>
          {title}
          {selectedCount > 0 ? <span className="tabular ml-1.5 text-ink-2">({selectedCount})</span> : null}
        </span>
        <Icon icon={Add01Icon} size={16} className="group-data-[state=open]:hidden" />
        <Icon icon={MinusSignIcon} size={16} className="hidden group-data-[state=open]:block" />
      </Collapsible.Trigger>
      <Collapsible.Content className="pt-3.5">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

type Opt = { value?: string; label: string; count?: number };
const valueOf = (o: Opt) => o.value ?? o.label;
const isDisabled = (o: Opt, selected: string[]) => o.count === 0 && !selected.includes(valueOf(o));

export function SizeFilter({
  sizes,
  selected,
  onToggle,
}: {
  sizes: (string | Opt)[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {sizes.map((raw) => {
        const s: Opt = typeof raw === "string" ? { label: raw } : raw;
        const v = valueOf(s);
        const on = selected.includes(v);
        const disabled = isDisabled(s, selected);
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            aria-label={disabled ? `${s.label}, no matching styles` : s.label}
            onClick={() => onToggle(v)}
            className={cn(
              "h-9 border text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:text-muted disabled:line-through",
              on ? "border-black bg-black text-white" : "border-line hover:border-black disabled:hover:border-line",
            )}
          >
            {s.label}
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
  options: Opt[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const base = useId();
  return (
    <ul className="space-y-2.5">
      {options.map((o, i) => {
        const v = valueOf(o);
        const disabled = isDisabled(o, selected);
        return (
          <li key={v} className={cn("flex items-center gap-2.5", disabled && "opacity-45")}>
            <Checkbox id={`${base}-${i}`} checked={selected.includes(v)} disabled={disabled} onCheckedChange={() => onToggle(v)} />
            <label htmlFor={`${base}-${i}`} className="flex flex-1 cursor-pointer items-center justify-between text-[13px]">
              {o.label}
              {o.count !== undefined ? <span className="tabular text-[11.5px] text-muted">{o.count}</span> : null}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function ColourFilter({
  colours,
  selected,
  onToggle,
}: {
  colours: { value?: string; name: string; hex: string; count?: number }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-x-1 gap-y-3">
      {colours.map((c) => {
        const v = c.value ?? c.name;
        const on = selected.includes(v);
        const disabled = c.count === 0 && !on;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            aria-label={c.count !== undefined ? `${c.name}, ${c.count} styles` : c.name}
            onClick={() => onToggle(v)}
            className="flex flex-col items-center gap-1 text-[10.5px] text-ink-2 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <span
              aria-hidden="true"
              className={cn("size-[22px] rounded-full border border-black/15", on && "ring-2 ring-black ring-offset-2")}
              style={{
                background: c.hex === "multi" ? "conic-gradient(#e4002b,#f4e04d,#1f8a4c,#2b6cd4,#7a2bd4,#e4002b)" : c.hex,
              }}
            />
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

/** Price range in whole rupees. Commits on release (one navigation per drag, not per pixel). */
export function PriceFilter({
  min,
  max,
  value,
  onCommit,
  step = 100,
}: {
  min: number;
  max: number;
  value?: [number, number];
  onCommit?: (value: [number, number]) => void;
  step?: number;
}) {
  const [draft, setDraft] = useState<number[]>(value ?? [min, max]);
  return (
    <div>
      <Slider
        min={min}
        max={max}
        step={step}
        minStepsBetweenThumbs={1}
        value={draft}
        onValueChange={setDraft}
        onValueCommit={(v) => onCommit?.([v[0], v[1]])}
        thumbLabels={["Minimum price", "Maximum price"]}
      />
      <p className="tabular mt-2 flex justify-between text-[12px]">
        <span>{formatINR(rupees(draft[0]))}</span>
        <span>{formatINR(rupees(draft[1]))}</span>
      </p>
    </div>
  );
}

type Chip = string | { id: string; label: string };

export function AppliedChips({
  chips,
  onRemove,
  onClear,
  className,
}: {
  chips: Chip[];
  onRemove: (id: string) => void;
  onClear: () => void;
  className?: string;
}) {
  const items = chips.map((c) => (typeof c === "string" ? { id: c, label: c } : c));
  return (
    <div className={cn("border-b border-line pb-4", className)}>
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[12.5px] font-bold uppercase tracking-[0.12em]">Applied</p>
        {items.length ? (
          <button type="button" onClick={onClear} className="text-[11px] font-bold uppercase tracking-[0.1em] underline underline-offset-4">
            Clear all
          </button>
        ) : null}
      </div>
      {items.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                aria-label={`Remove filter ${c.label}`}
                className="inline-flex items-center gap-1 bg-soft px-2.5 py-1.5 text-[12px] hover:bg-soft-2"
              >
                {c.label}
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

/** Filter bar chips (desktop): black FILTERS (n) + quick filter dropdown chips. Spreads button props (Popover triggers). */
export function FilterBarChip({
  label,
  active = false,
  count,
  className,
  ...props
}: { label: string; active?: boolean; count?: number } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 border px-3.5 text-[11.5px] font-semibold uppercase tracking-[0.1em]",
        active ? "border-black bg-black text-white" : "border-line bg-white hover:border-black data-[state=open]:border-black",
        className,
      )}
      {...props}
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

export const SEARCH_SORT_OPTIONS = [{ value: "relevance", label: "Relevance" }, ...SORT_OPTIONS] as const;

export function SortMenu({
  value,
  onChange,
  options = SORT_OPTIONS,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: readonly { value: string; label: string }[];
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
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
            {options.map((o) => (
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
