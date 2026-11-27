"use client";

import { Download04Icon, FileImportIcon, Tag01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GarmentArt } from "@/components/store/garment-art";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { adminApi, notify, useAdmin } from "./admin-shell";
import { AButton, AIcon, AInput, ALabel, ASelect, Confirm, DataTable, ErrorState, FormDialog, PageHeader, SearchBox, StatusBadge, useUrlFilters } from "./ui";

/**
 * ADM-01 products list: one row per product (style) with its colours; select rows for bulk actions (publish,
 * unpublish, archive, category, tags — one transaction on the server, lib/catalog/bulk.ts); CSV export / import.
 */
type Status = "draft" | "active" | "archived";
type PlatformRow = { id: string; handle: string; title: string; sku: string; category: string; price: number; mrp: number; status: Status; stock: number; image: { art: string; colour: string; url?: string } };
type StyleRow = {
  styleId: string;
  title: string;
  category: string;
  colours: { id: string; name: string; hex: string; status: Status }[];
  price: { min: number; max: number };
  stock: number;
  status: Status;
  /** Live colours on "Show as sold out". */
  held: number;
  image: { art: string; colour: string; url?: string };
};
interface TreeNode {
  handle: string;
  title: string;
  subcategories: { handle: string; title: string }[];
}
const TONE = { draft: "warning", active: "success", archived: "neutral" } as const;
const NONE = "__none";
const MAX_BULK = 100;

function useList(url: string) {
  const [data, setData] = useState<{ editable: boolean; rows: (StyleRow | PlatformRow)[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // Busy = the last finished load isn't for the current URL + reload count (no setState inside the effect body).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const want = `${url}#${nonce}`;
  useEffect(() => {
    let cancelled = false;
    adminApi<{ editable: boolean; rows: (StyleRow | PlatformRow)[]; total: number }>(url)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load."))
      .finally(() => !cancelled && setLoadedFor(`${url}#${nonce}`));
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);
  return { data, error, busy: loadedFor !== want, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export function CatalogScreen() {
  const { params, set } = useUrlFilters("/admin/catalog");
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const qs = new URLSearchParams({ view: "styles", ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}) }).toString();
  // On the own backend the list is one row per product (style); elsewhere the platform's products (read-only).
  const { data, error, busy, reload } = useList(`/api/admin/catalog?${qs}`);
  const { can } = useAdmin();
  const canEdit = !!data?.editable && can("catalog.write");
  const styles = data?.editable ? (data.rows as StyleRow[]) : null;

  // A selection belongs to one search / filter: changing it starts a new, empty selection (no hidden rows selected).
  const [selection, setSelection] = useState<{ qs: string; ids: Set<string> }>({ qs, ids: new Set() });
  const selected = selection.qs === qs ? selection.ids : new Set<string>();
  const setSelected = (next: Set<string> | ((cur: Set<string>) => Set<string>)) =>
    setSelection((cur) => ({ qs, ids: typeof next === "function" ? next(cur.qs === qs ? cur.ids : new Set()) : next }));
  const visible = useMemo(() => new Set(styles?.map((s) => s.styleId) ?? []), [styles]);
  const chosen = [...selected].filter((id) => visible.has(id));
  const allOnPage = !!styles?.length && styles.every((s) => selected.has(s.styleId));
  const toggle = (id: string) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_BULK) next.add(id);
    else notify("error", `Select at most ${MAX_BULK} products at a time.`);
    return next;
  });

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title="Products"
        description={
          data && !data.editable
            ? "Read-only: this store's catalogue is managed in its commerce platform."
            : "Each product has its colours and sizes. Stock changes go through Inventory."
        }
        action={
          data?.editable ? (
            <div className="flex flex-wrap gap-2">
              <AButton asChild variant="outline">
                <a href="/api/admin/catalog/export" download>
                  <AIcon icon={Download04Icon} /> Export CSV
                </a>
              </AButton>
              {canEdit ? (
                <>
                  <AButton asChild variant="outline">
                    <Link href="/admin/catalog/import">
                      <AIcon icon={FileImportIcon} /> Import CSV
                    </Link>
                  </AButton>
                  <AButton asChild>
                    <Link href="/admin/catalog/new">New product</Link>
                  </AButton>
                </>
              ) : null}
            </div>
          ) : undefined
        }
      />
      <div className="flex flex-wrap gap-3">
        <SearchBox value={q} onChange={(v) => set({ q: v || null })} placeholder="Name, SKU or barcode" />
        {data?.editable ? (
          <ASelect
            label="Status"
            value={status}
            onValueChange={(v) => set({ status: v === "all" ? null : v })}
            options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Has live colours" }, { value: "draft", label: "Has drafts" }, { value: "archived", label: "Has archived" }]}
          />
        ) : null}
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : styles ? (
        <DataTable
          rows={styles}
          busy={busy}
          rowKey={(r) => r.styleId}
          empty={{ title: "No products found", description: canEdit ? "Try adjusting your search, or create a product." : "Try adjusting your search." }}
          columns={[
            ...(canEdit
              ? [
                  {
                    key: "sel",
                    className: "w-10",
                    header: (
                      <input
                        type="checkbox"
                        aria-label="Select all products on this page"
                        className="h-4 w-4 cursor-pointer accent-primary"
                        checked={allOnPage}
                        onChange={() => setSelected(allOnPage ? new Set() : new Set(styles.slice(0, MAX_BULK).map((s) => s.styleId)))}
                      />
                    ),
                    cell: (r: StyleRow) => (
                      <input type="checkbox" aria-label={`Select ${r.title}`} className="h-4 w-4 cursor-pointer accent-primary" checked={selected.has(r.styleId)} onChange={() => toggle(r.styleId)} />
                    ),
                  },
                ]
              : []),
            {
              key: "t",
              header: "Product",
              cell: (r: StyleRow) => (
                <span className="flex items-center gap-3">
                  <GarmentArt image={{ art: r.image.art as never, colour: r.image.colour, url: r.image.url, alt: "" }} sizes="36px" className="h-12 w-9 shrink-0 overflow-hidden rounded" />
                  <Link href={`/admin/catalog/style/${r.styleId}`} className="font-medium text-foreground hover:underline">
                    {r.title}
                  </Link>
                </span>
              ),
            },
            {
              key: "co",
              header: "Colours",
              cell: (r: StyleRow) => (
                <span className="flex items-center gap-1" aria-label={r.colours.map((c) => `${c.name} (${c.status})`).join(", ")}>
                  {r.colours.slice(0, 8).map((c) => (
                    <span key={c.id} title={`${c.name} · ${c.status}`} className={cn("h-4 w-4 rounded-full border border-border", c.status !== "active" && "opacity-40")} style={{ backgroundColor: c.hex }} />
                  ))}
                  {r.colours.length > 8 ? <span className="text-xs text-muted-foreground">+{r.colours.length - 8}</span> : null}
                </span>
              ),
            },
            { key: "c", header: "Category", cell: (r: StyleRow) => r.category },
            { key: "p", header: "Price", cell: (r: StyleRow) => (r.price.min === r.price.max ? formatINR(r.price.min) : `${formatINR(r.price.min)} – ${formatINR(r.price.max)}`) },
            {
      key: "k",
      header: "Stock",
      cell: (r: StyleRow) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className={r.stock === 0 ? "font-semibold text-red-600 dark:text-red-400" : ""}>{r.stock}</span>
          {r.held ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">Shown sold out</span> : null}
        </span>
      ),
    },
            { key: "st", header: "Status", cell: (r: StyleRow) => <StatusBadge status={r.status} tone={TONE[r.status]} label={r.status === "active" ? "live" : r.status} /> },
          ]}
          footer={data && data.total > styles.length ? <p className="px-4 py-3 text-xs text-muted-foreground">Showing {styles.length} of {data.total}. Search to narrow down.</p> : null}
        />
      ) : (
        <DataTable
          rows={(data?.rows as PlatformRow[] | undefined) ?? null}
          busy={busy}
          rowKey={(r) => r.id}
          empty={{ title: "No products found", description: "Try adjusting your search." }}
          columns={[
            {
              key: "t",
              header: "Product",
              cell: (r) => (
                <span className="flex items-center gap-3">
                  <GarmentArt image={{ art: r.image.art as never, colour: r.image.colour, alt: "" }} className="h-12 w-9 rounded" />
                  <Link href={`/products/${r.handle}`} target="_blank" className="font-medium text-foreground hover:underline">
                    {r.title}
                  </Link>
                </span>
              ),
            },
            { key: "s", header: "SKU", cell: (r) => r.sku },
            { key: "c", header: "Category", cell: (r) => r.category },
            { key: "p", header: "Price / MRP", cell: (r) => `${formatINR(r.price)} / ${formatINR(r.mrp)}` },
            { key: "k", header: "Stock", cell: (r) => r.stock },
          ]}
        />
      )}
      {canEdit && chosen.length ? <BulkBar ids={chosen} onClear={() => setSelected(new Set())} onDone={() => (setSelected(new Set()), reload())} /> : null}
    </div>
  );
}

function BulkBar({ ids, onClear, onDone }: { ids: string[]; onClear: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"category" | "add_tag" | "remove_tag" | null>(null);
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [category, setCategory] = useState("");
  const [sub, setSub] = useState(NONE);
  const [tag, setTag] = useState("");
  const n = ids.length;
  const what = `${n} product${n === 1 ? "" : "s"}`;

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const r = await adminApi<{ products: number; colours: number }>("/api/admin/catalog/bulk", { method: "POST", body: { action, styleIds: ids, ...extra } });
      notify("success", r.colours ? `${r.products} product${r.products === 1 ? "" : "s"} updated (${r.colours} colour${r.colours === 1 ? "" : "s"})` : "Nothing needed changing");
      setDialog(null);
      onDone();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Couldn't update.");
    } finally {
      setBusy(false);
    }
  }

  async function openCategory() {
    setDialog("category");
    if (!tree) {
      try {
        const r = await adminApi<{ options: { tree: TreeNode[] } | null }>("/api/admin/catalog?view=options");
        const t = r.options?.tree ?? [];
        setTree(t);
        setCategory(t[0]?.handle ?? "");
      } catch (e) {
        notify("error", e instanceof Error ? e.message : "Couldn't load categories.");
        setDialog(null);
      }
    }
  }

  const cat = tree?.find((c) => c.handle === category);
  return (
    <div className="fixed inset-x-0 bottom-16 z-40 px-3 md:bottom-4 md:left-auto md:right-6 md:px-0">
      <div role="region" aria-label="Bulk actions" className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
        <span className="mr-auto text-sm font-medium">{what} selected</span>
        <AButton size="sm" variant="outline" disabled={busy} onClick={() => void run("publish")}>
          Publish
        </AButton>
        <Confirm
          trigger={<AButton size="sm" variant="outline" disabled={busy}>Unpublish</AButton>}
          title={`Unpublish ${what}?`}
          description="Their live colours become drafts and leave the store straight away. Nothing is deleted."
          confirmLabel="Unpublish"
          onConfirm={() => run("unpublish")}
        />
        <AButton size="sm" variant="outline" disabled={busy} onClick={() => void openCategory()}>
          Category
        </AButton>
        <AButton size="sm" variant="outline" disabled={busy} onClick={() => (setTag(""), setDialog("add_tag"))}>
          <AIcon icon={Tag01Icon} /> Tags
        </AButton>
        <Confirm
          trigger={<AButton size="sm" variant="destructive" disabled={busy}>Archive</AButton>}
          title={`Archive ${what}?`}
          description="Every colour leaves the store. Orders, returns and reports keep their history; you can publish them again later."
          confirmLabel="Archive"
          destructive
          onConfirm={() => run("archive")}
        />
        <AButton size="sm" variant="ghost" disabled={busy} onClick={onClear}>
          Clear
        </AButton>
      </div>

      <FormDialog
        open={dialog === "category"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Move ${what}`}
        description="Every colour moves. Collection rules based on categories update by themselves."
        submitLabel={busy ? "Moving…" : "Move"}
        onSubmit={() => (category ? void run("category", { category, subcategory: sub === NONE ? undefined : sub }) : undefined)}
      >
        {tree ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <ALabel>Category</ALabel>
              <ASelect label="Category" className="w-full" value={category} onValueChange={(v) => (setCategory(v), setSub(NONE))} options={tree.map((c) => ({ value: c.handle, label: c.title }))} />
            </div>
            <div className="space-y-1.5">
              <ALabel>Sub-category</ALabel>
              <ASelect label="Sub-category" className="w-full" value={sub} onValueChange={setSub} options={[{ value: NONE, label: "None" }, ...(cat?.subcategories ?? []).map((s) => ({ value: s.handle, label: s.title }))]} />
            </div>
          </div>
        ) : (
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        )}
      </FormDialog>

      <FormDialog
        open={dialog === "add_tag" || dialog === "remove_tag"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Search tags on ${what}`}
        description="Tags help shoppers find products in search (max 12 per product)."
        submitLabel={dialog === "remove_tag" ? "Remove tag" : "Add tag"}
        onSubmit={() => void run(dialog === "remove_tag" ? "remove_tag" : "add_tag", { tag })}
      >
        <div className="space-y-3">
          <ASelect label="Add or remove" className="w-full" value={dialog ?? "add_tag"} onValueChange={(v) => setDialog(v as "add_tag" | "remove_tag")} options={[{ value: "add_tag", label: "Add a tag" }, { value: "remove_tag", label: "Remove a tag" }]} />
          <div className="space-y-1.5">
            <ALabel htmlFor="bulk-tag">Tag</ALabel>
            <AInput id="bulk-tag" autoFocus maxLength={30} value={tag} onChange={(e) => setTag(e.target.value.toLowerCase())} placeholder="e.g. summer" />
          </div>
        </div>
      </FormDialog>
    </div>
  );
}
