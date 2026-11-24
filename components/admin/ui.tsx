"use client";

import { ArrowLeft01Icon, ArrowRight01Icon, InboxIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cva, type VariantProps } from "class-variance-authority";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertDialog as AD, Select as SelectPrimitive, Slot, Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Admin UI kit (admin-panel-design §5): shadcn-style primitives on Radix + the page patterns
 * (PageHeader, KpiCard, FilterBar, DataTable, EmptyState, StatusBadge, Pagination). Rounded and slate —
 * deliberately different from the square storefront kit. Icons: free Hugeicons only.
 */

export function AIcon({ icon, className }: { icon: IconSvgElement; className?: string }) {
  return <HugeiconsIcon icon={icon} aria-hidden="true" focusable="false" strokeWidth={1.8} className={cn("h-4 w-4 shrink-0", className)} />;
}

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: { default: "h-9 px-4", sm: "h-8 px-3 text-xs", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function AButton({
  className,
  variant,
  size,
  asChild,
  loading,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean }) {
  // asChild: Slot needs exactly ONE child element (the link) — no spinner sibling, not even a `null` slot.
  if (asChild) {
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size }), className)} aria-busy={loading || undefined} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}

export function AInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function ATextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn("flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      {...props}
    />
  );
}

export function ALabel({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

/** shadcn Select (Radix). */
export function ASelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  label,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  label: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cn("flex h-9 w-40 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="text-muted-foreground">▾</SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={4} className="admin-root z-[200] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[state=checked]:font-semibold"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side="right" sideOffset={8} className="z-[200] rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-md">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/** shadcn AlertDialog — every destructive admin action. */
export function Confirm({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => unknown;
  children?: React.ReactNode;
}) {
  return (
    <AD.Root>
      <AD.Trigger asChild>{trigger}</AD.Trigger>
      <AD.Portal>
        <AD.Overlay className="fixed inset-0 z-[150] bg-black/50" />
        <AD.Content className="admin-root fixed left-1/2 top-1/2 z-[160] flex max-h-[85dvh] w-[min(100vw-32px,460px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lg">
          <AD.Title className="text-lg font-semibold">{title}</AD.Title>
          <AD.Description asChild>
            <div className="mt-2 overflow-y-auto text-sm text-muted-foreground">{description}</div>
          </AD.Description>
          {children ? <div className="mt-4">{children}</div> : null}
          <div className="mt-6 flex justify-end gap-2">
            <AD.Cancel className={buttonVariants({ variant: "outline" })}>Cancel</AD.Cancel>
            <AD.Action className={buttonVariants({ variant: destructive ? "destructive" : "default" })} onClick={() => void onConfirm()}>
              {confirmLabel}
            </AD.Action>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}

export function PageHeader({ title, description, action, back }: { title: string; description?: string; action?: React.ReactNode; back?: boolean }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {back ? (
          <button type="button" aria-label="Back" onClick={() => router.back()} className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <AIcon icon={ArrowLeft01Icon} />
          </button>
        ) : null}
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

const KPI_TINTS = {
  purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
} as const;

export function KpiCard({ icon, tint, value, label, hint }: { icon: IconSvgElement; tint: keyof typeof KPI_TINTS; value: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", KPI_TINTS[tint])}>
          <AIcon icon={icon} className="h-5 w-5" />
        </div>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export const STATUS_BADGE = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  active: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  success: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  warning: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  danger: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400",
} as const;

const STATUS_TONE: Record<string, keyof typeof STATUS_BADGE> = {
  placed: "pending",
  pending_payment: "pending",
  confirmed: "active",
  packed: "active",
  shipped: "active",
  out_for_delivery: "active",
  delivered: "success",
  completed: "success",
  resolved: "success",
  cancelled: "neutral",
  expired: "neutral",
  returned: "neutral",
  rto: "danger",
  payment_failed: "danger",
  needs_review: "warning",
  qc_failed: "danger",
  pickup_scheduled: "pending",
  picked_up: "active",
  received: "pending",
  acknowledged: "active",
  in_progress: "active",
  rejected: "neutral",
  payout_pending: "warning",
};

export function StatusBadge({ status, label, tone }: { status: string; label?: string; tone?: keyof typeof STATUS_BADGE }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_BADGE[tone ?? STATUS_TONE[status] ?? "neutral"])}>
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

/** Filters live in the URL; search is debounced 350 ms, selects apply immediately. */
export function useUrlFilters(basePath: string) {
  const router = useRouter();
  const params = useSearchParams();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  };
  return { params, set };
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [draft, setDraft] = useState(value);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = window.setTimeout(() => onChange(draft), 350);
    return () => window.clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps -- debounce only on typing
  return (
    <div className="relative min-w-52 flex-1">
      <AIcon icon={Search01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <AInput aria-label={placeholder} placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} className="h-9 pl-9" />
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-8 text-center sm:py-16">
      <AIcon icon={InboxIcon} className="mb-3 h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-10 text-center">
      <p className="text-sm text-foreground">{message}</p>
      {onRetry ? (
        <AButton size="sm" variant="outline" onClick={onRetry}>
          Try again
        </AButton>
      ) : null}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  busy,
  empty,
  footer,
}: {
  rows: T[] | null;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  busy?: boolean;
  empty: { title: string; description: string };
  footer?: React.ReactNode;
}) {
  if (rows && rows.length === 0 && !busy) return <EmptyState {...empty} />;
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      {busy || !rows ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px]" aria-busy="true">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={rowKey(r)} className="border-b border-border transition-colors last:border-0 hover:bg-muted/30">
                {columns.map((c, i) => (
                  <td key={c.key} className={cn("px-4 py-3", i === 0 ? "font-medium text-foreground" : "text-muted-foreground", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
            {!rows ? (
              <tr>
                <td colSpan={columns.length} className="h-40" />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export function Pagination({ total, page, pageSize, onPage }: { total: number; page: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
      <span>
        Showing {Math.min(total, (page - 1) * pageSize + 1)}–{Math.min(total, page * pageSize)} of {total} records
      </span>
      <span className="flex gap-2">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40">
          <AIcon icon={ArrowLeft01Icon} />
        </button>
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40">
          <AIcon icon={ArrowRight01Icon} />
        </button>
      </span>
    </div>
  );
}

export function Card({ title, children, className, action }: { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4 sm:p-6", className)}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
