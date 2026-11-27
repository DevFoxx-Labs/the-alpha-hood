"use client";

import { Add01Icon, ArrowLeft01Icon, ArrowRight01Icon, Copy01Icon, Delete02Icon, ImageUpload01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GarmentArt } from "@/components/store/garment-art";
import { ATTRIBUTE_VALUES, COLOUR_FAMILIES, SIZE_ORDER } from "@/lib/catalog/attributes";
import { GARMENT_KINDS, SIZE_CHARTS } from "@/lib/catalog/product-options";
import type { GarmentKind } from "@/lib/commerce/types";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { adminApi, notify, useAdmin } from "./admin-shell";
import { type Demand, type HoldColour, SoldOutHold } from "./sold-out-hold";
import { AButton, AIcon, AInput, ALabel, ASelect, ATextarea, Card, ErrorState, PageHeader, StatusBadge } from "./ui";

/**
 * ADM-01 style editor: one product with its colours (each with its own web address, photos, price and status) and
 * each colour's sizes (own SKU, barcode and opening stock). The form only collects choices: the server
 * (lib/catalog/style.ts) validates every field, writes all colours in one transaction and refuses stale saves.
 * Prices are typed in rupees and sent as integer paise. Stock of saved sizes changes only in Inventory (audited).
 */

const NONE = "__none";
const GST_CLASS_LABEL: Record<string, string> = { apparel: "Apparel", footwear: "Footwear", eyewear: "Eyewear", headwear: "Headwear" };
type Status = "draft" | "active" | "archived";
const STATUS_TONE = { draft: "warning", active: "success", archived: "neutral" } as const;

interface TreeNode {
  handle: string;
  title: string;
  subcategories: { handle: string; title: string }[];
}

interface SizeForm {
  label: string;
  sku: string;
  barcode: string;
  stock: string;
  /** Saved sizes keep their live stock (changed in Inventory). */
  saved: boolean;
}

/** An uploaded photo; `view` tags an on-hanger cutout for the collection rail turn (PLP-08). */
type PhotoView = "front" | "back" | "side";
interface Photo {
  id: string;
  alt: string;
  view?: PhotoView;
}
const PHOTO_VIEW_OPTIONS = [
  { value: NONE, label: "Gallery photo" },
  { value: "front", label: "Hanger · front" },
  { value: "back", label: "Hanger · back" },
  { value: "side", label: "Hanger · side" },
];

interface VariantForm {
  key: string;
  id?: string;
  version?: number;
  savedStatus?: Status;
  savedHandle?: string;
  name: string;
  hex: string;
  family: string;
  status: Status;
  handle: string;
  sku: string;
  price: string;
  mrp: string;
  cost: string;
  badge: string;
  sizes: SizeForm[];
  photos: Photo[];
  seoTitle: string;
  seoDescription: string;
}

interface SharedForm {
  baseTitle: string;
  category: string;
  subcategory: string;
  art: GarmentKind;
  attributes: { [k: string]: string };
  tags: string;
  description: string;
  specs: { label: string; value: string }[];
  sizeChart: string;
  modelHeight: string;
  modelSize: string;
  manufacturer: string;
  packer: string;
  importer: string;
  countryOfOrigin: string;
  netQuantity: string;
  gstClass: string;
  hsn: string;
  weight: string;
  length: string;
  width: string;
  height: string;
}

interface StyleView {
  styleId: string;
  baseTitle: string;
  shared: {
    category: string;
    subcategory?: string;
    art: string;
    attributes: { [k: string]: string | undefined };
    tags: string[];
    description: string;
    specs: { label: string; value: string }[];
    sizeChart: string;
    model?: { height: string; size: string };
    legal: { manufacturer: string; packer?: string; importer?: string; countryOfOrigin: string; netQuantity: string };
    gstClass?: string;
    hsn?: string;
    weightGrams?: number;
    dimensionsCm?: { length: number; width: number; height: number };
  };
  variants: {
    id: string;
    version: number;
    status: Status;
    soldOutHold: boolean;
    handle: string;
    sku: string;
    colour: { name: string; hex: string };
    colourFamily: string;
    price: number;
    mrp: number;
    costPrice?: number;
    badge?: string;
    sizes: { label: string; sku?: string; barcode?: string; stock: number }[];
    photos: Photo[];
    seo?: { title?: string; description?: string };
  }[];
}

const blankShared: SharedForm = {
  baseTitle: "",
  category: "",
  subcategory: NONE,
  art: "tee",
  attributes: {},
  tags: "",
  description: "",
  specs: [],
  sizeChart: "tops",
  modelHeight: "",
  modelSize: "",
  manufacturer: "",
  packer: "",
  importer: "",
  countryOfOrigin: "India",
  netQuantity: "1 N (one piece)",
  gstClass: NONE,
  hsn: "",
  weight: "",
  length: "",
  width: "",
  height: "",
};

let keySeq = 0;
const newKey = () => `v${++keySeq}`;

const blankVariant = (sizes?: SizeForm[]): VariantForm => ({
  key: newKey(),
  name: "",
  hex: "#1b1b1b",
  family: "black",
  status: "draft",
  handle: "",
  sku: "",
  price: "",
  mrp: "",
  cost: "",
  badge: NONE,
  sizes: sizes ?? ["S", "M", "L", "XL"].map((label) => ({ label, sku: "", barcode: "", stock: "0", saved: false })),
  photos: [],
  seoTitle: "",
  seoDescription: "",
});

const rupees = (paise?: number) => (paise === undefined ? "" : String(paise / 100));
const toPaise = (r: string) => Math.round(Number(r) * 100);
const intOrUndefined = (v: string) => (v.trim() === "" ? undefined : Number(v));
const skuPart = (label: string) => (label === "One size" ? "OS" : label.replace(/[^A-Z0-9]/gi, "").toUpperCase());

function sharedFrom(v: StyleView): SharedForm {
  const s = v.shared;
  return {
    baseTitle: v.baseTitle,
    category: s.category,
    subcategory: s.subcategory ?? NONE,
    art: s.art as GarmentKind,
    attributes: Object.fromEntries(Object.entries(s.attributes).filter(([, x]) => !!x)) as { [k: string]: string },
    tags: s.tags.join(", "),
    description: s.description,
    specs: s.specs,
    sizeChart: s.sizeChart,
    modelHeight: s.model?.height ?? "",
    modelSize: s.model?.size ?? "",
    manufacturer: s.legal.manufacturer,
    packer: s.legal.packer ?? "",
    importer: s.legal.importer ?? "",
    countryOfOrigin: s.legal.countryOfOrigin,
    netQuantity: s.legal.netQuantity,
    gstClass: s.gstClass ?? NONE,
    hsn: s.hsn ?? "",
    weight: s.weightGrams ? String(s.weightGrams) : "",
    length: s.dimensionsCm ? String(s.dimensionsCm.length) : "",
    width: s.dimensionsCm ? String(s.dimensionsCm.width) : "",
    height: s.dimensionsCm ? String(s.dimensionsCm.height) : "",
  };
}

function variantsFrom(v: StyleView, asCopy: boolean): VariantForm[] {
  return v.variants.map((x) => ({
    key: newKey(),
    ...(asCopy ? {} : { id: x.id, version: x.version, savedStatus: x.status, savedHandle: x.handle }),
    name: x.colour.name,
    hex: x.colour.hex,
    family: x.colourFamily,
    // A copy starts as a draft with new codes and addresses; photos are kept (they can be shared).
    status: asCopy ? "draft" : x.status,
    handle: asCopy ? "" : x.handle,
    sku: asCopy ? "" : x.sku,
    price: rupees(x.price),
    mrp: rupees(x.mrp),
    cost: rupees(x.costPrice),
    badge: x.badge ?? NONE,
    sizes: x.sizes.map((s) => ({ label: s.label, sku: asCopy ? "" : (s.sku ?? ""), barcode: asCopy ? "" : (s.barcode ?? ""), stock: asCopy ? "0" : String(s.stock), saved: !asCopy })),
    photos: x.photos,
    seoTitle: asCopy ? "" : (x.seo?.title ?? ""),
    seoDescription: asCopy ? "" : (x.seo?.description ?? ""),
  }));
}

function toBody(s: SharedForm, variants: VariantForm[]) {
  const dims = [s.length, s.width, s.height].every((x) => x.trim() !== "") ? { length: Number(s.length), width: Number(s.width), height: Number(s.height) } : undefined;
  return {
    baseTitle: s.baseTitle,
    category: s.category,
    subcategory: s.subcategory === NONE ? undefined : s.subcategory,
    art: s.art,
    attributes: s.attributes,
    tags: s.tags.split(",").map((t) => t.trim()).filter(Boolean),
    description: s.description,
    specs: s.specs.filter((x) => x.label.trim() && x.value.trim()),
    sizeChart: s.sizeChart,
    model: s.modelHeight && s.modelSize ? { height: s.modelHeight, size: s.modelSize } : undefined,
    legal: { manufacturer: s.manufacturer, packer: s.packer || undefined, importer: s.importer || undefined, countryOfOrigin: s.countryOfOrigin, netQuantity: s.netQuantity },
    gstClass: s.gstClass === NONE ? undefined : s.gstClass,
    hsn: s.hsn || undefined,
    weightGrams: intOrUndefined(s.weight),
    dimensionsCm: dims,
    variants: variants.map((v) => ({
      ...(v.id ? { id: v.id, version: v.version } : {}),
      colour: { name: v.name, hex: v.hex },
      colourFamily: v.family,
      handle: v.handle || undefined,
      sku: v.sku,
      price: toPaise(v.price),
      mrp: toPaise(v.mrp),
      ...(v.cost.trim() !== "" ? { costPrice: toPaise(v.cost) } : {}),
      badge: v.badge === NONE ? undefined : v.badge,
      sizes: v.sizes.map((x) => ({ label: x.label, stock: Number(x.stock) || 0, sku: x.sku || undefined, barcode: x.barcode || undefined })),
      photos: v.photos,
      status: v.status,
      seo: v.seoTitle || v.seoDescription ? { title: v.seoTitle || undefined, description: v.seoDescription || undefined } : undefined,
    })),
  };
}

function Field({ id, label, help, children, className }: { id: string; label: string; help?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <ALabel htmlFor={id}>{label}</ALabel>
      {children}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

const money = (v: string) => v.replace(/[^0-9.]/g, "");
const digits = (v: string) => v.replace(/\D/g, "");

/** /admin/catalog/new (optionally ?from=<styleId> to duplicate) and /admin/catalog/style/[styleId]. */
export function StyleEditorRoute() {
  const { styleId } = useParams<{ styleId?: string }>();
  const from = useSearchParams().get("from");
  return <StyleEditor key={styleId ?? `new:${from ?? ""}`} styleId={styleId} copyFrom={styleId ? undefined : (from ?? undefined)} />;
}

function StyleEditor({ styleId, copyFrom }: { styleId?: string; copyFrom?: string }) {
  const router = useRouter();
  const { can } = useAdmin();
  const canEdit = can("catalog.write");
  const isNew = !styleId;
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [editable, setEditable] = useState<boolean | null>(null);
  const [shared, setShared] = useState<SharedForm>(blankShared);
  const [variants, setVariants] = useState<VariantForm[]>(() => [blankVariant()]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [nonce, setNonce] = useState(0);
  /** "Show as sold out" per saved colour + its Notify me sign-ups (null = new product / a copy). */
  const [hold, setHold] = useState<HoldColour[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const opts = await adminApi<{ editable: boolean; options: { tree: TreeNode[] } | null }>("/api/admin/catalog?view=options");
        if (cancelled) return;
        setEditable(opts.editable);
        setTree(opts.options?.tree ?? []);
        const source = styleId ?? copyFrom;
        if (source && opts.editable) {
          const { style, demand } = await adminApi<{ style: StyleView; demand: Record<string, Demand> | null }>(`/api/admin/styles/${source}`);
          if (cancelled) return;
          setHold(copyFrom ? null : style.variants.map((x) => ({ id: x.id, colour: x.colour.name, status: x.status, soldOutHold: x.soldOutHold, demand: demand?.[x.id] ?? null })));
          setShared({ ...sharedFrom(style), ...(copyFrom ? { baseTitle: `${style.baseTitle} (copy)` } : {}) });
          setVariants(variantsFrom(style, !!copyFrom));
          setActive((a) => Math.min(a, style.variants.length - 1));
        } else if (opts.options?.tree[0]) {
          setShared((s) => ({ ...s, category: s.category || opts.options!.tree[0].handle }));
        }
        setDirty(!!copyFrom);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [styleId, copyFrom, nonce]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setS = <K extends keyof SharedForm>(k: K, v: SharedForm[K]) => (setShared((f) => ({ ...f, [k]: v })), setDirty(true));
  const setV = (i: number, patch: Partial<VariantForm>) => (setVariants((list) => list.map((v, j) => (j === i ? { ...v, ...patch } : v))), setDirty(true));

  async function save(publishAll = false) {
    setSaving(true);
    try {
      const list = publishAll ? variants.map((v) => (v.status === "draft" ? { ...v, status: "active" as Status } : v)) : variants;
      const body = toBody(shared, list);
      if (isNew) {
        const { styleId: id } = await adminApi<{ styleId: string }>("/api/admin/styles", { method: "POST", body });
        notify("success", publishAll ? "Product published" : "Product saved as a draft");
        setDirty(false);
        router.replace(`/admin/catalog/style/${id}`);
      } else {
        await adminApi(`/api/admin/styles/${styleId}`, { method: "PUT", body });
        notify("success", "Saved — the store shows changes within a few seconds");
        setDirty(false);
        setNonce((n) => n + 1);
      }
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const cat = useMemo(() => tree?.find((c) => c.handle === shared.category), [tree, shared.category]);

  if (error) return <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />;
  if (editable === null || tree === null) return <div className="h-96 animate-pulse rounded-xl border border-border bg-card" aria-busy="true" />;
  if (!editable) {
    return <PageHeader back title="Products are read-only here" description="This store's catalogue is managed in its commerce platform. Editing is available on the own backend (COMMERCE_PROVIDER=own)." />;
  }

  const v = variants[active] ?? variants[0];
  const live = variants.filter((x) => x.savedStatus === "active");
  const drafts = variants.filter((x) => x.status === "draft").length;

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        back
        title={isNew ? (copyFrom ? "Duplicate product" : "New product") : shared.baseTitle || "Product"}
        description={
          isNew
            ? "A product has one or more colours; each colour has its own sizes, photos, price and web address."
            : `${variants.length} colour${variants.length === 1 ? "" : "s"} · ${live.length} live`
        }
        action={
          !isNew && canEdit ? (
            <AButton asChild variant="outline">
              <Link href={`/admin/catalog/new?from=${styleId}`}>
                <AIcon icon={Copy01Icon} /> Duplicate
              </Link>
            </AButton>
          ) : undefined
        }
      />

      <form
        className="grid gap-6 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canEdit) void save();
        }}
      >
        <fieldset disabled={!canEdit} className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Product">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="s-title" label="Product name" help='Without the colour, e.g. "Linen Shirt". Each colour page is titled "Linen Shirt — Sand".' className="sm:col-span-2">
                <AInput id="s-title" value={shared.baseTitle} maxLength={80} onChange={(e) => setS("baseTitle", e.target.value)} required />
              </Field>
              <Field id="s-cat" label="Category">
                <ASelect label="Category" className="w-full" value={shared.category} onValueChange={(x) => (setShared((f) => ({ ...f, category: x, subcategory: NONE })), setDirty(true))} options={tree.map((c) => ({ value: c.handle, label: c.title }))} />
              </Field>
              <Field id="s-sub" label="Sub-category">
                <ASelect label="Sub-category" className="w-full" value={shared.subcategory} onValueChange={(x) => setS("subcategory", x)} options={[{ value: NONE, label: "None" }, ...(cat?.subcategories ?? []).map((s) => ({ value: s.handle, label: s.title }))]} />
              </Field>
              <Field id="s-desc" label="Description" help="Plain text, 10–2000 characters. Shared by every colour." className="sm:col-span-2">
                <ATextarea id="s-desc" rows={5} maxLength={2000} value={shared.description} onChange={(e) => setS("description", e.target.value)} required />
              </Field>
              <Field id="s-chart" label="Size chart">
                <ASelect label="Size chart" className="w-full" value={shared.sizeChart} onValueChange={(x) => setS("sizeChart", x)} options={SIZE_CHARTS.map((k) => ({ value: k, label: k }))} />
              </Field>
              <Field id="s-art" label="Placeholder drawing" help="Shown until a colour has photos.">
                <ASelect label="Placeholder drawing" className="w-full" value={shared.art} onValueChange={(x) => setS("art", x as GarmentKind)} options={GARMENT_KINDS.map((k) => ({ value: k, label: k }))} />
              </Field>
            </div>
          </Card>

          <Card title="Colours and sizes">
            <div className="space-y-5">
              <div role="tablist" aria-label="Colours" className="flex flex-wrap gap-2">
                {variants.map((x, i) => (
                  <button
                    key={x.key}
                    type="button"
                    role="tab"
                    aria-selected={i === active}
                    onClick={() => setActive(i)}
                    className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors", i === active ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-accent")}
                  >
                    <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: x.hex }} aria-hidden />
                    {x.name || `Colour ${i + 1}`}
                    <span className={cn("h-1.5 w-1.5 rounded-full", x.status === "active" ? "bg-emerald-500" : x.status === "draft" ? "bg-amber-500" : "bg-slate-400")} aria-label={x.status} />
                  </button>
                ))}
                {canEdit ? (
                  <AButton
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={variants.length >= 12}
                    onClick={() => {
                      // A new colour starts with the same sizes as the current one (codes blank, no stock yet).
                      const sizes = v.sizes.map((s) => ({ label: s.label, sku: "", barcode: "", stock: "0", saved: false }));
                      setVariants((list) => [...list, { ...blankVariant(sizes), price: v.price, mrp: v.mrp, cost: v.cost }]);
                      setActive(variants.length);
                      setDirty(true);
                    }}
                  >
                    <AIcon icon={Add01Icon} /> Add colour
                  </AButton>
                ) : null}
              </div>

              <VariantPanel
                v={v}
                index={active}
                baseTitle={shared.baseTitle}
                art={shared.art}
                canSeeCost={canEdit}
                onChange={(patch) => setV(active, patch)}
                onRemove={
                  !v.id && variants.length > 1
                    ? () => {
                        setVariants((list) => list.filter((_, j) => j !== active));
                        setActive(Math.max(0, active - 1));
                        setDirty(true);
                      }
                    : undefined
                }
              />
            </div>
          </Card>

          <Card title="Filters and details">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {(Object.keys(ATTRIBUTE_VALUES) as (keyof typeof ATTRIBUTE_VALUES)[]).map((k) => (
                  <Field key={k} id={`s-a-${k}`} label={k[0].toUpperCase() + k.slice(1)}>
                    <ASelect
                      label={k}
                      className="w-full"
                      value={shared.attributes[k] ?? NONE}
                      onValueChange={(x) => setS("attributes", Object.fromEntries(Object.entries({ ...shared.attributes, [k]: x }).filter(([, y]) => y !== NONE)))}
                      options={[{ value: NONE, label: "—" }, ...Object.entries(ATTRIBUTE_VALUES[k]).map(([value, label]) => ({ value, label }))]}
                    />
                  </Field>
                ))}
              </div>
              <Field id="s-tags" label="Search tags" help="Comma separated, e.g. flannel, plaid (max 12).">
                <AInput id="s-tags" value={shared.tags} onChange={(e) => setS("tags", e.target.value)} />
              </Field>
              <div className="space-y-2">
                <p className="text-sm font-medium">Specifications</p>
                {shared.specs.map((s, i) => (
                  <div key={i} className="flex flex-wrap gap-2">
                    <AInput aria-label="Specification name" className="w-40" maxLength={40} value={s.label} onChange={(e) => setS("specs", shared.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Collar" />
                    <AInput aria-label="Specification value" className="min-w-40 flex-1" maxLength={120} value={s.value} onChange={(e) => setS("specs", shared.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Spread" />
                    <AButton type="button" size="icon" variant="ghost" aria-label="Remove specification" onClick={() => setS("specs", shared.specs.filter((_, j) => j !== i))}>
                      <AIcon icon={Delete02Icon} />
                    </AButton>
                  </div>
                ))}
                <AButton type="button" size="sm" variant="outline" disabled={shared.specs.length >= 12} onClick={() => setS("specs", [...shared.specs, { label: "", value: "" }])}>
                  <AIcon icon={Add01Icon} /> Add row
                </AButton>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="s-mh" label="Model height (optional)">
                  <AInput id="s-mh" maxLength={12} value={shared.modelHeight} onChange={(e) => setS("modelHeight", e.target.value)} placeholder={`6'0"`} />
                </Field>
                <Field id="s-ms" label="Model wears size">
                  <AInput id="s-ms" maxLength={12} value={shared.modelSize} onChange={(e) => setS("modelSize", e.target.value)} placeholder="M" />
                </Field>
              </div>
            </div>
          </Card>

          <Card title="Tax and shipping">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="s-gst" label="GST class" help="Sets the GST rate slabs. Auto = from the category.">
                <ASelect label="GST class" className="w-full" value={shared.gstClass} onValueChange={(x) => setS("gstClass", x)} options={[{ value: NONE, label: "Auto (from category)" }, ...Object.entries(GST_CLASS_LABEL).map(([value, label]) => ({ value, label }))]} />
              </Field>
              <Field id="s-hsn" label="HSN code" help="4, 6 or 8 digits — printed on the tax invoice. Confirm with your CA.">
                <AInput id="s-hsn" inputMode="numeric" maxLength={8} value={shared.hsn} onChange={(e) => setS("hsn", digits(e.target.value))} placeholder="6109" />
              </Field>
              <Field id="s-w" label="Packed weight (grams)" help="For courier rates and labels.">
                <AInput id="s-w" inputMode="numeric" maxLength={5} value={shared.weight} onChange={(e) => setS("weight", digits(e.target.value))} placeholder="350" />
              </Field>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Package size (cm)</p>
                <div className="flex gap-2">
                  <AInput aria-label="Length in cm" inputMode="numeric" maxLength={3} value={shared.length} onChange={(e) => setS("length", digits(e.target.value))} placeholder="L" />
                  <AInput aria-label="Width in cm" inputMode="numeric" maxLength={3} value={shared.width} onChange={(e) => setS("width", digits(e.target.value))} placeholder="W" />
                  <AInput aria-label="Height in cm" inputMode="numeric" maxLength={3} value={shared.height} onChange={(e) => setS("height", digits(e.target.value))} placeholder="H" />
                </div>
              </div>
            </div>
          </Card>

          <Card title="Legal declarations (Legal Metrology)">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="s-mfr" label="Manufacturer name and address" className="sm:col-span-2">
                <ATextarea id="s-mfr" rows={2} maxLength={300} value={shared.manufacturer} onChange={(e) => setS("manufacturer", e.target.value)} required />
              </Field>
              <Field id="s-packer" label="Packer (optional)">
                <AInput id="s-packer" maxLength={300} value={shared.packer} onChange={(e) => setS("packer", e.target.value)} />
              </Field>
              <Field id="s-imp" label="Importer (optional)">
                <AInput id="s-imp" maxLength={300} value={shared.importer} onChange={(e) => setS("importer", e.target.value)} />
              </Field>
              <Field id="s-coo" label="Country of origin">
                <AInput id="s-coo" maxLength={60} value={shared.countryOfOrigin} onChange={(e) => setS("countryOfOrigin", e.target.value)} required />
              </Field>
              <Field id="s-net" label="Net quantity">
                <AInput id="s-net" maxLength={60} value={shared.netQuantity} onChange={(e) => setS("netQuantity", e.target.value)} required />
              </Field>
            </div>
          </Card>
        </fieldset>

        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Card title="Publishing">
            <div className="space-y-3">
              <ul className="space-y-1.5 text-sm">
                {variants.map((x, i) => (
                  <li key={x.key} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ backgroundColor: x.hex }} aria-hidden />
                      <span className="truncate">{x.name || `Colour ${i + 1}`}</span>
                    </span>
                    {x.savedStatus === "active" && x.savedHandle ? (
                      <Link href={`/products/${x.savedHandle}`} target="_blank" className="text-xs underline underline-offset-2">
                        View
                      </Link>
                    ) : (
                      <StatusBadge status={x.status} tone={STATUS_TONE[x.status]} label={x.status} />
                    )}
                  </li>
                ))}
              </ul>
              {canEdit ? (
                <>
                  <AButton type="submit" className="w-full" loading={saving}>
                    {isNew ? "Save draft" : "Save changes"}
                  </AButton>
                  {drafts > 0 ? (
                    <AButton type="button" variant="outline" className="w-full" disabled={saving} onClick={() => void save(true)}>
                      {isNew ? "Save and publish" : `Save and publish ${drafts} draft${drafts === 1 ? "" : "s"}`}
                    </AButton>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">You can view this product. Editing needs the catalogue editor role.</p>
              )}
              <p className="text-xs text-muted-foreground">All colours are saved together. If someone else saved first, you&apos;ll be asked to reload.</p>
            </div>
          </Card>
          {hold && styleId ? (
            <Card title="Demand test">
              <SoldOutHold
                styleId={styleId}
                colours={hold}
                canEdit={canEdit}
                blockedReason={dirty ? "Save or discard your changes first — switching reloads this product." : undefined}
                onChanged={() => setNonce((n) => n + 1)}
              />
            </Card>
          ) : null}
        </div>
      </form>

      {dirty && canEdit ? (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 md:bottom-4 md:left-auto md:right-6 md:px-0 lg:hidden">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
            <span className="text-sm">Unsaved changes</span>
            <AButton size="sm" loading={saving} onClick={() => void save()}>
              Save
            </AButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function VariantPanel({
  v,
  index,
  baseTitle,
  art,
  canSeeCost,
  onChange,
  onRemove,
}: {
  v: VariantForm;
  index: number;
  baseTitle: string;
  art: GarmentKind;
  canSeeCost: boolean;
  onChange: (patch: Partial<VariantForm>) => void;
  onRemove?: () => void;
}) {
  const price = toPaise(v.price);
  const mrp = toPaise(v.mrp);
  const cost = v.cost.trim() === "" ? null : toPaise(v.cost);
  const off = price > 0 && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const used = new Set(v.sizes.map((s) => s.label));
  const handleLocked = !!v.id && v.savedStatus !== "draft";
  const name = v.name || `Colour ${index + 1}`;
  const setSize = (i: number, patch: Partial<SizeForm>) => onChange({ sizes: v.sizes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div role="tabpanel" aria-label={name} className="space-y-5 rounded-lg border border-border p-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <Field id="v-name" label="Colour name">
          <AInput id="v-name" value={v.name} maxLength={40} onChange={(e) => onChange({ name: e.target.value })} required placeholder="Sand" />
        </Field>
        <Field id="v-family" label="Colour filter">
          <ASelect label="Colour filter" className="w-full" value={v.family} onValueChange={(x) => onChange({ family: x })} options={Object.entries(COLOUR_FAMILIES).map(([k, c]) => ({ value: k, label: c.label }))} />
        </Field>
        <Field id="v-hex" label="Swatch">
          <AInput id="v-hex" type="color" className="w-16 p-1" value={v.hex} onChange={(e) => onChange({ hex: e.target.value })} />
        </Field>
        <Field id="v-status" label="Status" help={v.id ? "Archive a colour to take it off the store; orders keep it." : undefined}>
          <ASelect label="Status" className="w-full" value={v.status} onValueChange={(x) => onChange({ status: x as Status })} options={[{ value: "draft", label: "Draft" }, { value: "active", label: "Active (live)" }, ...(v.id ? [{ value: "archived", label: "Archived" }] : [])]} />
        </Field>
        <Field id="v-sku" label="Colour SKU" help="Style + colour code.">
          <AInput id="v-sku" value={v.sku} maxLength={40} onChange={(e) => onChange({ sku: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })} required placeholder="AH-SHI-001-SND" />
        </Field>
        <GarmentArt image={{ art, colour: v.hex, alt: "", url: v.photos[0] ? `/api/media/${v.photos[0].id}` : undefined }} sizes="64px" className="h-20 w-16 self-end rounded" />
        <Field id="v-handle" label="Web address" help={handleLocked ? "Published addresses can't change." : "Leave empty to make one from the name."} className="sm:col-span-3">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="shrink-0">/products/</span>
            <AInput
              id="v-handle"
              value={v.handle}
              disabled={handleLocked}
              maxLength={120}
              onChange={(e) => onChange({ handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
              placeholder={`${baseTitle} ${v.name}`.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-") || "linen-shirt-sand"}
            />
          </div>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field id="v-price" label="Selling price (₹)">
          <AInput id="v-price" inputMode="decimal" value={v.price} onChange={(e) => onChange({ price: money(e.target.value) })} required />
        </Field>
        <Field id="v-mrp" label="MRP (₹)" help="Incl. all taxes.">
          <AInput id="v-mrp" inputMode="decimal" value={v.mrp} onChange={(e) => onChange({ mrp: money(e.target.value) })} required />
        </Field>
        {canSeeCost ? (
          <Field id="v-cost" label="Cost price (₹)" help="Private. For margins.">
            <AInput id="v-cost" inputMode="decimal" value={v.cost} onChange={(e) => onChange({ cost: money(e.target.value) })} />
          </Field>
        ) : null}
        <Field id="v-badge" label="Badge">
          <ASelect label="Badge" className="w-full" value={v.badge} onValueChange={(x) => onChange({ badge: x })} options={[{ value: NONE, label: "None" }, { value: "NEW", label: "NEW" }, { value: "BESTSELLER", label: "BESTSELLER" }]} />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {price > 0 ? `Shoppers see ${formatINR(price)}${off ? ` · ${off}% off ${formatINR(mrp)}` : ""}.` : "Enter a price."}
        {price > mrp && mrp > 0 ? <span className="ml-1 text-destructive">The price can&apos;t be higher than the MRP.</span> : null}
        {canSeeCost && cost !== null && price > 0 ? (
          <span className={cn("ml-1", cost >= price && "text-destructive")}>
            Price − cost: {formatINR(price - cost)} ({Math.round(((price - cost) / price) * 100)}% of the price incl. GST).
          </span>
        ) : null}
      </p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Sizes</p>
          <AButton
            type="button"
            size="sm"
            variant="ghost"
            disabled={!v.sku}
            onClick={() => onChange({ sizes: v.sizes.map((s) => ({ ...s, sku: s.sku || `${v.sku}-${skuPart(s.label)}`.slice(0, 40) })) })}
          >
            Fill empty size SKUs
          </AButton>
        </div>
        <p className="text-xs text-muted-foreground">Stock of saved sizes is changed in Inventory (counted and audited). New sizes start with the number you enter.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-2 font-medium">Size</th>
                <th className="pb-2 pr-2 font-medium">SKU</th>
                <th className="pb-2 pr-2 font-medium">Barcode (EAN)</th>
                <th className="pb-2 pr-2 font-medium">Stock</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {v.sizes.map((s, i) => (
                <tr key={`${s.label}-${i}`}>
                  <td className="py-1 pr-2">
                    <ASelect label={`Size ${i + 1}`} className="w-28" value={s.label} onValueChange={(x) => setSize(i, { label: x })} options={SIZE_ORDER.filter((l) => l === s.label || !used.has(l)).map((l) => ({ value: l, label: l }))} />
                  </td>
                  <td className="py-1 pr-2">
                    <AInput aria-label={`SKU for ${s.label}`} maxLength={40} value={s.sku} onChange={(e) => setSize(i, { sku: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })} />
                  </td>
                  <td className="py-1 pr-2">
                    <AInput aria-label={`Barcode for ${s.label}`} inputMode="numeric" maxLength={14} value={s.barcode} onChange={(e) => setSize(i, { barcode: digits(e.target.value) })} />
                  </td>
                  <td className="py-1 pr-2">
                    <AInput aria-label={`Stock for ${s.label}`} className="w-20" inputMode="numeric" value={s.stock} disabled={s.saved} onChange={(e) => setSize(i, { stock: digits(e.target.value) })} />
                  </td>
                  <td className="py-1">
                    <AButton type="button" size="icon" variant="ghost" aria-label={`Remove size ${s.label}`} disabled={v.sizes.length === 1} onClick={() => onChange({ sizes: v.sizes.filter((_, j) => j !== i) })}>
                      <AIcon icon={Delete02Icon} />
                    </AButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AButton type="button" size="sm" variant="outline" disabled={v.sizes.length >= 12} onClick={() => onChange({ sizes: [...v.sizes, { label: SIZE_ORDER.find((l) => !used.has(l)) ?? "One size", sku: "", barcode: "", stock: "0", saved: false }] })}>
          <AIcon icon={Add01Icon} /> Add size
        </AButton>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Photos of {name}</p>
        <PhotoManager photos={v.photos} title={`${baseTitle} ${name}`.trim()} onChange={(photos) => onChange({ photos })} />
      </div>

      <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">Search engine listing (optional)</summary>
        <div className="mt-3 space-y-3">
          <Field id="v-seo-t" label="Page title" help={`${v.seoTitle.length}/70 · empty = the product title.`}>
            <AInput id="v-seo-t" maxLength={70} value={v.seoTitle} onChange={(e) => onChange({ seoTitle: e.target.value })} />
          </Field>
          <Field id="v-seo-d" label="Meta description" help={`${v.seoDescription.length}/160 · empty = made from the price and description.`}>
            <ATextarea id="v-seo-d" rows={2} maxLength={160} value={v.seoDescription} onChange={(e) => onChange({ seoDescription: e.target.value })} />
          </Field>
        </div>
      </details>

      {onRemove ? (
        <AButton type="button" variant="ghost" size="sm" onClick={onRemove}>
          <AIcon icon={Delete02Icon} /> Remove this unsaved colour
        </AButton>
      ) : null}
    </div>
  );
}

/** Sets or clears a photo's rail view (each view is used by one photo; picking it elsewhere moves it). */
function withView(p: Photo, value: string): Photo {
  const rest: Photo = { id: p.id, alt: p.alt };
  return value === "front" || value === "back" || value === "side" ? { ...rest, view: value } : rest;
}

/**
 * Photos of one colour: upload (JPEG / PNG, ≤ 8 MB, 600–6000 px — checked again on the server), reorder, describe,
 * remove. The first photo leads on product cards and the product page. Every photo needs a description (alt text).
 */
function PhotoManager({ photos, title, onChange }: { photos: Photo[]; title: string; onChange: (p: Photo[]) => void }) {
  const [busy, setBusy] = useState(false);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: Photo[] = [];
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
      <p className="text-xs text-muted-foreground">JPEG or PNG, at least 600 × 600 px, up to 8 MB, max 8 photos. Without photos the placeholder drawing is shown.</p>
      <p className="text-xs text-muted-foreground">
        Collection rail: tag three on-hanger cutouts as <b>Hanger · front</b>, <b>back</b> and <b>side</b> — transparent PNG, same size and
        framing for all three, hook at the top centre. With a front and a side the garment hangs side-on and turns to face the shopper.
      </p>
      {photos.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.id} className="space-y-1.5">
              <GarmentArt image={{ art: "tee", colour: "#e5e5e5", alt: p.alt, url: `/api/media/${p.id}` }} sizes="160px" className="aspect-[4/5] w-full rounded-md" />
              <AInput aria-label={`Description of photo ${i + 1}`} maxLength={140} value={p.alt} placeholder="Describe the photo" onChange={(e) => onChange(photos.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />
              <ASelect
                label={`Use of photo ${i + 1}`}
                className="w-full"
                value={p.view ?? NONE}
                onValueChange={(x) => onChange(photos.map((ph, j) => (j === i ? withView(ph, x) : ph.view === x ? withView(ph, NONE) : ph)))}
                options={PHOTO_VIEW_OPTIONS}
              />
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
      <label className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent", (busy || photos.length >= 8) && "pointer-events-none opacity-50")}>
        <AIcon icon={ImageUpload01Icon} />
        {busy ? "Uploading…" : "Upload photos"}
        <input type="file" accept="image/jpeg,image/png" multiple className="sr-only" disabled={busy || photos.length >= 8} onChange={(e) => void upload(e.target.files).finally(() => (e.target.value = ""))} />
      </label>
    </div>
  );
}

/** /admin/catalog/[id] (old per-colour links, audit log targets): opens the product the colour belongs to. */
export function ProductRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    adminApi<{ product: { styleId: string } }>(`/api/admin/catalog/${id}`)
      .then(({ product }) => !cancelled && router.replace(`/admin/catalog/style/${product.styleId}`))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load."));
    return () => {
      cancelled = true;
    };
  }, [id, router]);
  if (error) return <ErrorState message={error} />;
  return <div className="h-96 animate-pulse rounded-xl border border-border bg-card" aria-busy="true" />;
}
