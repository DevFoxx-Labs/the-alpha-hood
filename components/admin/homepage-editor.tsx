"use client";

import { Add01Icon, ArrowDown01Icon, ArrowUp01Icon, Delete02Icon, ImageUpload01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import Image from "next/image";
import { useEffect, useId, useState } from "react";
import type { HomepageContent, LandingLayout, StoredAmbassador, StoredCampaign, StoredDrop, StoredHeroSlide, StoredLimited, StoredPoints, StoredSeo, StoredSpotlight } from "@/lib/cms/homepage";
import { cn } from "@/lib/utils";
import { adminApi, notify, useAdmin } from "./admin-shell";
import { type HoldColour, SoldOutHold } from "./sold-out-hold";
import { ProductPicker } from "./taxonomy";
import { AButton, AIcon, AInput, ALabel, ASelect, ATextarea, Card, Confirm, ErrorState, FormDialog, PageHeader, StatusBadge } from "./ui";

/**
 * Admin → Homepage: hero carousel, campaign band, SEO block. Each part is either the built-in content or the
 * admin's own; "Customise" starts from what the store shows today, "Use built-in" goes back. The screen only
 * collects choices — the server (lib/cms/homepage.ts) validates every field, link and image and refuses a stale save.
 */
interface View {
  revision: number;
  content: HomepageContent;
  builtIn: Required<HomepageContent> & { drop: Required<StoredDrop> };
  builtInImages: string[];
  productTitles: Record<string, string>;
  /** Live stock of every colour of each picked product's style. */
  stock: Record<string, StyleStock>;
  /** LANDING_LAYOUT on the server (used while the admin hasn't chosen); null = not set. */
  envLayout: LandingLayout | null;
  /** What the store shows right now. */
  liveLayout: LandingLayout;
  limits: { slides: number; headlineLines: number; seoGroups: number; seoLinks: number; seoParagraphs: number; ambassadorProducts: number; limitedProducts: number; editionMax: number; spotlights: number; spotlightDetails: number; points: number };
}

interface StyleStock {
  styleId: string;
  colours: (HoldColour & { sku: string; sizes: { label: string; stock: number }[] })[];
}

const errText = (e: unknown, fallback = "Something went wrong.") => (e instanceof Error ? e.message : fallback);
const imageName = (p: string) => (p.startsWith("/api/media/") ? "Uploaded photo" : (p.split("/").pop() ?? p).replace(/\.\w+$/, "").replaceAll("-", " "));

function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

function IconButton({ icon, label, onClick, disabled, tone }: { icon: IconSvgElement; label: string; onClick?: () => void; disabled?: boolean; tone?: "danger" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35",
        tone === "danger" && "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400",
      )}
    >
      <AIcon icon={icon} />
    </button>
  );
}

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function Check({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
      {label}
    </label>
  );
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

function Preview({ src, className }: { src: string | null; className?: string }) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-md border border-border bg-muted", className)}>
      {src ? <Image src={src} alt="" fill sizes="160px" className="object-cover" /> : <span className="absolute inset-0 grid place-items-center text-[10px] text-muted-foreground">No image</span>}
    </div>
  );
}

/** Upload a JPEG / PNG to our own media store, or pick one of the built-in brand images. */
function ImagePicker({ id, label, value, onChange, builtIns, allowNone, help, aspect }: { id: string; label: string; value: string | null; onChange: (v: string | null) => void; builtIns: string[]; allowNone: boolean; help: string; aspect: string }) {
  const [busy, setBusy] = useState(false);
  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.type !== "image/jpeg" && file.type !== "image/png") return notify("error", "Use a JPEG or PNG image.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/media", { method: "POST", headers: { "Content-Type": file.type }, body: file, cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
      if (!res.ok || !data?.url) throw new Error(data?.error?.message ?? "Upload failed.");
      onChange(data.url);
    } catch (e) {
      notify("error", errText(e, "Upload failed."));
    } finally {
      setBusy(false);
    }
  }
  const options = [...(allowNone ? [{ value: "__none", label: "No image (placeholder drawing)" }] : []), ...(value?.startsWith("/api/media/") ? [{ value, label: "Uploaded photo" }] : []), ...builtIns.map((b) => ({ value: b, label: `Built-in: ${imageName(b)}` }))];
  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <div className="flex items-start gap-3">
        <Preview src={value} className={aspect} />
        <div className="min-w-0 flex-1 space-y-2">
          <label className={cn("inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent", busy && "pointer-events-none opacity-50")}>
            <AIcon icon={ImageUpload01Icon} />
            {busy ? "Uploading…" : "Upload photo"}
            <input id={id} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
          <ASelect label={`${label}: choose`} className="w-full" value={value ?? "__none"} onValueChange={(v) => onChange(v === "__none" ? null : v)} options={options} />
          <p className="text-xs text-muted-foreground">{help}</p>
        </div>
      </div>
    </fieldset>
  );
}

const toLocalInput = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : undefined);

const blankSlide = (n: number): StoredHeroSlide => ({
  id: `slide-${Date.now().toString(36)}-${n}`,
  enabled: true,
  kicker: "",
  headline: ["New", "drop"],
  subline: "",
  cta: { label: "Shop now", href: "/collections/new-in" },
  textTone: "white",
  desktopImage: null,
  mobileImage: null,
  alt: "",
  fill: "#0a0a0a",
});

// ── Screen ───────────────────────────────────────────────────────────────────────────────────────

export function HomepageScreen() {
  const { can } = useAdmin();
  const canEdit = can("catalog.write");
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The admin's landing page choice (saved with the rest); null = follow LANDING_LAYOUT / the full store. */
  const [layout, setLayout] = useState<LandingLayout | null>(null);
  /** Which layout's own hero / SEO the cards below edit. */
  const [target, setTarget] = useState<LandingLayout>("store");
  const [storeHero, setStoreHero] = useState<StoredHeroSlide[] | null>(null);
  const [dropHero, setDropHero] = useState<StoredHeroSlide[] | null>(null);
  const [dropSeo, setDropSeo] = useState<StoredSeo | null>(null);
  const [spotlights, setSpotlights] = useState<StoredSpotlight[] | null>(null);
  const [points, setPoints] = useState<StoredPoints | null>(null);
  const [campaign, setCampaign] = useState<StoredCampaign | null>(null);
  const [storeSeo, setStoreSeo] = useState<StoredSeo | null>(null);
  const [ambassador, setAmbassador] = useState<StoredAmbassador | null>(null);
  const [limited, setLimited] = useState<StoredLimited | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ index: number | null; slide: StoredHeroSlide } | null>(null);
  const [nonce, setNonce] = useState(0);
  useLeaveGuard(dirty);

  useEffect(() => {
    let cancelled = false;
    adminApi<View>("/api/admin/homepage")
      .then((v) => {
        if (cancelled) return;
        setView(v);
        setStoreHero(v.content.hero ?? null);
        setLayout(v.content.layout ?? null);
        setTarget(v.liveLayout);
        setDropHero(v.content.drop?.hero ?? null);
        setDropSeo(v.content.drop?.seo ?? null);
        setSpotlights(v.content.drop?.spotlights ?? null);
        setPoints(v.content.drop?.points ?? null);
        setCampaign(v.content.campaign ?? null);
        setStoreSeo(v.content.seo ?? null);
        setAmbassador(v.content.ambassador ?? null);
        setLimited(v.content.limited ?? null);
        setTitles(v.productTitles);
        setDirty(false);
        setError(null);
      })
      .catch((e) => !cancelled && setError(errText(e, "Couldn't load.")));
    return () => {
      cancelled = true;
    };
  }, [nonce]);
  const reload = () => setNonce((n) => n + 1);
  // After "Show as sold out" is switched: refresh only the stock / sign-ups, keeping unsaved edits.
  const refreshStock = () =>
    adminApi<View>("/api/admin/homepage")
      .then((v) => setView((cur) => (cur ? { ...cur, stock: v.stock } : cur)))
      .catch(() => notify("error", "Switched — reload the page to see the latest stock."));
  const change = <T,>(set: (v: T) => void) => (v: T) => (set(v), setDirty(true));
  const editLayout = change(setLayout);
  const editSpotlights = change(setSpotlights);
  const editPoints = change(setPoints);
  // The hero and SEO cards edit the layout picked in "Edit content for".
  const hero = target === "drop" ? dropHero : storeHero;
  const editHero = target === "drop" ? change(setDropHero) : change(setStoreHero);
  const editCampaign = change(setCampaign);
  const seo = target === "drop" ? dropSeo : storeSeo;
  const editSeo = target === "drop" ? change(setDropSeo) : change(setStoreSeo);
  const editAmbassador = change(setAmbassador);
  const editLimited = change(setLimited);

  async function save() {
    if (!view) return;
    setSaving(true);
    try {
      await adminApi("/api/admin/homepage", { method: "PUT", body: { revision: view.revision, layout, hero: storeHero, campaign, seo: storeSeo, ambassador, limited, drop: { hero: dropHero, seo: dropSeo, spotlights, points } } });
      notify("success", "Homepage saved — the store shows it within a few seconds");
      reload();
    } catch (e) {
      notify("error", errText(e, "Couldn't save."));
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!view) return <div className="h-64 animate-pulse rounded-xl bg-muted" aria-busy="true" />;
  const heroBuiltIn = target === "drop" ? view.builtIn.drop.hero : view.builtIn.hero;
  const seoBuiltIn = target === "drop" ? view.builtIn.drop.seo : view.builtIn.seo;
  const slides = hero ?? heroBuiltIn;

  return (
    <div className="space-y-5 pb-20">
      <PageHeader title="Homepage" description="The hero carousel, the brand-ambassador and limited-edition sections, the campaign band and the SEO links on the home page. Categories on the homepage are set in Categories → Homepage category rail." />

      {/* ── Landing page layout ── */}
      <Card title="Landing page layout">
        <p className="mb-3 text-sm text-muted-foreground">
          The choice made here wins. With <b>Follow the environment</b>, the server&apos;s <code className="rounded bg-muted px-1">LANDING_LAYOUT</code> decides
          {view.envLayout ? <> — it is set to <b>{view.envLayout === "drop" ? "Exclusive drop" : "Full store"}</b></> : " — it isn't set, so the full store shows"}.
        </p>
        <div role="radiogroup" aria-label="Landing page layout" className="grid gap-3 lg:grid-cols-3">
          {(
            [
              ["store", "Full store", "The full catalogue homepage: categories, offers, trending, new arrivals and more."],
              ["drop", "Exclusive drop", "For a few signed, limited pieces: hero, ambassador, a big spotlight per piece with colours and Add to bag, why it's exclusive, the limited-edition finale."],
              [null, "Follow the environment", `No choice here: LANDING_LAYOUT decides (now: ${view.envLayout === "drop" ? "Exclusive drop" : view.envLayout === "store" ? "Full store" : "not set → Full store"}).`],
            ] as const
          ).map(([value, label, help]) => (
            <button
              key={value ?? "env"}
              type="button"
              role="radio"
              aria-checked={layout === value}
              disabled={!canEdit}
              onClick={() => {
                editLayout(value);
                setTarget(value ?? view.envLayout ?? "store");
              }}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                layout === value ? "border-primary bg-accent" : "border-border hover:bg-accent/50",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{label}</span>
                {(view.content.layout ?? null) === value ? <StatusBadge status="live" tone="success" label={value === null ? `Live now · ${view.liveLayout === "drop" ? "drop" : "full store"}` : "Live now"} /> : layout === value ? <StatusBadge status="pending" tone="pending" label="Live after save" /> : null}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{help}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Edit the hero and SEO block of:</span>
          {(["store", "drop"] as const).map((t) => (
            <AButton key={t} size="sm" variant={target === t ? "default" : "outline"} aria-pressed={target === t} onClick={() => setTarget(t)}>
              {t === "store" ? "Full store" : "Exclusive drop"}
            </AButton>
          ))}
          <span className="text-xs text-muted-foreground">The ambassador, limited-edition and campaign sections are shared by both.</span>
        </div>
      </Card>

      {/* ── Hero ── */}
      <Card
        title={`Hero carousel${target === "drop" ? " (exclusive drop)" : " (full store)"} · ${slides.length} slide${slides.length === 1 ? "" : "s"}`}
        action={
          canEdit ? (
            hero === null ? (
              <AButton size="sm" onClick={() => editHero(heroBuiltIn.map((s) => ({ ...s })))}>
                Customise
              </AButton>
            ) : (
              <div className="flex gap-2">
                <Confirm trigger={<AButton size="sm" variant="ghost">Use built-in</AButton>} title="Go back to the built-in slides?" description="Your slides are removed from the editor. Nothing changes on the store until you save." confirmLabel="Use built-in" onConfirm={() => editHero(null)} />
                <AButton size="sm" variant="outline" disabled={hero.length >= view.limits.slides} onClick={() => setEditing({ index: null, slide: blankSlide(hero.length + 1) })}>
                  <AIcon icon={Add01Icon} /> Add slide
                </AButton>
              </div>
            )
          ) : undefined
        }
      >
        <p className="mb-3 text-sm text-muted-foreground">
          {hero === null ? "Showing the built-in slides. Customise to change the text, images, links and order." : `Up to ${view.limits.slides} slides, shown in this order. Switched-off slides stay here but don't show.`}
        </p>
        <ul className="divide-y divide-border">
          {slides.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <Preview src={s.desktopImage ?? s.mobileImage} className="h-12 w-20" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.headline.join(" ")}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.kicker ? `${s.kicker} · ` : ""}
                  {s.cta.label} → {s.cta.href}
                  {s.devices ? ` · ${s.devices[0]} only` : ""}
                  {s.startsAt || s.endsAt ? " · scheduled" : ""}
                </p>
              </div>
              {hero !== null && canEdit ? (
                <div className="flex items-center">
                  <label className="mr-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={s.enabled} aria-label={`Show slide “${s.headline.join(" ")}”`} onChange={(e) => editHero(hero.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} className="h-4 w-4" />
                    <span className="hidden sm:inline">Show</span>
                  </label>
                  <IconButton icon={ArrowUp01Icon} label="Move slide up" disabled={i === 0} onClick={() => editHero(move(hero, i, -1))} />
                  <IconButton icon={ArrowDown01Icon} label="Move slide down" disabled={i === hero.length - 1} onClick={() => editHero(move(hero, i, 1))} />
                  <IconButton icon={PencilEdit02Icon} label="Edit slide" onClick={() => setEditing({ index: i, slide: { ...s } })} />
                  <Confirm trigger={<IconButton icon={Delete02Icon} tone="danger" label="Remove slide" />} title="Remove this slide?" description="Nothing changes on the store until you save." confirmLabel="Remove" destructive onConfirm={() => editHero(hero.filter((_, j) => j !== i))} />
                </div>
              ) : (
                <StatusBadge status="built-in" tone="neutral" label="Built-in" />
              )}
            </li>
          ))}
        </ul>
      </Card>

      {target === "drop" ? (
        <>
          <Card
            title={`Product spotlights (exclusive drop) · ${(spotlights ?? view.builtIn.drop.spotlights).length}`}
            action={
              canEdit ? (
                spotlights === null ? (
                  <AButton size="sm" onClick={() => editSpotlights(view.builtIn.drop.spotlights.map((x) => ({ ...x })))}>
                    Customise
                  </AButton>
                ) : (
                  <div className="flex gap-2">
                    <AButton size="sm" variant="ghost" onClick={() => editSpotlights(null)}>
                      Use built-in
                    </AButton>
                    <AButton size="sm" variant="ghost" asChild>
                      <a href="/admin/catalog/new" target="_blank" rel="noopener">
                        New product ↗
                      </a>
                    </AButton>
                    <AButton size="sm" variant="outline" disabled={spotlights.length >= view.limits.spotlights} onClick={() => editSpotlights([...spotlights, { lead: `Piece ${String(spotlights.length + 1).padStart(2, "0")}`, title: "", productId: "", details: [], signedBy: null, editionSize: null, reverse: spotlights.length % 2 === 1 }])}>
                      <AIcon icon={Add01Icon} /> Add spotlight
                    </AButton>
                  </div>
                )
              ) : undefined
            }
          >
            <p className="mb-3 text-sm text-muted-foreground">
              One big section per piece (up to {view.limits.spotlights}): its photos, price, colour swatches, sizes and Add to bag. Pick any colour of a style — every colour of it shows as a swatch. A new piece: create it with <b>New product</b>, then <b>Add spotlight</b> and pick it. Stock is changed in Inventory (audited); each spotlight shows it live.
              {spotlights === null ? " Showing the built-in demo (the store's hoodie and a tee) — customise it and pick your products." : ""}
            </p>
            {spotlights !== null ? (
              <div className="space-y-4">
                {spotlights.map((sp, i) => (
                  <SpotlightFields
                    key={i}
                    index={i}
                    count={spotlights.length}
                    value={sp}
                    titles={titles}
                    onTitles={(t) => setTitles((x) => ({ ...x, ...t }))}
                    stock={sp.productId ? view.stock[sp.productId] : undefined}
                    onStockChanged={refreshStock}
                    maxDetails={view.limits.spotlightDetails}
                    editionMax={view.limits.editionMax}
                    disabled={!canEdit}
                    onChange={(v) => editSpotlights(spotlights.map((x, j) => (j === i ? v : x)))}
                    onMove={(d) => editSpotlights(move(spotlights, i, d))}
                    onRemove={() => editSpotlights(spotlights.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            ) : null}
          </Card>

          <Card
            title="Why it's exclusive (exclusive drop)"
            action={
              canEdit ? (
                points === null ? (
                  <AButton size="sm" onClick={() => editPoints({ ...view.builtIn.drop.points, points: view.builtIn.drop.points.points.map((x) => ({ ...x })) })}>
                    Customise
                  </AButton>
                ) : (
                  <AButton size="sm" variant="ghost" onClick={() => editPoints(null)}>
                    Use built-in
                  </AButton>
                )
              ) : undefined
            }
          >
            {points === null ? (
              <p className="text-sm text-muted-foreground">Showing the built-in points: {view.builtIn.drop.points.points.map((x) => x.title).join(" · ")}.</p>
            ) : (
              <PointsFields value={points} onChange={editPoints} max={view.limits.points} disabled={!canEdit} />
            )}
          </Card>
        </>
      ) : null}

      {/* ── Brand ambassador exclusives ── */}
      <Card
        title="Brand ambassador — signed exclusives"
        action={
          canEdit ? (
            ambassador === null ? (
              <AButton size="sm" onClick={() => editAmbassador({ ...view.builtIn.ambassador })}>
                Customise
              </AButton>
            ) : (
              <AButton size="sm" variant="ghost" onClick={() => editAmbassador(null)}>
                Use built-in
              </AButton>
            )
          ) : undefined
        }
      >
        <p className="mb-3 text-sm text-muted-foreground">
          A full-screen band below the categories: your ambassador&apos;s photo, two giant headline lines that sweep in from both sides, and the signed pieces you pick.
          {ambassador === null ? " Showing the built-in demo (the mascot) — customise it before launch." : ""}
        </p>
        {ambassador !== null ? (
          <AmbassadorFields value={ambassador} onChange={editAmbassador} builtIns={view.builtInImages} titles={titles} onTitles={(t) => setTitles((x) => ({ ...x, ...t }))} max={view.limits.ambassadorProducts} disabled={!canEdit} />
        ) : null}
      </Card>

      {/* ── Limited edition ── */}
      <Card
        title="Limited edition drop"
        action={
          canEdit ? (
            limited === null ? (
              <AButton size="sm" onClick={() => editLimited({ ...view.builtIn.limited })}>
                Customise
              </AButton>
            ) : (
              <AButton size="sm" variant="ghost" onClick={() => editLimited(null)}>
                Use built-in
              </AButton>
            )
          ) : undefined
        }
      >
        <p className="mb-3 text-sm text-muted-foreground">
          The pinned, full-screen yellow section near the bottom of the page: line 1 behind the art, line 2 in front, a cut-out with sparks and the call to action. &ldquo;Pieces left&rdquo; is the real stock of the picked products.
          {limited === null ? " Showing the built-in demo — customise it before launch." : ""}
        </p>
        {limited !== null ? (
          <LimitedFields value={limited} onChange={editLimited} builtIns={view.builtInImages} titles={titles} onTitles={(t) => setTitles((x) => ({ ...x, ...t }))} max={view.limits.limitedProducts} editionMax={view.limits.editionMax} disabled={!canEdit} />
        ) : null}
      </Card>

      {/* ── Campaign band ── */}
      <Card
        title="Campaign band"
        action={
          canEdit ? (
            campaign === null ? (
              <AButton size="sm" onClick={() => editCampaign({ ...view.builtIn.campaign })}>
                Customise
              </AButton>
            ) : (
              <AButton size="sm" variant="ghost" onClick={() => editCampaign(null)}>
                Use built-in
              </AButton>
            )
          ) : undefined
        }
      >
        {campaign === null ? (
          <div className="flex items-center gap-3">
            <Preview src={view.builtIn.campaign.image} className="h-20 w-16" />
            <p className="text-sm text-muted-foreground">
              Showing the built-in band: <b className="text-foreground">{view.builtIn.campaign.headline.join(" ")}</b> → {view.builtIn.campaign.cta.href}
            </p>
          </div>
        ) : (
          <CampaignFields value={campaign} onChange={editCampaign} builtIns={view.builtInImages} disabled={!canEdit} />
        )}
      </Card>

      {/* ── SEO block ── */}
      <Card
        title={`SEO block${target === "drop" ? " (exclusive drop)" : " (full store)"}`}
        action={
          canEdit ? (
            seo === null ? (
              <AButton size="sm" onClick={() => editSeo({ ...seoBuiltIn })}>
                Customise
              </AButton>
            ) : (
              <AButton size="sm" variant="ghost" onClick={() => editSeo(null)}>
                Use built-in
              </AButton>
            )
          ) : undefined
        }
      >
        {seo === null ? (
          <p className="text-sm text-muted-foreground">
            Showing the built-in block: {seoBuiltIn.groups.map((g) => `${g.title} (${g.links.length} links)`).join(", ")} and {seoBuiltIn.text.length} paragraphs.
          </p>
        ) : (
          <SeoFields key={target} value={seo} onChange={editSeo} limits={view.limits} disabled={!canEdit} />
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

      {editing ? (
        <SlideDialog
          key={editing.slide.id}
          initial={editing.slide}
          builtIns={view.builtInImages}
          isNew={editing.index === null}
          onClose={() => setEditing(null)}
          onSave={(s) => {
            const list = hero ?? [];
            editHero(editing.index === null ? [...list, s] : list.map((x, j) => (j === editing.index ? s : x)));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

// ── Hero slide dialog ────────────────────────────────────────────────────────────────────────────

function SlideDialog({ initial, builtIns, isNew, onClose, onSave }: { initial: StoredHeroSlide; builtIns: string[]; isNew: boolean; onClose: () => void; onSave: (s: StoredHeroSlide) => void }) {
  const id = useId();
  const [s, setS] = useState(initial);
  const [headline, setHeadline] = useState(initial.headline.join("\n"));
  const set = (patch: Partial<StoredHeroSlide>) => setS((x) => ({ ...x, ...patch }));
  const devices = s.devices ? s.devices[0] : "both";
  const heroImages = builtIns.filter((b) => b.includes("/hero-"));
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? "Add hero slide" : "Edit hero slide"}
      description="The server checks every field when you save the page."
      submitLabel="Done"
      onSubmit={() => {
        const lines = headline.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) return notify("error", "Write a headline.");
        onSave({ ...s, headline: lines });
      }}
    >
      <Field id={`${id}-k`} label="Small line above the headline" help="e.g. Winter drop · 2026 (optional, up to 60 characters)">
        <AInput id={`${id}-k`} value={s.kicker} maxLength={60} onChange={(e) => set({ kicker: e.target.value })} />
      </Field>
      <Field id={`${id}-h`} label="Headline" help="One line per row, 1–3 rows, up to 24 characters each. Shown very large.">
        <ATextarea id={`${id}-h`} rows={3} value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </Field>
      <Field id={`${id}-s`} label="Text under the headline" help="Optional, up to 160 characters.">
        <AInput id={`${id}-s`} value={s.subline} maxLength={160} onChange={(e) => set({ subline: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-cl`} label="Button text">
          <AInput id={`${id}-cl`} value={s.cta.label} maxLength={30} onChange={(e) => set({ cta: { ...s.cta, label: e.target.value } })} />
        </Field>
        <Field id={`${id}-ch`} label="Button link" help="A page on this store, e.g. /collections/new-in">
          <AInput id={`${id}-ch`} value={s.cta.href} maxLength={200} onChange={(e) => set({ cta: { ...s.cta, href: e.target.value } })} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-t`} label="Headline colour">
          <ASelect label="Headline colour" className="w-full" value={s.textTone} onValueChange={(v) => set({ textTone: v as StoredHeroSlide["textTone"] })} options={[{ value: "volt", label: "Volt (brand green)" }, { value: "white", label: "White" }]} />
        </Field>
        <Field id={`${id}-f`} label="Background colour" help="Behind the image while it loads.">
          <input id={`${id}-f`} type="color" value={s.fill} onChange={(e) => set({ fill: e.target.value })} className="h-9 w-full cursor-pointer rounded-md border border-input bg-background p-1" />
        </Field>
      </div>
      <ImagePicker id={`${id}-d`} label="Desktop image" value={s.desktopImage} onChange={(v) => set({ desktopImage: v })} builtIns={heroImages} allowNone aspect="h-12 w-24" help="Wide, about 16:7 (e.g. 1920 × 840). Text sits on the left — keep that side calm." />
      <ImagePicker id={`${id}-m`} label="Mobile image" value={s.mobileImage} onChange={(v) => set({ mobileImage: v })} builtIns={heroImages} allowNone aspect="h-16 w-12" help="Tall, about 4:5 (e.g. 1080 × 1350). Empty = the desktop image is used." />
      <Field id={`${id}-a`} label="Image description (alt text)" help="Required with an image. Describes it for screen readers and search engines.">
        <AInput id={`${id}-a`} value={s.alt} maxLength={140} onChange={(e) => set({ alt: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id={`${id}-dv`} label="Show on">
          <ASelect label="Show on" className="w-full" value={devices} onValueChange={(v) => set({ devices: v === "both" ? undefined : [v as "mobile" | "desktop"] })} options={[{ value: "both", label: "Mobile + desktop" }, { value: "mobile", label: "Mobile only" }, { value: "desktop", label: "Desktop only" }]} />
        </Field>
        <Field id={`${id}-st`} label="Starts (optional)">
          <AInput id={`${id}-st`} type="datetime-local" value={toLocalInput(s.startsAt)} onChange={(e) => set({ startsAt: fromLocalInput(e.target.value) })} />
        </Field>
        <Field id={`${id}-en`} label="Ends (optional)">
          <AInput id={`${id}-en`} type="datetime-local" value={toLocalInput(s.endsAt)} onChange={(e) => set({ endsAt: fromLocalInput(e.target.value) })} />
        </Field>
      </div>
      <Check id={`${id}-on`} checked={s.enabled} onChange={(v) => set({ enabled: v })} label="Show this slide" />
    </FormDialog>
  );
}

// ── Campaign band fields ─────────────────────────────────────────────────────────────────────────

function CampaignFields({ value, onChange, builtIns, disabled }: { value: StoredCampaign; onChange: (v: StoredCampaign) => void; builtIns: string[]; disabled: boolean }) {
  const id = useId();
  const set = (patch: Partial<StoredCampaign>) => onChange({ ...value, ...patch });
  return (
    <fieldset disabled={disabled} className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Check id={`${id}-on`} checked={value.enabled} onChange={(v) => set({ enabled: v })} label="Show the campaign band on the homepage" />
        <Field id={`${id}-k`} label="Small line" help="e.g. The Pack (optional)">
          <AInput id={`${id}-k`} value={value.kicker} maxLength={40} onChange={(e) => set({ kicker: e.target.value })} />
        </Field>
        <Field id={`${id}-h`} label="Headline" help="One line per row, 1–3 rows, up to 28 characters each.">
          <ATextarea id={`${id}-h`} rows={3} value={value.headline.join("\n")} onChange={(e) => set({ headline: e.target.value.split("\n") })} onBlur={() => set({ headline: value.headline.map((l) => l.trim()).filter(Boolean) })} />
        </Field>
        <Field id={`${id}-t`} label="Text" help="Up to 240 characters.">
          <ATextarea id={`${id}-t`} rows={3} value={value.text} maxLength={240} onChange={(e) => set({ text: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${id}-cl`} label="Button text">
            <AInput id={`${id}-cl`} value={value.cta.label} maxLength={30} onChange={(e) => set({ cta: { ...value.cta, label: e.target.value } })} />
          </Field>
          <Field id={`${id}-ch`} label="Button link" help="A page on this store, e.g. /about">
            <AInput id={`${id}-ch`} value={value.cta.href} maxLength={200} onChange={(e) => set({ cta: { ...value.cta, href: e.target.value } })} />
          </Field>
        </div>
      </div>
      <div className="space-y-4">
        <ImagePicker id={`${id}-i`} label="Image" value={value.image} onChange={(v) => v && set({ image: v })} builtIns={builtIns.filter((b) => !b.includes("/hero-"))} allowNone={false} aspect="h-24 w-20" help="Portrait, about 4:5. Shown beside the text on desktop, above it on mobile." />
        <Field id={`${id}-a`} label="Image description (alt text)">
          <AInput id={`${id}-a`} value={value.alt} maxLength={140} onChange={(e) => set({ alt: e.target.value })} />
        </Field>
        <div className="space-y-1.5">
          <Check id={`${id}-bgon`} checked={value.bg !== null} onChange={(v) => set({ bg: v ? "#565055" : null })} label="Panel colour behind the image" />
          {value.bg !== null ? <input aria-label="Panel colour" type="color" value={value.bg} onChange={(e) => set({ bg: e.target.value })} className="h-9 w-full cursor-pointer rounded-md border border-input bg-background p-1" /> : null}
        </div>
      </div>
    </fieldset>
  );
}

// ── SEO block fields ─────────────────────────────────────────────────────────────────────────────

/** Links as text: one per row, "Label | /path". */
const linksToText = (links: { label: string; href: string }[]) => links.map((l) => `${l.label} | ${l.href}`).join("\n");
const textToLinks = (t: string) =>
  t
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const i = row.lastIndexOf("|");
      return i < 0 ? { label: row, href: "" } : { label: row.slice(0, i).trim(), href: row.slice(i + 1).trim() };
    });

function SeoFields({ value, onChange, limits, disabled }: { value: StoredSeo; onChange: (v: StoredSeo) => void; limits: View["limits"]; disabled: boolean }) {
  const id = useId();
  const set = (patch: Partial<StoredSeo>) => onChange({ ...value, ...patch });
  // Text areas keep the admin's typing as is; the structure is rebuilt from them.
  const [groupText, setGroupText] = useState(() => value.groups.map((g) => linksToText(g.links)));
  const [paras, setParas] = useState(() => value.text.join("\n\n"));
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <Field id={`${id}-h`} label="Heading">
        <AInput id={`${id}-h`} value={value.heading} maxLength={80} onChange={(e) => set({ heading: e.target.value })} />
      </Field>
      <div className="grid gap-4 lg:grid-cols-2">
        {value.groups.map((g, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field id={`${id}-g${i}`} label={`Link group ${i + 1} title`}>
                  <AInput id={`${id}-g${i}`} value={g.title} maxLength={40} onChange={(e) => set({ groups: value.groups.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                </Field>
              </div>
              <IconButton
                icon={Delete02Icon}
                tone="danger"
                label={`Remove link group ${g.title || i + 1}`}
                onClick={() => {
                  setGroupText(groupText.filter((_, j) => j !== i));
                  set({ groups: value.groups.filter((_, j) => j !== i) });
                }}
              />
            </div>
            <Field id={`${id}-l${i}`} label="Links" help={`One per row: Text | /link-on-this-store (up to ${limits.seoLinks}). e.g. Baggy jeans | /men/jeans/baggy or Linen shirt | /search?q=linen+shirt`}>
              <ATextarea
                id={`${id}-l${i}`}
                rows={8}
                value={groupText[i] ?? ""}
                onChange={(e) => {
                  setGroupText(groupText.map((t, j) => (j === i ? e.target.value : t)));
                  set({ groups: value.groups.map((x, j) => (j === i ? { ...x, links: textToLinks(e.target.value) } : x)) });
                }}
                className="font-mono text-xs"
              />
            </Field>
          </div>
        ))}
      </div>
      {value.groups.length < limits.seoGroups ? (
        <AButton
          size="sm"
          variant="outline"
          onClick={() => {
            setGroupText([...groupText, ""]);
            set({ groups: [...value.groups, { title: "", links: [] }] });
          }}
        >
          <AIcon icon={Add01Icon} /> Add link group
        </AButton>
      ) : null}
      <Field id={`${id}-p`} label="Paragraphs" help={`Up to ${limits.seoParagraphs} paragraphs, 20–600 characters each. Leave an empty line between paragraphs.`}>
        <ATextarea
          id={`${id}-p`}
          rows={7}
          value={paras}
          onChange={(e) => {
            setParas(e.target.value);
            set({ text: e.target.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) });
          }}
        />
      </Field>
    </fieldset>
  );
}

// ── Brand ambassador fields ──────────────────────────────────────────────────────────────────────

function BigLines({ id, line1, line2, onChange }: { id: string; line1: string; line2: string; onChange: (l1: string, l2: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id={`${id}-l1`} label="Headline line 1" help="Up to 16 characters. Shown very large; sweeps in from the left.">
        <AInput id={`${id}-l1`} value={line1} maxLength={16} onChange={(e) => onChange(e.target.value, line2)} />
      </Field>
      <Field id={`${id}-l2`} label="Headline line 2" help="Up to 16 characters. Sweeps in from the right.">
        <AInput id={`${id}-l2`} value={line2} maxLength={16} onChange={(e) => onChange(line1, e.target.value)} />
      </Field>
    </div>
  );
}

function CtaFields({ id, value, onChange, help }: { id: string; value: { label: string; href: string }; onChange: (v: { label: string; href: string }) => void; help: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id={`${id}-cl`} label="Button text">
        <AInput id={`${id}-cl`} value={value.label} maxLength={30} onChange={(e) => onChange({ ...value, label: e.target.value })} />
      </Field>
      <Field id={`${id}-ch`} label="Button link" help={help}>
        <AInput id={`${id}-ch`} value={value.href} maxLength={200} onChange={(e) => onChange({ ...value, href: e.target.value })} />
      </Field>
    </div>
  );
}

function AmbassadorFields({ value, onChange, builtIns, titles, onTitles, max, disabled }: { value: StoredAmbassador; onChange: (v: StoredAmbassador) => void; builtIns: string[]; titles: Record<string, string>; onTitles: (t: Record<string, string>) => void; max: number; disabled: boolean }) {
  const id = useId();
  const set = (patch: Partial<StoredAmbassador>) => onChange({ ...value, ...patch });
  return (
    <fieldset disabled={disabled} className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Check id={`${id}-on`} checked={value.enabled} onChange={(v) => set({ enabled: v })} label="Show this section on the homepage" />
        <Field id={`${id}-n`} label="Ambassador's name" help='Shown as "Hand-signed by …" and on every signed piece.'>
          <AInput id={`${id}-n`} value={value.ambassadorName} maxLength={40} onChange={(e) => set({ ambassadorName: e.target.value })} />
        </Field>
        <Field id={`${id}-e`} label="Small line above" help="e.g. Brand ambassador · Signed collection (optional, up to 50)">
          <AInput id={`${id}-e`} value={value.eyebrow} maxLength={50} onChange={(e) => set({ eyebrow: e.target.value })} />
        </Field>
        <BigLines id={id} line1={value.line1} line2={value.line2} onChange={(line1, line2) => set({ line1, line2 })} />
        <Field id={`${id}-t`} label="Text" help="Up to 240 characters.">
          <ATextarea id={`${id}-t`} rows={3} value={value.text} maxLength={240} onChange={(e) => set({ text: e.target.value })} />
        </Field>
        <CtaFields id={id} value={value.cta} onChange={(cta) => set({ cta })} help="A page on this store, e.g. /collections/signed" />
      </div>
      <div className="space-y-4">
        <ImagePicker id={`${id}-d`} label="Desktop photo" value={value.desktopImage} onChange={(v) => v && set({ desktopImage: v })} builtIns={builtIns} allowNone={false} aspect="h-12 w-24" help="Wide, about 16:7 (e.g. 1920 × 840), the ambassador on the right half — the text sits on the left." />
        <ImagePicker id={`${id}-m`} label="Mobile photo" value={value.mobileImage} onChange={(v) => v && set({ mobileImage: v })} builtIns={builtIns} allowNone={false} aspect="h-16 w-12" help="Tall, about 4:5 (e.g. 1080 × 1350), the ambassador in the lower half." />
        <Field id={`${id}-a`} label="Photo description (alt text)">
          <AInput id={`${id}-a`} value={value.alt} maxLength={140} onChange={(e) => set({ alt: e.target.value })} />
        </Field>
        <div className="space-y-1.5">
          <ALabel>Signed pieces (up to {max})</ALabel>
          <ProductPicker ids={value.productIds} titles={titles} onTitles={onTitles} onChange={(productIds) => set({ productIds })} max={max} />
          <p className="text-xs text-muted-foreground">Their price, stock and photos come from the product. Set the high price on the product itself.</p>
        </div>
      </div>
    </fieldset>
  );
}

// ── Limited edition fields ───────────────────────────────────────────────────────────────────────

function LimitedFields({ value, onChange, builtIns, titles, onTitles, max, editionMax, disabled }: { value: StoredLimited; onChange: (v: StoredLimited) => void; builtIns: string[]; titles: Record<string, string>; onTitles: (t: Record<string, string>) => void; max: number; editionMax: number; disabled: boolean }) {
  const id = useId();
  const set = (patch: Partial<StoredLimited>) => onChange({ ...value, ...patch });
  return (
    <fieldset disabled={disabled} className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Check id={`${id}-on`} checked={value.enabled} onChange={(v) => set({ enabled: v })} label="Show this section on the homepage" />
        <Field id={`${id}-e`} label="Small line" help="e.g. Limited edition · Numbered & signed (optional, up to 50)">
          <AInput id={`${id}-e`} value={value.eyebrow} maxLength={50} onChange={(e) => set({ eyebrow: e.target.value })} />
        </Field>
        <BigLines id={id} line1={value.line1} line2={value.line2} onChange={(line1, line2) => set({ line1, line2 })} />
        <Field id={`${id}-t`} label="Text" help="Up to 240 characters.">
          <ATextarea id={`${id}-t`} rows={3} value={value.text} maxLength={240} onChange={(e) => set({ text: e.target.value })} />
        </Field>
        <Field id={`${id}-s`} label="Pieces in the edition (optional)" help={`Shown as "Edition of …" (1–${editionMax.toLocaleString("en-IN")}). Leave empty to hide.`}>
          <AInput id={`${id}-s`} type="number" inputMode="numeric" min={1} max={editionMax} value={value.editionSize ?? ""} onChange={(e) => set({ editionSize: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <CtaFields id={id} value={value.cta} onChange={(cta) => set({ cta })} help="A page on this store, e.g. /collections/limited" />
      </div>
      <div className="space-y-4">
        <ImagePicker id={`${id}-c`} label="Cut-out (left)" value={value.cutoutImage} onChange={(v) => v && set({ cutoutImage: v })} builtIns={builtIns.filter((b) => !b.includes("/hero-"))} allowNone={false} aspect="h-20 w-16" help="A PNG with a transparent background, e.g. the ambassador holding the piece (portrait, about 4:5)." />
        <Field id={`${id}-ca`} label="Cut-out description (alt text)">
          <AInput id={`${id}-ca`} value={value.cutoutAlt} maxLength={140} onChange={(e) => set({ cutoutAlt: e.target.value })} />
        </Field>
        <ImagePicker id={`${id}-sc`} label="Scene (right, desktop)" value={value.sceneImage} onChange={(v) => v && set({ sceneImage: v })} builtIns={builtIns} allowNone={false} aspect="h-20 w-16" help="A product or campaign photo; it fades into the yellow on its left edge." />
        <ImagePicker id={`${id}-sg`} label="Signature (optional)" value={value.signatureImage ?? null} onChange={(v) => set({ signatureImage: v })} builtIns={[]} allowNone aspect="h-10 w-24" help="The ambassador's real signature: dark ink on a transparent PNG, wide (about 4:1). It writes itself on under the button and adds “Signed” to the stamp. Leave empty if the pieces aren't signed." />
        <div className="space-y-1.5">
          <ALabel>Limited pieces (up to {max})</ALabel>
          <ProductPicker ids={value.productIds} titles={titles} onTitles={onTitles} onChange={(productIds) => set({ productIds })} max={max} />
          <p className="text-xs text-muted-foreground">&ldquo;Pieces left&rdquo; adds up their real stock — set the stock to the edition size in Inventory.</p>
        </div>
      </div>
    </fieldset>
  );
}

// ── Exclusive drop: spotlight + points fields ───────────────────────────────────────────────────

function SpotlightFields({ index, count, value, titles, onTitles, stock, onStockChanged, maxDetails, editionMax, disabled, onChange, onMove, onRemove }: { index: number; count: number; value: StoredSpotlight; titles: Record<string, string>; onTitles: (t: Record<string, string>) => void; stock?: StyleStock; onStockChanged: () => void; maxDetails: number; editionMax: number; disabled: boolean; onChange: (v: StoredSpotlight) => void; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  const id = useId();
  const set = (patch: Partial<StoredSpotlight>) => onChange({ ...value, ...patch });
  const [details, setDetails] = useState(value.details.join("\n"));
  return (
    <fieldset disabled={disabled} className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <legend className="text-sm font-semibold">Spotlight {index + 1}{value.title ? ` — ${value.title}` : ""}</legend>
        <div className="flex items-center">
          <IconButton icon={ArrowUp01Icon} label="Move spotlight up" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton icon={ArrowDown01Icon} label="Move spotlight down" disabled={index === count - 1} onClick={() => onMove(1)} />
          <Confirm trigger={<IconButton icon={Delete02Icon} tone="danger" label="Remove spotlight" disabled={count <= 1} />} title="Remove this spotlight?" description="Nothing changes on the store until you save." confirmLabel="Remove" destructive onConfirm={onRemove} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${id}-l`} label="Small line" help="e.g. Piece 01">
              <AInput id={`${id}-l`} value={value.lead} maxLength={30} onChange={(e) => set({ lead: e.target.value })} />
            </Field>
            <Field id={`${id}-t`} label="Big title" help="e.g. The Hoodie (up to 40)">
              <AInput id={`${id}-t`} value={value.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} />
            </Field>
          </div>
          <Field id={`${id}-d`} label="Details" help={`One per row, up to ${maxDetails} (fabric, fit, signature, certificate…).`}>
            <ATextarea
              id={`${id}-d`}
              rows={4}
              value={details}
              onChange={(e) => {
                setDetails(e.target.value);
                set({ details: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) });
              }}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${id}-s`} label="Hand-signed by (optional)">
              <AInput id={`${id}-s`} value={value.signedBy ?? ""} maxLength={40} onChange={(e) => set({ signedBy: e.target.value || null })} />
            </Field>
            <Field id={`${id}-e`} label="Pieces in the edition (optional)" help={`1–${editionMax.toLocaleString("en-IN")}`}>
              <AInput id={`${id}-e`} type="number" inputMode="numeric" min={1} max={editionMax} value={value.editionSize ?? ""} onChange={(e) => set({ editionSize: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
          </div>
          <Check id={`${id}-r`} checked={value.reverse} onChange={(v) => set({ reverse: v })} label="Photos on the right (desktop)" />
        </div>
        <div className="space-y-1.5">
          <ALabel>Product</ALabel>
          <ProductPicker ids={value.productId ? [value.productId] : []} titles={titles} onTitles={onTitles} onChange={(ids) => set({ productId: ids[0] ?? "" })} max={1} />
          <p className="text-xs text-muted-foreground">Price, photos, colours, sizes and stock come from the product. Its price shows without any MRP or discount.</p>
          {value.productId ? <SpotlightStock stock={stock} onChanged={onStockChanged} /> : null}
        </div>
      </div>
    </fieldset>
  );
}

function PointsFields({ value, onChange, max, disabled }: { value: StoredPoints; onChange: (v: StoredPoints) => void; max: number; disabled: boolean }) {
  const id = useId();
  const set = (patch: Partial<StoredPoints>) => onChange({ ...value, ...patch });
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <Field id={`${id}-t`} label="Title">
        <AInput id={`${id}-t`} value={value.title} maxLength={50} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <div className="grid gap-3 lg:grid-cols-2">
        {value.points.map((pt, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field id={`${id}-p${i}`} label={`Point ${i + 1} title`}>
                  <AInput id={`${id}-p${i}`} value={pt.title} maxLength={30} onChange={(e) => set({ points: value.points.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                </Field>
              </div>
              <IconButton icon={Delete02Icon} tone="danger" label={`Remove point ${i + 1}`} disabled={value.points.length <= 1} onClick={() => set({ points: value.points.filter((_, j) => j !== i) })} />
            </div>
            <ATextarea aria-label={`Point ${i + 1} text`} rows={2} maxLength={160} value={pt.text} onChange={(e) => set({ points: value.points.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
          </div>
        ))}
      </div>
      {value.points.length < max ? (
        <AButton size="sm" variant="outline" onClick={() => set({ points: [...value.points, { title: "", text: "" }] })}>
          <AIcon icon={Add01Icon} /> Add point
        </AButton>
      ) : null}
    </fieldset>
  );
}

/** Live stock of every colour × size of the spotlight's style, with links to edit the product and change stock. */
function SpotlightStock({ stock, onChanged }: { stock?: StyleStock; onChanged: () => void }) {
  const { can } = useAdmin();
  if (!stock) return <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Save the page to see this product&apos;s stock here.</p>;
  const sizes = [...new Set(stock.colours.flatMap((c) => c.sizes.map((x) => x.label)))];
  const total = stock.colours.reduce((n, c) => n + (c.status === "active" ? c.sizes.reduce((m, x) => m + x.stock, 0) : 0), 0);
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Stock · <span className={total === 0 ? "text-red-600" : undefined}>{total} {stock.colours.some((c) => c.status === "active" && c.soldOutHold) ? "in stock" : "on sale"}</span>
          {stock.colours.some((c) => c.status === "active" && c.soldOutHold) ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">Shown as sold out</span> : null}
        </p>
        <div className="flex gap-2">
          <AButton size="sm" variant="outline" asChild>
            <a href={`/admin/catalog/style/${stock.styleId}`} target="_blank" rel="noopener">
              Edit product ↗
            </a>
          </AButton>
          <AButton size="sm" variant="outline" asChild>
            <a href={`/admin/inventory?q=${encodeURIComponent((stock.colours[0]?.sku ?? "").replace(/-[^-]+$/, ""))}`} target="_blank" rel="noopener">
              Manage stock ↗
            </a>
          </AButton>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Colour</th>
              {sizes.map((sz) => (
                <th key={sz} className="px-2 py-1 text-right font-medium">
                  {sz}
                </th>
              ))}
              <th className="py-1 pl-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {stock.colours.map((c) => {
              const row = c.sizes.reduce((n, x) => n + x.stock, 0);
              return (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-1 pr-3">
                    {c.colour}
                    {c.status !== "active" ? <span className="ml-1 text-muted-foreground">({c.status})</span> : null}
                  </td>
                  {sizes.map((sz) => {
                    const n = c.sizes.find((x) => x.label === sz)?.stock;
                    return (
                      <td key={sz} className={cn("px-2 py-1 text-right tabular-nums", n === 0 && "text-red-600", n !== undefined && n > 0 && n <= 3 && "text-orange-600")}>
                        {n ?? "—"}
                      </td>
                    );
                  })}
                  <td className={cn("py-1 pl-2 text-right font-medium tabular-nums", row === 0 && "text-red-600")}>{row}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Red = sold out, orange = 3 or fewer. Customers see &ldquo;N left&rdquo; and &ldquo;Sold out&rdquo; from these numbers.</p>
      <SoldOutHold styleId={stock.styleId} colours={stock.colours} canEdit={can("catalog.write")} onChanged={onChanged} />
    </div>
  );
}
