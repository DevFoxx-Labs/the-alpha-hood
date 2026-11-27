"use client";

import { Add01Icon, ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon, Delete02Icon, ImageUpload01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GarmentArt } from "@/components/store/garment-art";
import { ATTRIBUTE_VALUES, FILTER_LABELS, SIZE_ORDER } from "@/lib/catalog/attributes";
import { GARMENT_KINDS } from "@/lib/catalog/product-options";
import type { GarmentKind } from "@/lib/commerce/types";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { adminApi, notify, useAdmin } from "./admin-shell";
import { AButton, AIcon, AInput, ALabel, ASelect, ATextarea, Card, Confirm, DataTable, EmptyState, ErrorState, FormDialog, PageHeader, StatusBadge, Tip } from "./ui";

/**
 * Category tree, homepage category rail and collections (own backend). The screens only collect choices; the
 * server (lib/catalog/taxonomy.ts) validates everything, refuses removing what products / combos / links still use,
 * and refuses a stale save (409). Images are a placeholder drawing plus an optional uploaded photo.
 */

// ── Shared ───────────────────────────────────────────────────────────────────────────────────────

interface Img {
  art: GarmentKind;
  colour: string;
  alt: string;
  url?: string;
}
interface Sub {
  handle: string;
  title: string;
  image: Img;
}
interface Cat extends Sub {
  subcategories: Sub[];
}

const MEDIA_PREFIX = "/api/media/";

const slug = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

const imgBody = (i: Img) => ({ art: i.art, colour: i.colour, alt: i.alt, ...(i.url?.startsWith(MEDIA_PREFIX) ? { photo: i.url.slice(MEDIA_PREFIX.length) } : {}) });

const errText = (e: unknown, fallback = "Something went wrong.") => (e instanceof Error ? e.message : fallback);

function IconButton({ icon, label, onClick, disabled, tone, ...rest }: { icon: IconSvgElement; label: string; tone?: "danger" } & Omit<React.ComponentProps<"button">, "children">) {
  return (
    <button
      {...rest}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35",
        tone === "danger" && "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400",
        rest.className,
      )}
    >
      <AIcon icon={icon} />
    </button>
  );
}

function Thumb({ image, className }: { image: Img; className?: string }) {
  return <GarmentArt image={{ ...image, alt: "" }} className={cn("h-11 w-9 shrink-0 overflow-hidden rounded", className)} sizes="36px" />;
}

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Placeholder drawing + colour, alt text and an optional uploaded photo (JPEG/PNG to our own media store). */
function ImageFields({ value, onChange }: { value: Img; onChange: (v: Img) => void }) {
  const [busy, setBusy] = useState(false);
  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.type !== "image/jpeg" && file.type !== "image/png") return notify("error", "Use a JPEG or PNG photo.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/media", { method: "POST", headers: { "Content-Type": file.type }, body: file, cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
      if (!res.ok || !data?.id) throw new Error(data?.error?.message ?? "Upload failed.");
      onChange({ ...value, url: `${MEDIA_PREFIX}${data.id}` });
    } catch (e) {
      notify("error", errText(e, "Upload failed."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">Image</legend>
      <div className="flex items-start gap-3">
        <Thumb image={value} className="h-20 w-16" />
        <div className="min-w-0 flex-1 space-y-2">
          <label className={cn("inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent", busy && "pointer-events-none opacity-50")}>
            <AIcon icon={ImageUpload01Icon} />
            {busy ? "Uploading…" : value.url ? "Replace photo" : "Upload photo"}
            <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
          {value.url ? (
            <AButton type="button" size="sm" variant="ghost" onClick={() => onChange({ ...value, url: undefined })}>
              Use the drawing instead
            </AButton>
          ) : (
            <p className="text-xs text-muted-foreground">No photo yet — the drawing below is shown.</p>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <ALabel>Placeholder drawing</ALabel>
          <ASelect label="Placeholder drawing" className="w-full" value={value.art} onValueChange={(v) => onChange({ ...value, art: v as GarmentKind })} options={GARMENT_KINDS.map((k) => ({ value: k, label: k }))} />
        </div>
        <div className="space-y-1.5">
          <ALabel htmlFor="img-colour">Drawing colour</ALabel>
          <input id="img-colour" type="color" value={value.colour} onChange={(e) => onChange({ ...value, colour: e.target.value })} className="h-9 w-full cursor-pointer rounded-md border border-input bg-background p-1" />
        </div>
      </div>
      <div className="space-y-1.5">
        <ALabel htmlFor="img-alt">Image description (alt text)</ALabel>
        <AInput id="img-alt" value={value.alt} maxLength={80} onChange={(e) => onChange({ ...value, alt: e.target.value })} placeholder="e.g. Black baggy jeans" />
      </div>
    </fieldset>
  );
}

function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

// ── Categories ───────────────────────────────────────────────────────────────────────────────────

interface RailTile {
  handle: string;
  subcategory: string;
  title: string;
  image: Img;
}
interface CatData {
  revision: number;
  tree: Cat[];
  featured: { handle: string; title: string; image: Img; href?: string }[];
  /** Shop all page categories in order; null = every category. */
  shopAll: string[] | null;
  usage: Record<string, number>;
}

type NodeDialog = { kind: "category"; index: number | null } | { kind: "sub"; parent: number; index: number | null } | { kind: "rail"; index: number | null } | null;

const NONE = "__none";

export function CategoriesScreen() {
  const { can } = useAdmin();
  const canEdit = can("catalog.write");
  const [server, setServer] = useState<CatData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<Cat[]>([]);
  const [rail, setRail] = useState<RailTile[]>([]);
  /** null = every category, in tree order. */
  const [shopAll, setShopAll] = useState<string[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<NodeDialog>(null);
  const [nonce, setNonce] = useState(0);
  useLeaveGuard(dirty);

  useEffect(() => {
    let cancelled = false;
    adminApi<CatData>("/api/admin/categories")
      .then((d) => {
        if (cancelled) return;
        setServer(d);
        setTree(d.tree);
        setRail(d.featured.map((f) => ({ handle: f.handle, subcategory: f.href?.split("/")[3] ?? NONE, title: f.title, image: f.image })));
        setShopAll(d.shopAll);
        setDirty(false);
        setError(null);
      })
      .catch((e) => !cancelled && setError(errText(e, "Couldn't load.")));
    return () => {
      cancelled = true;
    };
  }, [nonce]);
  const reload = () => setNonce((n) => n + 1);

  const savedHandles = useMemo(() => new Set(server?.tree.flatMap((c) => [c.handle, ...c.subcategories.map((s) => `${c.handle}/${s.handle}`)]) ?? []), [server]);
  const usage = server?.usage ?? {};
  const edit = (next: Cat[]) => (setTree(next), setDirty(true));
  const editRail = (next: RailTile[]) => (setRail(next), setDirty(true));
  const editShopAll = (next: string[] | null) => (setShopAll(next), setDirty(true));
  // The list the editor shows: the chosen ones in their order (still in the tree), then the rest, hidden.
  const shopAllShown = shopAll ? shopAll.filter((h) => tree.some((c) => c.handle === h)) : tree.map((c) => c.handle);
  const shopAllHidden = tree.filter((c) => !shopAllShown.includes(c.handle));

  async function save() {
    if (!server) return;
    setSaving(true);
    try {
      await adminApi("/api/admin/categories", {
        method: "PUT",
        body: {
          revision: server.revision,
          tree: tree.map((c) => ({ handle: c.handle, title: c.title, image: imgBody(c.image), subcategories: c.subcategories.map((s) => ({ handle: s.handle, title: s.title, image: imgBody(s.image) })) })),
          featured: rail.map((r) => ({ handle: r.handle, title: r.title, image: imgBody(r.image), ...(r.subcategory !== NONE ? { subcategory: r.subcategory } : {}) })),
          // Every category, in tree order → null (new categories then show up automatically).
          shopAll: shopAll === null || (shopAllShown.length === tree.length && shopAllShown.every((h, i) => h === tree[i].handle)) ? null : shopAllShown,
        },
      });
      notify("success", "Categories saved — the store shows them within a few seconds");
      reload();
    } catch (e) {
      notify("error", errText(e, "Couldn't save."));
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!server) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        title="Categories"
        description="The shop menu and category pages (/men/…). A category that products use can't be removed — move the products first."
        action={canEdit ? <AButton onClick={() => setDialog({ kind: "category", index: null })}><AIcon icon={Add01Icon} /> New category</AButton> : undefined}
      />

      <Card title={`Category tree · ${tree.length}`}>
        {tree.length === 0 ? (
          <EmptyState title="No categories yet" description="Create the first category to start adding products." />
        ) : (
          <ul className="divide-y divide-border">
            {tree.map((c, i) => {
              const used = usage[c.handle] ?? 0;
              return (
                <li key={c.handle} className="py-3">
                  <div className="flex items-center gap-3">
                    <Thumb image={c.image} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        /men/{c.handle} · {used} product{used === 1 ? "" : "s"} · {c.subcategories.length} sub
                      </p>
                    </div>
                    {canEdit ? (
                      <div className="flex items-center">
                        <IconButton icon={ArrowUp01Icon} label={`Move ${c.title} up`} disabled={i === 0} onClick={() => edit(move(tree, i, -1))} />
                        <IconButton icon={ArrowDown01Icon} label={`Move ${c.title} down`} disabled={i === tree.length - 1} onClick={() => edit(move(tree, i, 1))} />
                        <IconButton icon={PencilEdit02Icon} label={`Edit ${c.title}`} onClick={() => setDialog({ kind: "category", index: i })} />
                        <RemoveButton
                          name={c.title}
                          blockedBy={used ? `${used} product${used === 1 ? "" : "s"} use it` : rail.some((r) => r.handle === c.handle) ? "it's in the homepage rail" : null}
                          description={c.subcategories.length ? `Its ${c.subcategories.length} sub-categories go too. Nothing changes on the store until you save.` : "Nothing changes on the store until you save."}
                          onRemove={() => edit(tree.filter((_, j) => j !== i))}
                        />
                      </div>
                    ) : null}
                  </div>
                  {c.subcategories.length || canEdit ? (
                    <ul className="ml-6 mt-2 space-y-1 border-l border-border pl-4 sm:ml-12">
                      {c.subcategories.map((s, k) => {
                        const subUsed = usage[`${c.handle}/${s.handle}`] ?? 0;
                        const setSubs = (subs: Sub[]) => edit(tree.map((x, j) => (j === i ? { ...x, subcategories: subs } : x)));
                        return (
                          <li key={s.handle} className="flex items-center gap-3 py-1">
                            <Thumb image={s.image} className="h-9 w-7" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm">{s.title}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                /{s.handle} · {subUsed} product{subUsed === 1 ? "" : "s"}
                              </p>
                            </div>
                            {canEdit ? (
                              <div className="flex items-center">
                                <IconButton icon={ArrowUp01Icon} label={`Move ${s.title} up`} disabled={k === 0} onClick={() => setSubs(move(c.subcategories, k, -1))} />
                                <IconButton icon={ArrowDown01Icon} label={`Move ${s.title} down`} disabled={k === c.subcategories.length - 1} onClick={() => setSubs(move(c.subcategories, k, 1))} />
                                <IconButton icon={PencilEdit02Icon} label={`Edit ${s.title}`} onClick={() => setDialog({ kind: "sub", parent: i, index: k })} />
                                <RemoveButton
                                  name={s.title}
                                  blockedBy={subUsed ? `${subUsed} product${subUsed === 1 ? "" : "s"} use it` : rail.some((r) => r.handle === c.handle && r.subcategory === s.handle) ? "it's in the homepage rail" : null}
                                  description="Nothing changes on the store until you save."
                                  onRemove={() => setSubs(c.subcategories.filter((_, j) => j !== k))}
                                />
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                      {canEdit ? (
                        <li>
                          <AButton size="sm" variant="ghost" onClick={() => setDialog({ kind: "sub", parent: i, index: null })}>
                            <AIcon icon={Add01Icon} /> Add sub-category
                          </AButton>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title={`Homepage category rail · ${rail.length}`}
        action={canEdit ? <AButton size="sm" variant="outline" disabled={rail.length >= 12 || tree.length === 0} onClick={() => setDialog({ kind: "rail", index: null })}><AIcon icon={Add01Icon} /> Add tile</AButton> : undefined}
      >
        <p className="mb-3 text-sm text-muted-foreground">The round category tiles on the homepage, in this order (up to 12).</p>
        {rail.length === 0 ? (
          <EmptyState title="The rail is empty" description="Add tiles to show categories on the homepage." />
        ) : (
          <ul className="divide-y divide-border">
            {rail.map((r, i) => {
              const cat = tree.find((c) => c.handle === r.handle);
              const sub = cat?.subcategories.find((s) => s.handle === r.subcategory);
              return (
                <li key={`${r.handle}/${r.subcategory}/${i}`} className="flex items-center gap-3 py-2.5">
                  <Thumb image={r.image} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Opens {cat ? cat.title : r.handle}
                      {sub ? ` › ${sub.title}` : ""}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex items-center">
                      <IconButton icon={ArrowUp01Icon} label={`Move ${r.title} up`} disabled={i === 0} onClick={() => editRail(move(rail, i, -1))} />
                      <IconButton icon={ArrowDown01Icon} label={`Move ${r.title} down`} disabled={i === rail.length - 1} onClick={() => editRail(move(rail, i, 1))} />
                      <IconButton icon={PencilEdit02Icon} label={`Edit ${r.title}`} onClick={() => setDialog({ kind: "rail", index: i })} />
                      <IconButton icon={Cancel01Icon} tone="danger" label={`Remove ${r.title} from the rail`} onClick={() => editRail(rail.filter((_, j) => j !== i))} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title={`Shop all page · ${shopAllShown.length} of ${tree.length}`}
        action={canEdit && shopAll !== null ? <AButton size="sm" variant="outline" onClick={() => editShopAll(null)}>Show all categories</AButton> : undefined}
      >
        <p className="mb-3 text-sm text-muted-foreground">
          The category tiles at the top of the “Shop all” page (/men — where the homepage&apos;s <b>Shop all</b> link goes), in this order.
          {shopAll === null ? " Showing every category; new categories appear automatically." : " Only these show; a new category stays hidden here until you add it."}
        </p>
        {tree.length === 0 ? (
          <EmptyState title="No categories yet" description="Create a category first." />
        ) : (
          <ul className="divide-y divide-border">
            {shopAllShown.map((h, i) => {
              const c = tree.find((x) => x.handle === h)!;
              return (
                <li key={h} className="flex items-center gap-3 py-2.5">
                  <Thumb image={c.image} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="truncate text-xs text-muted-foreground">Shown · /men/{c.handle}</p>
                  </div>
                  {canEdit ? (
                    <div className="flex items-center">
                      <IconButton icon={ArrowUp01Icon} label={`Move ${c.title} up on Shop all`} disabled={i === 0} onClick={() => editShopAll(move(shopAllShown, i, -1))} />
                      <IconButton icon={ArrowDown01Icon} label={`Move ${c.title} down on Shop all`} disabled={i === shopAllShown.length - 1} onClick={() => editShopAll(move(shopAllShown, i, 1))} />
                      <IconButton icon={Cancel01Icon} tone="danger" label={`Hide ${c.title} on Shop all`} disabled={shopAllShown.length === 1} onClick={() => editShopAll(shopAllShown.filter((x) => x !== h))} />
                    </div>
                  ) : null}
                </li>
              );
            })}
            {shopAllHidden.map((c) => (
              <li key={c.handle} className="flex items-center gap-3 py-2.5 opacity-60">
                <Thumb image={c.image} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="truncate text-xs text-muted-foreground">Hidden on Shop all · its page /men/{c.handle} still works</p>
                </div>
                {canEdit ? (
                  <AButton size="sm" variant="outline" onClick={() => editShopAll([...shopAllShown, c.handle])}>
                    <AIcon icon={Add01Icon} /> Show
                  </AButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {dirty && canEdit ? (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 md:bottom-4 md:left-auto md:right-6 md:px-0">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
            <span className="text-sm">Unsaved changes</span>
            <div className="flex gap-2">
              <AButton size="sm" variant="outline" disabled={saving} onClick={reload}>
                Discard
              </AButton>
              <AButton size="sm" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save changes"}
              </AButton>
            </div>
          </div>
        </div>
      ) : null}

      <NodeEditor
        dialog={dialog}
        tree={tree}
        rail={rail}
        savedHandles={savedHandles}
        onClose={() => setDialog(null)}
        onTree={(t) => (edit(t), setDialog(null))}
        onRail={(r) => (editRail(r), setDialog(null))}
      />
    </div>
  );
}

function RemoveButton({ name, blockedBy, description, onRemove }: { name: string; blockedBy: string | null; description: string; onRemove: () => void }) {
  if (blockedBy) {
    return (
      <Tip label={`Can't remove: ${blockedBy}`}>
        <span tabIndex={0} aria-label={`Can't remove ${name}: ${blockedBy}`} className="flex h-8 w-8 items-center justify-center text-muted-foreground opacity-35">
          <AIcon icon={Delete02Icon} />
        </span>
      </Tip>
    );
  }
  return <Confirm trigger={<IconButton icon={Delete02Icon} tone="danger" label={`Remove ${name}`} />} title={`Remove ${name}?`} description={description} confirmLabel="Remove" destructive onConfirm={onRemove} />;
}

const blankImg = (title: string): Img => ({ art: "tee", colour: "#1b1b1b", alt: title });

/** One dialog for a category, a sub-category or a rail tile; it resets whenever it opens. */
function NodeEditor({
  dialog,
  tree,
  rail,
  savedHandles,
  onClose,
  onTree,
  onRail,
}: {
  dialog: NodeDialog;
  tree: Cat[];
  rail: RailTile[];
  savedHandles: Set<string>;
  onClose: () => void;
  onTree: (t: Cat[]) => void;
  onRail: (r: RailTile[]) => void;
}) {
  const key = dialog ? JSON.stringify(dialog) : "closed";
  return dialog ? <NodeForm key={key} dialog={dialog} tree={tree} rail={rail} savedHandles={savedHandles} onClose={onClose} onTree={onTree} onRail={onRail} /> : null;
}

function NodeForm({ dialog, tree, rail, savedHandles, onClose, onTree, onRail }: Omit<Parameters<typeof NodeEditor>[0], "dialog"> & { dialog: NonNullable<NodeDialog> }) {
  const parent = dialog.kind === "sub" ? tree[dialog.parent] : null;
  const existing: Sub | RailTile | null =
    dialog.index === null ? null : dialog.kind === "category" ? tree[dialog.index] : dialog.kind === "sub" ? parent!.subcategories[dialog.index] : rail[dialog.index];
  const [title, setTitle] = useState(existing?.title ?? "");
  const [handle, setHandle] = useState(dialog.kind === "rail" ? "" : (existing?.handle ?? ""));
  const [handleTouched, setHandleTouched] = useState(!!existing);
  const [image, setImage] = useState<Img>(existing?.image ?? blankImg(""));
  const [railCat, setRailCat] = useState(dialog.kind === "rail" ? ((existing as RailTile | null)?.handle ?? tree[0]?.handle ?? "") : "");
  const [railSub, setRailSub] = useState(dialog.kind === "rail" ? ((existing as RailTile | null)?.subcategory ?? NONE) : NONE);

  const savedKey = dialog.kind === "sub" && parent ? `${parent.handle}/${existing?.handle}` : existing?.handle;
  const handleLocked = dialog.kind !== "rail" && !!existing && savedHandles.has(savedKey ?? "");
  const what = dialog.kind === "category" ? "category" : dialog.kind === "sub" ? "sub-category" : "rail tile";

  function submit() {
    const t = title.trim();
    if (t.length < 2) return notify("error", "Enter a name (2–60 characters).");
    const img = { ...image, alt: image.alt.trim() || t };
    if (dialog.kind === "rail") {
      if (!railCat) return notify("error", "Choose a category.");
      const tile: RailTile = { handle: railCat, subcategory: railSub, title: t, image: img };
      return onRail(dialog.index === null ? [...rail, tile] : rail.map((r, j) => (j === dialog.index ? tile : r)));
    }
    const h = handle || slug(t);
    if (!/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(h)) return notify("error", "URL handle: lower-case letters, digits and dashes.");
    const siblings = dialog.kind === "category" ? tree : parent!.subcategories;
    if (siblings.some((s, j) => s.handle === h && j !== dialog.index)) return notify("error", `Another ${what} already uses “${h}”.`);
    const node: Sub = { handle: h, title: t, image: img };
    if (dialog.kind === "category") {
      const cat: Cat = { ...node, subcategories: dialog.index === null ? [] : tree[dialog.index].subcategories };
      return onTree(dialog.index === null ? [...tree, cat] : tree.map((c, j) => (j === dialog.index ? cat : c)));
    }
    const subs = dialog.index === null ? [...parent!.subcategories, node] : parent!.subcategories.map((s, j) => (j === dialog.index ? node : s));
    onTree(tree.map((c, j) => (j === dialog.parent ? { ...c, subcategories: subs } : c)));
  }

  const railCategory = tree.find((c) => c.handle === railCat);
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${existing ? "Edit" : "New"} ${what}${parent ? ` in ${parent.title}` : ""}`}
      description="Changes apply on the store after you press Save changes."
      submitLabel={existing ? "Apply" : "Add"}
      onSubmit={submit}
    >
      {dialog.kind === "rail" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <ALabel>Category</ALabel>
            <ASelect
              label="Category"
              className="w-full"
              value={railCat}
              onValueChange={(v) => {
                setRailCat(v);
                setRailSub(NONE);
                const c = tree.find((x) => x.handle === v);
                if (c && !existing) {
                  setTitle(c.title);
                  setImage(c.image);
                }
              }}
              options={tree.map((c) => ({ value: c.handle, label: c.title }))}
            />
          </div>
          <div className="space-y-1.5">
            <ALabel>Sub-category (optional)</ALabel>
            <ASelect
              label="Sub-category"
              className="w-full"
              value={railSub}
              onValueChange={(v) => {
                setRailSub(v);
                const s = railCategory?.subcategories.find((x) => x.handle === v);
                if (s && !existing) {
                  setTitle(s.title);
                  setImage(s.image);
                }
              }}
              options={[{ value: NONE, label: "Whole category" }, ...(railCategory?.subcategories ?? []).map((s) => ({ value: s.handle, label: s.title }))]}
            />
          </div>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <ALabel htmlFor="node-title">{dialog.kind === "rail" ? "Tile label" : "Name"}</ALabel>
        <AInput
          id="node-title"
          autoFocus
          maxLength={60}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!handleTouched && !handleLocked) setHandle(slug(e.target.value));
          }}
          placeholder={dialog.kind === "sub" ? "e.g. Baggy" : "e.g. Jeans"}
        />
      </div>
      {dialog.kind !== "rail" ? (
        <div className="space-y-1.5">
          <ALabel htmlFor="node-handle">URL handle</ALabel>
          <AInput
            id="node-handle"
            value={handle}
            disabled={handleLocked}
            maxLength={60}
            onChange={(e) => (setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")), setHandleTouched(true))}
            placeholder="jeans"
          />
          <p className="text-xs text-muted-foreground">
            {handleLocked ? "Saved handles can't change — links and search engines use them." : `Address: /men/${parent ? `${parent.handle}/` : ""}${handle || "…"}`}
          </p>
        </div>
      ) : null}
      <ImageFields value={image} onChange={setImage} />
    </FormDialog>
  );
}

// ── Collections ──────────────────────────────────────────────────────────────────────────────────

type ConditionType = "category" | "subcategory" | "attribute" | "badge" | "newWithinDays" | "minPopularity" | "minPercentOff" | "maxPrice" | "sizeInStock" | "productIds";
interface Condition {
  type: ConditionType;
  values?: string[];
  key?: string;
  value?: string;
  amount?: number;
  exclude?: boolean;
}
interface Builder {
  match: "all" | "any";
  conditions: Condition[];
}
interface CollectionRow {
  handle: string;
  title: string;
  description?: string;
  builder: Builder | null;
  usedBy: string[];
}
interface Tree {
  handle: string;
  title: string;
  subcategories: { handle: string; title: string }[];
}
interface ColData {
  revision: number;
  collections: CollectionRow[];
  tree: Tree[];
  productTitles: Record<string, string>;
}

const CONDITION_LABEL: Record<ConditionType, string> = {
  category: "Category is",
  subcategory: "Sub-category is",
  attribute: "Attribute is",
  badge: "Badge is",
  sizeInStock: "Size in stock",
  newWithinDays: "Added in the last … days",
  minPercentOff: "Discount at least … %",
  maxPrice: "Price at most … ₹",
  minPopularity: "Popularity at least",
  productIds: "Hand-picked products",
};

function defaultCondition(type: ConditionType, tree: Tree[]): Condition {
  switch (type) {
    case "category":
      return { type, values: tree[0] ? [tree[0].handle] : [] };
    case "subcategory":
      return { type, values: [] };
    case "attribute":
      return { type, key: "fit", values: [] };
    case "badge":
      return { type, value: "NEW" };
    case "sizeInStock":
      return { type, value: "XL" };
    case "newWithinDays":
      return { type, amount: 30 };
    case "minPercentOff":
      return { type, amount: 30 };
    case "maxPrice":
      return { type, amount: 99_900 };
    case "minPopularity":
      return { type, amount: 100 };
    case "productIds":
      return { type, values: [] };
  }
}

function describe(b: Builder | null, tree: Tree[], titles: Record<string, string>): string {
  if (!b) return "Imported rule (kept as it is)";
  const catTitle = (h: string) => tree.find((c) => c.handle === h)?.title ?? h;
  const subTitle = (h: string) => tree.flatMap((c) => c.subcategories).find((s) => s.handle === h)?.title ?? h;
  const one = (c: Condition) => {
    const v = c.values ?? [];
    const text =
      c.type === "category"
        ? `category ${v.map(catTitle).join(" / ")}`
        : c.type === "subcategory"
          ? `sub-category ${v.map(subTitle).join(" / ")}`
          : c.type === "attribute"
            ? `${FILTER_LABELS[c.key as keyof typeof FILTER_LABELS] ?? c.key} ${v.map((x) => ATTRIBUTE_VALUES[c.key as keyof typeof ATTRIBUTE_VALUES]?.[x] ?? x).join(" / ")}`
            : c.type === "badge"
              ? `badge ${c.value}`
              : c.type === "sizeInStock"
                ? `size ${c.value} in stock`
                : c.type === "newWithinDays"
                  ? `added in the last ${c.amount} days`
                  : c.type === "minPercentOff"
                    ? `${c.amount}%+ off`
                    : c.type === "maxPrice"
                      ? `price ≤ ${formatINR(c.amount ?? 0)}`
                      : c.type === "minPopularity"
                        ? `popularity ≥ ${c.amount}`
                        : `${v.length} hand-picked product${v.length === 1 ? "" : "s"}${v.length && titles[v[0]] ? ` (${titles[v[0]]}${v.length > 1 ? "…" : ""})` : ""}`;
    return c.exclude ? `not ${text}` : text;
  };
  return b.conditions.map(one).join(b.match === "any" ? " or " : " and ");
}

export function CollectionsScreen() {
  const { can } = useAdmin();
  const canEdit = can("catalog.write");
  const [data, setData] = useState<ColData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminApi<ColData>("/api/admin/collections")
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e) => !cancelled && setError(errText(e, "Couldn't load.")));
    return () => {
      cancelled = true;
    };
  }, [nonce]);
  const reload = () => setNonce((n) => n + 1);

  async function persist(list: (Omit<CollectionRow, "usedBy" | "builder"> & { builder: Builder | null })[], success: string): Promise<boolean> {
    if (!data) return false;
    try {
      await adminApi("/api/admin/collections", {
        method: "PUT",
        body: {
          revision: data.revision,
          collections: list.map((c) => ({ handle: c.handle, title: c.title, description: c.description || undefined, ...(c.builder ? { builder: c.builder } : { keepRule: true }) })),
        },
      });
      notify("success", success);
      reload();
      return true;
    } catch (e) {
      notify("error", errText(e, "Couldn't save."));
      return false;
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;

  if (editing !== null) {
    const current = editing === "new" ? null : data.collections[editing];
    return (
      <CollectionEditor
        key={String(editing)}
        initial={current}
        data={data}
        onCancel={() => setEditing(null)}
        onSave={async (c) => {
          const list = editing === "new" ? [...data.collections, { ...c, usedBy: [] }] : data.collections.map((x, i) => (i === editing ? { ...x, ...c } : x));
          if (await persist(list, editing === "new" ? "Collection created" : "Collection saved")) setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Collections"
        description="Product groups at /collections/… — built from rules (category, attribute, price, discount, size…) or hand-picked products. They update by themselves as products change."
        action={canEdit ? <AButton onClick={() => setEditing("new")}><AIcon icon={Add01Icon} /> New collection</AButton> : undefined}
      />
      <DataTable
        rows={data.collections}
        rowKey={(r) => r.handle}
        empty={{ title: "No collections yet", description: canEdit ? "Create a collection to group products." : "Collections appear here once created." }}
        columns={[
          {
            key: "t",
            header: "Collection",
            cell: (r) => (
              <span className="block min-w-40">
                <span className="font-medium text-foreground">{r.title}</span>
                <Link href={`/collections/${r.handle}`} target="_blank" className="block text-xs text-muted-foreground hover:underline">
                  /collections/{r.handle}
                </Link>
              </span>
            ),
          },
          { key: "r", header: "Products that match", cell: (r) => <span className="block max-w-md text-sm text-muted-foreground">{describe(r.builder, data.tree, data.productTitles)}</span> },
          { key: "u", header: "Used by", cell: (r) => (r.usedBy.length ? <StatusBadge status="linked" tone="active" label={`${r.usedBy.length} link${r.usedBy.length === 1 ? "" : "s"}`} /> : <span className="text-xs text-muted-foreground">—</span>) },
          {
            key: "x",
            header: "",
            className: "text-right",
            cell: (r) =>
              canEdit ? (
                <span className="flex justify-end">
                  <IconButton icon={PencilEdit02Icon} label={`Edit ${r.title}`} onClick={() => setEditing(data.collections.indexOf(r))} />
                  <RemoveButton
                    name={r.title}
                    blockedBy={r.usedBy.length ? `used by ${r.usedBy.join(", ")}` : null}
                    description="Its page /collections/… stops working. Products are not changed."
                    onRemove={() => void persist(data.collections.filter((x) => x !== r), "Collection removed")}
                  />
                </span>
              ) : null,
          },
        ]}
      />
    </div>
  );
}

function CollectionEditor({ initial, data, onCancel, onSave }: { initial: CollectionRow | null; data: ColData; onCancel: () => void; onSave: (c: { handle: string; title: string; description?: string; builder: Builder | null }) => Promise<void> }) {
  const { can } = useAdmin();
  const canEdit = can("catalog.write");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [handle, setHandle] = useState(initial?.handle ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [builder, setBuilder] = useState<Builder | null>(initial ? initial.builder : { match: "all", conditions: [defaultCondition("category", data.tree)] });
  const [titles, setTitles] = useState<Record<string, string>>(data.productTitles);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ count: number; sample: { id: string; title: string; image: Img }[] } | { error: string } | null>(null);
  useLeaveGuard(true);

  const body = builder ? JSON.stringify(builder) : null;
  useEffect(() => {
    if (!body) return;
    const t = setTimeout(() => {
      adminApi<{ count: number; sample: { id: string; title: string; image: Img }[] }>("/api/admin/collections/preview", { method: "POST", body: { builder: JSON.parse(body) } })
        .then(setPreview)
        .catch((e) => setPreview({ error: errText(e) }));
    }, 500);
    return () => clearTimeout(t);
  }, [body]);

  const setCond = (i: number, c: Condition) => builder && setBuilder({ ...builder, conditions: builder.conditions.map((x, j) => (j === i ? c : x)) });

  async function submit() {
    const t = title.trim();
    const h = handle || slug(t);
    if (t.length < 2) return notify("error", "Enter a name (2–60 characters).");
    if (!/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(h)) return notify("error", "URL handle: lower-case letters, digits and dashes.");
    if (!initial && data.collections.some((c) => c.handle === h)) return notify("error", `Another collection already uses “${h}”.`);
    setSaving(true);
    await onSave({ handle: h, title: t, description: description.trim() || undefined, builder });
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <PageHeader back title={initial ? `Edit ${initial.title}` : "New collection"} description="The rule decides which live products appear; the page updates by itself as products change." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <ALabel htmlFor="col-title">Name</ALabel>
                <AInput id="col-title" value={title} maxLength={60} onChange={(e) => (setTitle(e.target.value), !initial && setHandle(slug(e.target.value)))} placeholder="e.g. Winter drop" />
              </div>
              <div className="space-y-1.5">
                <ALabel htmlFor="col-handle">URL handle</ALabel>
                <AInput id="col-handle" value={handle} disabled={!!initial} maxLength={60} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="winter-drop" />
                <p className="text-xs text-muted-foreground">{initial ? "Saved handles can't change — links use them." : `Address: /collections/${handle || "…"}`}</p>
              </div>
              <div className="space-y-1.5">
                <ALabel htmlFor="col-desc">Description (optional)</ALabel>
                <ATextarea id="col-desc" value={description} maxLength={200} rows={2} onChange={(e) => setDescription(e.target.value)} placeholder="Shown under the collection title." />
              </div>
            </div>
          </Card>

          <Card title="Which products">
            {!builder ? (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">This collection was imported with a rule that is more complex than the editor can show. Saving keeps that rule as it is.</p>
                <AButton variant="outline" onClick={() => setBuilder({ match: "all", conditions: [defaultCondition("category", data.tree)] })}>
                  Replace with a new rule
                </AButton>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Products must match</span>
                  <ASelect label="Match" className="w-44" value={builder.match} onValueChange={(v) => setBuilder({ ...builder, match: v as Builder["match"] })} options={[{ value: "all", label: "all conditions" }, { value: "any", label: "any condition" }]} />
                </div>
                <ul className="space-y-3">
                  {builder.conditions.map((c, i) => (
                    <li key={i} className="rounded-lg border border-border p-3">
                      <ConditionRow
                        c={c}
                        tree={data.tree}
                        titles={titles}
                        onTitles={(t) => setTitles((x) => ({ ...x, ...t }))}
                        onChange={(next) => setCond(i, next)}
                        onRemove={builder.conditions.length > 1 ? () => setBuilder({ ...builder, conditions: builder.conditions.filter((_, j) => j !== i) }) : undefined}
                      />
                    </li>
                  ))}
                </ul>
                <AButton size="sm" variant="outline" disabled={builder.conditions.length >= 12} onClick={() => setBuilder({ ...builder, conditions: [...builder.conditions, defaultCondition("category", data.tree)] })}>
                  <AIcon icon={Add01Icon} /> Add condition
                </AButton>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Preview">
            {!builder ? (
              <p className="text-sm text-muted-foreground">Preview appears when the rule is edited here.</p>
            ) : !preview ? (
              <p className="text-sm text-muted-foreground">Checking…</p>
            ) : "error" in preview ? (
              <p className="text-sm text-red-600 dark:text-red-400">{preview.error}</p>
            ) : (
              <div className="space-y-3">
                <p className="text-2xl font-semibold">
                  {preview.count} <span className="text-sm font-normal text-muted-foreground">live product{preview.count === 1 ? "" : "s"} match</span>
                </p>
                <ul className="space-y-2">
                  {preview.sample.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <Thumb image={p.image} className="h-9 w-7" />
                      <span className="truncate">{p.title}</span>
                    </li>
                  ))}
                </ul>
                {preview.count === 0 ? <p className="text-xs text-muted-foreground">An empty collection shows “No products” on the store.</p> : null}
              </div>
            )}
          </Card>
          {initial?.usedBy.length ? (
            <Card title="Linked from">
              <ul className="space-y-1 text-sm text-muted-foreground">
                {initial.usedBy.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </Card>
          ) : null}
          {canEdit ? (
            <div className="flex gap-2">
              <AButton variant="outline" className="flex-1" disabled={saving} onClick={onCancel}>
                Cancel
              </AButton>
              <AButton className="flex-1" disabled={saving} onClick={() => void submit()}>
                {saving ? "Saving…" : initial ? "Save" : "Create"}
              </AButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Chips({ options, selected, onChange, label }: { options: { value: string; label: string }[]; selected: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
            className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ConditionRow({ c, tree, titles, onTitles, onChange, onRemove }: { c: Condition; tree: Tree[]; titles: Record<string, string>; onTitles: (t: Record<string, string>) => void; onChange: (c: Condition) => void; onRemove?: () => void }) {
  const amountUnit = c.type === "maxPrice" ? "₹" : c.type === "minPercentOff" ? "%" : c.type === "newWithinDays" ? "days" : "";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ASelect label="Include or exclude" className="w-32" value={c.exclude ? "out" : "in"} onValueChange={(v) => onChange({ ...c, exclude: v === "out" || undefined })} options={[{ value: "in", label: "Include" }, { value: "out", label: "Exclude" }]} />
        <ASelect label="Condition" className="min-w-0 flex-1 sm:w-56 sm:flex-none" value={c.type} onValueChange={(v) => onChange({ ...defaultCondition(v as ConditionType, tree), exclude: c.exclude })} options={Object.entries(CONDITION_LABEL).map(([value, label]) => ({ value, label }))} />
        {onRemove ? <IconButton icon={Cancel01Icon} tone="danger" label="Remove condition" onClick={onRemove} /> : null}
      </div>
      {c.type === "category" ? (
        <Chips label="Categories" selected={c.values ?? []} onChange={(values) => onChange({ ...c, values })} options={tree.map((t) => ({ value: t.handle, label: t.title }))} />
      ) : c.type === "subcategory" ? (
        <Chips label="Sub-categories" selected={c.values ?? []} onChange={(values) => onChange({ ...c, values })} options={tree.flatMap((t) => t.subcategories.map((s) => ({ value: s.handle, label: `${t.title} › ${s.title}` })))} />
      ) : c.type === "attribute" ? (
        <div className="space-y-2">
          <ASelect label="Attribute" value={c.key ?? "fit"} onValueChange={(key) => onChange({ ...c, key, values: [] })} options={Object.keys(ATTRIBUTE_VALUES).map((k) => ({ value: k, label: FILTER_LABELS[k as keyof typeof FILTER_LABELS] ?? k }))} />
          <Chips label="Values" selected={c.values ?? []} onChange={(values) => onChange({ ...c, values })} options={Object.entries(ATTRIBUTE_VALUES[(c.key ?? "fit") as keyof typeof ATTRIBUTE_VALUES]).map(([value, label]) => ({ value, label }))} />
        </div>
      ) : c.type === "badge" ? (
        <ASelect label="Badge" value={c.value ?? "NEW"} onValueChange={(value) => onChange({ ...c, value })} options={[{ value: "NEW", label: "NEW" }, { value: "BESTSELLER", label: "BESTSELLER" }]} />
      ) : c.type === "sizeInStock" ? (
        <ASelect label="Size" value={c.value ?? "XL"} onValueChange={(value) => onChange({ ...c, value })} options={SIZE_ORDER.map((s) => ({ value: s, label: s }))} />
      ) : c.type === "productIds" ? (
        <ProductPicker ids={c.values ?? []} titles={titles} onTitles={onTitles} onChange={(values) => onChange({ ...c, values })} />
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <AInput
            aria-label={CONDITION_LABEL[c.type]}
            inputMode="numeric"
            className="w-32"
            value={c.amount === undefined ? "" : String(c.type === "maxPrice" ? c.amount / 100 : c.amount)}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^\d]/g, ""));
              onChange({ ...c, amount: c.type === "maxPrice" ? n * 100 : n });
            }}
          />
          <span className="text-muted-foreground">{amountUnit}</span>
        </label>
      )}
    </div>
  );
}

function ProductPicker({ ids, titles, onTitles, onChange }: { ids: string[]; titles: Record<string, string>; onTitles: (t: Record<string, string>) => void; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; title: string; sku: string; status: string }[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      adminApi<{ products: { id: string; title: string; sku: string; status: string }[] }>(`/api/admin/collections?products=${encodeURIComponent(q.trim())}`)
        .then((r) => setResults(r.products))
        .catch(() => setResults([]));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="space-y-2">
      {ids.length ? (
        <ul className="space-y-1">
          {ids.map((id) => (
            <li key={id} className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1 text-sm">
              <span className="truncate">{titles[id] ?? id}</span>
              <IconButton icon={Cancel01Icon} label={`Remove ${titles[id] ?? id}`} onClick={() => onChange(ids.filter((x) => x !== id))} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No products picked yet.</p>
      )}
      <AInput aria-label="Search products to add" placeholder="Search by name or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && results ? (
        results.length === 0 ? (
          <p className="text-xs text-muted-foreground">No products match.</p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {results.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {r.title} <span className="text-xs text-muted-foreground">· {r.sku}{r.status !== "active" ? ` · ${r.status}` : ""}</span>
                </span>
                <AButton
                  size="sm"
                  variant="outline"
                  disabled={ids.includes(r.id) || ids.length >= 200}
                  onClick={() => {
                    onTitles({ [r.id]: r.title });
                    onChange([...ids, r.id]);
                  }}
                >
                  {ids.includes(r.id) ? "Added" : "Add"}
                </AButton>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
