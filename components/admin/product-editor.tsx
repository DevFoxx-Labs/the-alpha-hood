"use client";

import { Add01Icon, ArrowLeft01Icon, ArrowRight01Icon, Delete02Icon, ImageUpload01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GarmentArt } from "@/components/store/garment-art";
import { ATTRIBUTE_VALUES, COLOUR_FAMILIES, SIZE_ORDER } from "@/lib/catalog/attributes";
import { GARMENT_KINDS, SIZE_CHARTS } from "@/lib/catalog/product-options";
import type { GarmentKind } from "@/lib/commerce/types";
import { formatINR } from "@/lib/format";
import { adminApi, notify } from "./admin-shell";
import { AButton, AIcon, AInput, ALabel, ASelect, ATextarea, Card, Confirm, ErrorState, PageHeader, StatusBadge } from "./ui";

/**
 * ADM-01 product editor (own backend). The form only collects choices; the server validates every field
 * (lib/catalog/admin.ts) and computes nothing from the client except what the editor typed. Prices are typed in
 * rupees and sent as integer paise. Stock is set once per size on creation; later changes go through Inventory
 * (audited, never below zero).
 */
interface TreeNode {
  handle: string;
  title: string;
  subcategories: { handle: string; title: string }[];
}
interface Options {
  tree: TreeNode[];
  styles: { id: string; title: string }[];
}
interface Record {
  id: string;
  handle: string;
  title: string;
  sku: string;
  category: string;
  subcategory?: string;
  price: number;
  mrp: number;
  badge?: "NEW" | "BESTSELLER";
  colour: { name: string; hex: string };
  colourFamily: string;
  styleId: string;
  sizes: { label: string; stock: number }[];
  images: { art: GarmentKind; url?: string; alt: string }[];
  attributes: { [k: string]: string | undefined };
  tags: string[];
  description: string;
  specs: { label: string; value: string }[];
  sizeChart: string;
  model?: { height: string; size: string };
  legal: { manufacturer: string; packer?: string; importer?: string; countryOfOrigin: string; netQuantity: string };
  status: "draft" | "active" | "archived";
  version: number;
}

const NONE = "__none";
const blank = {
  title: "",
  handle: "",
  sku: "",
  category: "",
  subcategory: NONE,
  price: "",
  mrp: "",
  badge: NONE,
  colourName: "",
  colourHex: "#1b1b1b",
  colourFamily: "black",
  styleId: NONE,
  sizes: [{ label: "M", stock: "0" }] as { label: string; stock: string }[],
  art: "tee" as GarmentKind,
  attributes: {} as { [k: string]: string },
  tags: "",
  description: "",
  specs: [] as { label: string; value: string }[],
  sizeChart: "tops",
  modelHeight: "",
  modelSize: "",
  manufacturer: "",
  packer: "",
  importer: "",
  countryOfOrigin: "India",
  netQuantity: "1 N (one piece)",
  status: "draft" as Record["status"],
  photos: [] as { id: string; alt: string }[],
};
type Form = typeof blank;

function fromRecord(r: Record): Form {
  return {
    title: r.title,
    handle: r.handle,
    sku: r.sku,
    category: r.category,
    subcategory: r.subcategory ?? NONE,
    price: String(r.price / 100),
    mrp: String(r.mrp / 100),
    badge: r.badge ?? NONE,
    colourName: r.colour.name,
    colourHex: r.colour.hex,
    colourFamily: r.colourFamily,
    styleId: r.styleId,
    sizes: r.sizes.map((s) => ({ label: s.label, stock: String(s.stock) })),
    art: r.images[0]?.art ?? "tee",
    attributes: Object.fromEntries(Object.entries(r.attributes).filter(([, v]) => !!v)) as { [k: string]: string },
    tags: r.tags.join(", "),
    description: r.description,
    specs: r.specs,
    sizeChart: r.sizeChart,
    modelHeight: r.model?.height ?? "",
    modelSize: r.model?.size ?? "",
    manufacturer: r.legal.manufacturer,
    packer: r.legal.packer ?? "",
    importer: r.legal.importer ?? "",
    countryOfOrigin: r.legal.countryOfOrigin,
    netQuantity: r.legal.netQuantity,
    status: r.status,
    photos: r.images.filter((i) => i.url?.startsWith("/api/media/")).map((i) => ({ id: i.url!.slice("/api/media/".length), alt: i.alt })),
  };
}

const paise = (rupees: string) => Math.round(Number(rupees) * 100);

function toBody(f: Form, status: Form["status"], isNew: boolean) {
  return {
    title: f.title,
    handle: f.handle || undefined,
    sku: f.sku,
    category: f.category,
    subcategory: f.subcategory === NONE ? undefined : f.subcategory,
    price: paise(f.price),
    mrp: paise(f.mrp),
    badge: f.badge === NONE ? undefined : f.badge,
    colour: { name: f.colourName, hex: f.colourHex },
    colourFamily: f.colourFamily,
    // The style is chosen only when creating (adding a colour to an existing style); it can't move later.
    styleId: isNew && f.styleId !== NONE ? f.styleId : undefined,
    sizes: f.sizes.map((s) => ({ label: s.label, stock: Number(s.stock) || 0 })),
    art: f.art,
    attributes: f.attributes,
    tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
    description: f.description,
    specs: f.specs.filter((s) => s.label.trim() && s.value.trim()),
    sizeChart: f.sizeChart,
    model: f.modelHeight && f.modelSize ? { height: f.modelHeight, size: f.modelSize } : undefined,
    legal: { manufacturer: f.manufacturer, packer: f.packer || undefined, importer: f.importer || undefined, countryOfOrigin: f.countryOfOrigin, netQuantity: f.netQuantity },
    status,
    photos: f.photos,
  };
}

function Field({ id, label, help, children }: { id: string; label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <ALabel htmlFor={id}>{label}</ALabel>
      {children}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

const STATUS_TONE = { draft: "warning", active: "success", archived: "neutral" } as const;

export function ProductEditorScreen({ id }: { id?: string }) {
  const router = useRouter();
  const isNew = !id;
  const [options, setOptions] = useState<Options | null>(null);
  const [editable, setEditable] = useState<boolean | null>(null);
  const [record, setRecord] = useState<Record | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await adminApi<{ editable: boolean; options: Options | null }>("/api/admin/catalog?view=options");
        if (cancelled) return;
        setEditable(list.editable);
        setOptions(list.options);
        if (id && list.editable) {
          const { product } = await adminApi<{ product: Record }>(`/api/admin/catalog/${id}`);
          if (cancelled) return;
          setRecord(product);
          setForm(fromRecord(product));
        } else if (list.options?.tree[0]) {
          setForm((f) => ({ ...f, category: f.category || list.options!.tree[0].handle }));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(status: Form["status"]) {
    setSaving(true);
    try {
      if (isNew) {
        const { product } = await adminApi<{ product: Record }>("/api/admin/catalog", { method: "POST", body: toBody(form, status, true) });
        notify("success", status === "active" ? "Product published" : "Draft saved");
        router.replace(`/admin/catalog/${product.id}`);
      } else {
        const { product } = await adminApi<{ product: Record }>(`/api/admin/catalog/${id}`, { method: "PATCH", body: { ...toBody(form, status, false), version: record!.version } });
        setRecord(product);
        setForm(fromRecord(product));
        notify("success", status === "archived" ? "Product archived" : status === "active" ? "Saved and live" : "Saved");
      }
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => router.refresh()} />;
  if (editable === null || (id && editable && !record)) return <div className="h-96 animate-pulse rounded-xl border border-border bg-card" aria-busy="true" />;
  if (!editable) {
    return (
      <div className="space-y-5">
        <PageHeader back title="Products are read-only here" description="This store's catalogue is managed in its commerce platform. Product editing is available on the own backend (COMMERCE_PROVIDER=own)." />
      </div>
    );
  }

  const tree = options?.tree ?? [];
  const cat = tree.find((c) => c.handle === form.category);
  const price = paise(form.price);
  const mrp = paise(form.mrp);
  const off = price > 0 && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const status = record?.status ?? "draft";
  const usedSizes = new Set(form.sizes.map((s) => s.label));

  return (
    <div className="space-y-5">
      <PageHeader
        back
        title={isNew ? "New product" : form.title || "Product"}
        description={isNew ? "Create a product. Save as a draft first; publish when the details are complete." : `SKU ${record!.sku} · version ${record!.version}`}
        action={!isNew ? <StatusBadge status={status} tone={STATUS_TONE[status]} label={status} /> : undefined}
      />
      <form
        className="grid gap-6 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save(isNew ? "draft" : form.status);
        }}
      >
        <div className="space-y-6 lg:col-span-2">
          <Card title="Basics">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field id="p-title" label="Title" help='Style name — colour, e.g. "Linen Shirt — Sand".'>
                  <AInput id="p-title" value={form.title} maxLength={120} onChange={(e) => set("title", e.target.value)} required />
                </Field>
              </div>
              <Field id="p-handle" label="URL handle" help="Leave empty to make one from the title.">
                <AInput id="p-handle" value={form.handle} maxLength={120} onChange={(e) => set("handle", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="linen-shirt-sand" />
              </Field>
              <Field id="p-sku" label="SKU">
                <AInput id="p-sku" value={form.sku} maxLength={40} onChange={(e) => set("sku", e.target.value.toUpperCase())} required placeholder="AH-SHI-001-SND" />
              </Field>
              <Field id="p-cat" label="Category">
                <ASelect label="Category" className="w-full" value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v, subcategory: NONE }))} options={tree.map((c) => ({ value: c.handle, label: c.title }))} />
              </Field>
              <Field id="p-sub" label="Sub-category">
                <ASelect label="Sub-category" className="w-full" value={form.subcategory} onValueChange={(v) => set("subcategory", v)} options={[{ value: NONE, label: "None" }, ...(cat?.subcategories ?? []).map((s) => ({ value: s.handle, label: s.title }))]} />
              </Field>
              {isNew ? (
                <div className="sm:col-span-2">
                  <Field id="p-style" label="Colour of an existing style" help="Pick a style to add this as another colour of it (shared swatches and reviews). Can't be changed later.">
                    <ASelect label="Style" className="w-full" value={form.styleId} onValueChange={(v) => set("styleId", v)} options={[{ value: NONE, label: "New style" }, ...(options?.styles ?? []).map((s) => ({ value: s.id, label: s.title }))]} />
                  </Field>
                </div>
              ) : null}
            </div>
          </Card>

          <Card title="Price">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="p-price" label="Selling price (₹)">
                <AInput id="p-price" inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value.replace(/[^0-9.]/g, ""))} required />
              </Field>
              <Field id="p-mrp" label="MRP (₹)" help="Incl. all taxes (Legal Metrology).">
                <AInput id="p-mrp" inputMode="decimal" value={form.mrp} onChange={(e) => set("mrp", e.target.value.replace(/[^0-9.]/g, ""))} required />
              </Field>
              <Field id="p-badge" label="Badge">
                <ASelect label="Badge" className="w-full" value={form.badge} onValueChange={(v) => set("badge", v)} options={[{ value: NONE, label: "None" }, { value: "NEW", label: "NEW" }, { value: "BESTSELLER", label: "BESTSELLER" }]} />
              </Field>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {price > 0 ? `Shoppers see ${formatINR(price)}${off ? ` · ${off}% off ${formatINR(mrp)}` : ""}.` : "Enter a price."}
              {price > mrp && mrp > 0 ? <span className="ml-1 text-destructive">The price can&apos;t be higher than the MRP.</span> : null}
            </p>
          </Card>

          <Card title="Photos">
            <PhotoManager photos={form.photos} title={form.title} onChange={(photos) => set("photos", photos)} />
          </Card>

          <Card title="Colour, picture and sizes">
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
              <Field id="p-colour" label="Colour name">
                <AInput id="p-colour" value={form.colourName} maxLength={40} onChange={(e) => set("colourName", e.target.value)} required />
              </Field>
              <Field id="p-family" label="Colour filter">
                <ASelect label="Colour filter" className="w-full" value={form.colourFamily} onValueChange={(v) => set("colourFamily", v)} options={Object.entries(COLOUR_FAMILIES).map(([k, v]) => ({ value: k, label: v.label }))} />
              </Field>
              <Field id="p-hex" label="Swatch">
                <AInput id="p-hex" type="color" className="w-16 p-1" value={form.colourHex} onChange={(e) => set("colourHex", e.target.value)} />
              </Field>
              <Field id="p-art" label="Placeholder drawing" help="Used until product photos are uploaded.">
                <ASelect label="Placeholder drawing" className="w-full" value={form.art} onValueChange={(v) => set("art", v as GarmentKind)} options={GARMENT_KINDS.map((k) => ({ value: k, label: k }))} />
              </Field>
              <Field id="p-chart" label="Size chart">
                <ASelect label="Size chart" className="w-full" value={form.sizeChart} onValueChange={(v) => set("sizeChart", v)} options={SIZE_CHARTS.map((k) => ({ value: k, label: k }))} />
              </Field>
              <GarmentArt image={{ art: form.art, colour: form.colourHex, alt: "" }} className="h-20 w-16 self-end rounded" />
            </div>
            <div className="mt-5 space-y-2">
              <p className="text-sm font-medium">Sizes {isNew ? "and opening stock" : ""}</p>
              {!isNew ? <p className="text-xs text-muted-foreground">Stock of existing sizes is changed in Inventory (counted and audited). New sizes start with the number you enter.</p> : null}
              {form.sizes.map((s, i) => (
                <div key={`${s.label}-${i}`} className="flex flex-wrap items-center gap-2">
                  <ASelect label={`Size ${i + 1}`} className="w-32" value={s.label} onValueChange={(v) => set("sizes", form.sizes.map((x, j) => (j === i ? { ...x, label: v } : x)))} options={SIZE_ORDER.filter((l) => l === s.label || !usedSizes.has(l)).map((l) => ({ value: l, label: l }))} />
                  <AInput aria-label={`Stock for ${s.label}`} className="w-24" inputMode="numeric" value={s.stock} disabled={!isNew && record!.sizes.some((r) => r.label === s.label)} onChange={(e) => set("sizes", form.sizes.map((x, j) => (j === i ? { ...x, stock: e.target.value.replace(/\D/g, "") } : x)))} />
                  <AButton type="button" size="icon" variant="ghost" aria-label={`Remove size ${s.label}`} disabled={form.sizes.length === 1} onClick={() => set("sizes", form.sizes.filter((_, j) => j !== i))}>
                    <AIcon icon={Delete02Icon} />
                  </AButton>
                </div>
              ))}
              <AButton type="button" size="sm" variant="outline" disabled={form.sizes.length >= 12} onClick={() => set("sizes", [...form.sizes, { label: SIZE_ORDER.find((l) => !usedSizes.has(l)) ?? "One size", stock: "0" }])}>
                <AIcon icon={Add01Icon} /> Add size
              </AButton>
            </div>
          </Card>

          <Card title="Details">
            <div className="space-y-4">
              <Field id="p-desc" label="Description" help="Plain text, 10–2000 characters.">
                <ATextarea id="p-desc" rows={5} maxLength={2000} value={form.description} onChange={(e) => set("description", e.target.value)} required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                {(Object.keys(ATTRIBUTE_VALUES) as (keyof typeof ATTRIBUTE_VALUES)[]).map((k) => (
                  <Field key={k} id={`p-a-${k}`} label={k[0].toUpperCase() + k.slice(1)}>
                    <ASelect
                      label={k}
                      className="w-full"
                      value={form.attributes[k] ?? NONE}
                      onValueChange={(v) => setForm((f) => ({ ...f, attributes: Object.fromEntries(Object.entries({ ...f.attributes, [k]: v }).filter(([, x]) => x !== NONE)) }))}
                      options={[{ value: NONE, label: "—" }, ...Object.entries(ATTRIBUTE_VALUES[k]).map(([value, label]) => ({ value, label }))]}
                    />
                  </Field>
                ))}
              </div>
              <Field id="p-tags" label="Search tags" help="Comma separated, e.g. flannel, plaid (max 12).">
                <AInput id="p-tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} />
              </Field>
              <div className="space-y-2">
                <p className="text-sm font-medium">Specifications</p>
                {form.specs.map((s, i) => (
                  <div key={i} className="flex flex-wrap gap-2">
                    <AInput aria-label="Specification name" className="w-40" maxLength={40} value={s.label} onChange={(e) => set("specs", form.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Collar" />
                    <AInput aria-label="Specification value" className="min-w-40 flex-1" maxLength={120} value={s.value} onChange={(e) => set("specs", form.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Spread" />
                    <AButton type="button" size="icon" variant="ghost" aria-label="Remove specification" onClick={() => set("specs", form.specs.filter((_, j) => j !== i))}>
                      <AIcon icon={Delete02Icon} />
                    </AButton>
                  </div>
                ))}
                <AButton type="button" size="sm" variant="outline" disabled={form.specs.length >= 12} onClick={() => set("specs", [...form.specs, { label: "", value: "" }])}>
                  <AIcon icon={Add01Icon} /> Add row
                </AButton>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="p-mh" label="Model height (optional)">
                  <AInput id="p-mh" maxLength={12} value={form.modelHeight} onChange={(e) => set("modelHeight", e.target.value)} placeholder={`6'0"`} />
                </Field>
                <Field id="p-ms" label="Model wears size">
                  <AInput id="p-ms" maxLength={12} value={form.modelSize} onChange={(e) => set("modelSize", e.target.value)} placeholder="M" />
                </Field>
              </div>
            </div>
          </Card>

          <Card title="Legal declarations (Legal Metrology)">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field id="p-mfr" label="Manufacturer name and address">
                  <ATextarea id="p-mfr" rows={2} maxLength={300} value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} required />
                </Field>
              </div>
              <Field id="p-packer" label="Packer (optional)">
                <AInput id="p-packer" maxLength={300} value={form.packer} onChange={(e) => set("packer", e.target.value)} />
              </Field>
              <Field id="p-imp" label="Importer (optional)">
                <AInput id="p-imp" maxLength={300} value={form.importer} onChange={(e) => set("importer", e.target.value)} />
              </Field>
              <Field id="p-coo" label="Country of origin">
                <AInput id="p-coo" maxLength={60} value={form.countryOfOrigin} onChange={(e) => set("countryOfOrigin", e.target.value)} required />
              </Field>
              <Field id="p-net" label="Net quantity">
                <AInput id="p-net" maxLength={60} value={form.netQuantity} onChange={(e) => set("netQuantity", e.target.value)} required />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Publishing">
            <div className="space-y-3">
              {!isNew ? (
                <Field id="p-status" label="Status" help="Drafts and archived products are hidden from the store.">
                  <ASelect label="Status" className="w-full" value={form.status} onValueChange={(v) => set("status", v as Form["status"])} options={[{ value: "draft", label: "Draft" }, { value: "active", label: "Active (live)" }, { value: "archived", label: "Archived" }]} />
                </Field>
              ) : null}
              <AButton type="submit" className="w-full" loading={saving}>
                {isNew ? "Save draft" : "Save changes"}
              </AButton>
              {isNew ? (
                <AButton type="button" variant="outline" className="w-full" disabled={saving} onClick={() => void save("active")}>
                  Save and publish
                </AButton>
              ) : null}
              {!isNew && record!.status === "active" ? (
                <AButton asChild variant="ghost" className="w-full">
                  <Link href={`/products/${record!.handle}`} target="_blank">
                    View in store
                  </Link>
                </AButton>
              ) : null}
            </div>
          </Card>
          {!isNew && record!.status !== "archived" ? (
            <div className="rounded-xl border border-destructive/30 bg-card p-4 sm:p-6">
              <p className="text-sm font-semibold">Archive product</p>
              <p className="mt-1 text-xs text-muted-foreground">Removes it from the store. Orders, returns and reports keep their history. You can restore it later.</p>
              <Confirm
                trigger={
                  <AButton type="button" variant="destructive" size="sm" className="mt-3" disabled={saving}>
                    Archive
                  </AButton>
                }
                title="Archive this product?"
                description="It disappears from the store straight away. Nothing is deleted."
                confirmLabel="Archive"
                destructive
                onConfirm={() => save("archived")}
              />
            </div>
          ) : null}
        </div>
      </form>
    </div>
  );
}

/** /admin/catalog/[id] — the id comes from the URL (client side, like the other admin detail screens). */
export function ProductEditorRoute() {
  const { id } = useParams<{ id: string }>();
  return <ProductEditorScreen id={id} />;
}

/**
 * Product photos: upload (JPEG / PNG, ≤ 8 MB, 600–6000 px — checked again on the server), reorder, describe and
 * remove. The first photo is the one on product cards and the product page's main image. Every photo needs a
 * description (alt text) for screen readers and image search.
 */
function PhotoManager({ photos, title, onChange }: { photos: { id: string; alt: string }[]; title: string; onChange: (p: { id: string; alt: string }[]) => void }) {
  const [busy, setBusy] = useState(false);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: { id: string; alt: string }[] = [];
    for (const file of Array.from(files).slice(0, 8 - photos.length)) {
      if (file.type !== "image/jpeg" && file.type !== "image/png") {
        notify("error", `${file.name}: use a JPEG or PNG photo.`);
        continue;
      }
      try {
        const res = await fetch("/api/admin/media", { method: "POST", headers: { "Content-Type": file.type }, body: file, cache: "no-store" });
        const data = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
        if (!res.ok || !data?.id) throw new Error(data?.error?.message ?? "Upload failed.");
        added.push({ id: data.id, alt: title ? `${title}, photo ${photos.length + added.length + 1}` : "" });
      } catch (e) {
        notify("error", `${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    if (added.length) {
      onChange([...photos, ...added]);
      notify("success", added.length === 1 ? "Photo uploaded — save the product to use it" : `${added.length} photos uploaded — save the product to use them`);
    }
    setBusy(false);
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...photos];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">JPEG or PNG, at least 600 × 600 px, up to 8 MB, max 8 photos. The first photo leads on cards and the product page. Without photos the placeholder drawing is shown.</p>
      {photos.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.id} className="space-y-1.5">
              <GarmentArt image={{ art: "tee", colour: "#e5e5e5", alt: p.alt, url: `/api/media/${p.id}` }} sizes="160px" className="aspect-[4/5] w-full rounded-md" />
              <AInput aria-label={`Description of photo ${i + 1}`} maxLength={140} value={p.alt} placeholder="Describe the photo" onChange={(e) => onChange(photos.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />
              <div className="flex justify-between">
                <AButton type="button" size="icon" variant="ghost" aria-label={`Move photo ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <AIcon icon={ArrowLeft01Icon} />
                </AButton>
                <AButton type="button" size="icon" variant="ghost" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(photos.filter((_, j) => j !== i))}>
                  <AIcon icon={Delete02Icon} />
                </AButton>
                <AButton type="button" size="icon" variant="ghost" aria-label={`Move photo ${i + 1} later`} disabled={i === photos.length - 1} onClick={() => move(i, 1)}>
                  <AIcon icon={ArrowRight01Icon} />
                </AButton>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent ${busy || photos.length >= 8 ? "pointer-events-none opacity-50" : ""}`}>
        <AIcon icon={ImageUpload01Icon} />
        {busy ? "Uploading…" : "Upload photos"}
        <input type="file" accept="image/jpeg,image/png" multiple className="sr-only" disabled={busy || photos.length >= 8} onChange={(e) => void upload(e.target.files).finally(() => (e.target.value = ""))} />
      </label>
    </div>
  );
}
