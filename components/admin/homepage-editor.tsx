"use client";

import { Add01Icon, ArrowDown01Icon, ArrowUp01Icon, Delete02Icon, ImageUpload01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import Image from "next/image";
import { useEffect, useId, useState } from "react";
import type { HomepageContent, StoredCampaign, StoredHeroSlide, StoredSeo } from "@/lib/cms/homepage";
import { cn } from "@/lib/utils";
import { adminApi, notify, useAdmin } from "./admin-shell";
import { AButton, AIcon, AInput, ALabel, ASelect, ATextarea, Card, Confirm, ErrorState, FormDialog, PageHeader, StatusBadge } from "./ui";

/**
 * Admin → Homepage: hero carousel, campaign band, SEO block. Each part is either the built-in content or the
 * admin's own; "Customise" starts from what the store shows today, "Use built-in" goes back. The screen only
 * collects choices — the server (lib/cms/homepage.ts) validates every field, link and image and refuses a stale save.
 */
interface View {
  revision: number;
  content: HomepageContent;
  builtIn: Required<HomepageContent>;
  builtInImages: string[];
  limits: { slides: number; headlineLines: number; seoGroups: number; seoLinks: number; seoParagraphs: number };
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
  const [hero, setHero] = useState<StoredHeroSlide[] | null>(null);
  const [campaign, setCampaign] = useState<StoredCampaign | null>(null);
  const [seo, setSeo] = useState<StoredSeo | null>(null);
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
        setHero(v.content.hero ?? null);
        setCampaign(v.content.campaign ?? null);
        setSeo(v.content.seo ?? null);
        setDirty(false);
        setError(null);
      })
      .catch((e) => !cancelled && setError(errText(e, "Couldn't load.")));
    return () => {
      cancelled = true;
    };
  }, [nonce]);
  const reload = () => setNonce((n) => n + 1);
  const change = <T,>(set: (v: T) => void) => (v: T) => (set(v), setDirty(true));
  const editHero = change(setHero);
  const editCampaign = change(setCampaign);
  const editSeo = change(setSeo);

  async function save() {
    if (!view) return;
    setSaving(true);
    try {
      await adminApi("/api/admin/homepage", { method: "PUT", body: { revision: view.revision, hero, campaign, seo } });
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
  const slides = hero ?? view.builtIn.hero;

  return (
    <div className="space-y-5 pb-20">
      <PageHeader title="Homepage" description="The hero carousel, the campaign band and the SEO links on the home page. Categories on the homepage are set in Categories → Homepage category rail." />

      {/* ── Hero ── */}
      <Card
        title={`Hero carousel · ${slides.length} slide${slides.length === 1 ? "" : "s"}`}
        action={
          canEdit ? (
            hero === null ? (
              <AButton size="sm" onClick={() => editHero(view.builtIn.hero.map((s) => ({ ...s })))}>
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
        title="SEO block (bottom of the homepage)"
        action={
          canEdit ? (
            seo === null ? (
              <AButton size="sm" onClick={() => editSeo({ ...view.builtIn.seo })}>
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
            Showing the built-in block: {view.builtIn.seo.groups.map((g) => `${g.title} (${g.links.length} links)`).join(", ")} and {view.builtIn.seo.text.length} paragraphs.
          </p>
        ) : (
          <SeoFields value={seo} onChange={editSeo} limits={view.limits} disabled={!canEdit} />
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
