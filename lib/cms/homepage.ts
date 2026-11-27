import { MASCOT, MASCOT_HERO } from "@/lib/brand/mascot";
import { ValidationError } from "@/lib/http/guard";
import { asObject, cleanText, rejectUnknownFields } from "@/lib/validation";
import type { NavLink } from "./mock";
import type { Device, FigureLook, HeroSlide, HomeBlock } from "./types";

/**
 * Admin → Homepage (own backend): the hero carousel, the campaign band and the SEO block. Stored in the catalogue
 * documents (`homepage`, one versioned JSON document on every engine); a part that was never saved uses the
 * built-in content (lib/cms/mock-home.ts). The other homepage blocks are not editable here yet.
 *
 * Security: everything is validated on the server — plain text with lengths (React escapes it on output), links
 * are same-site paths only (no `javascript:`, no other hosts, no `//`), images are either a photo uploaded to our
 * own media store (`/api/media/med_…`, checked to exist) or one of the built-in brand images (allow-list). Nothing
 * here is ever fetched from a URL an admin typed.
 */
export const HOMEPAGE_LIMITS = { slides: 6, headlineLines: 3, seoGroups: 3, seoLinks: 24, seoParagraphs: 3 } as const;

export interface StoredHeroSlide {
  id: string;
  /** Off = kept in the editor but not shown. */
  enabled: boolean;
  kicker: string;
  headline: string[];
  subline: string;
  cta: { label: string; href: string };
  textTone: "volt" | "white";
  /** `/api/media/med_…` or a built-in image path; null = the placeholder drawing on `fill`. */
  desktopImage: string | null;
  mobileImage: string | null;
  alt: string;
  /** Background colour behind the image / drawing (#rrggbb). */
  fill: string;
  startsAt?: string;
  endsAt?: string;
  /** Omit for both. */
  devices?: Device[];
}

export interface StoredCampaign {
  enabled: boolean;
  kicker: string;
  headline: string[];
  text: string;
  cta: { label: string; href: string };
  image: string;
  alt: string;
  /** Panel colour so the image edge disappears; null = none. */
  bg: string | null;
}

export interface StoredSeo {
  heading: string;
  groups: { title: string; links: NavLink[] }[];
  text: string[];
}

export interface HomepageContent {
  hero?: StoredHeroSlide[];
  campaign?: StoredCampaign;
  seo?: StoredSeo;
}

// ── Images ─────────────────────────────────────────────────────────────────────────────────────────

const MEDIA_RE = /^\/api\/media\/(med_[a-f0-9]{32})$/;
/** Built-in brand images an admin may pick (everything under /public/mascot that the store already ships). */
export const BUILTIN_IMAGES: readonly string[] = [
  ...Object.values(MASCOT_HERO).flatMap((h) => [h.desktop, h.mobile]),
  ...Object.values(MASCOT).map((m) => m.src),
];
const BUILTIN = new Set(BUILTIN_IMAGES);
const builtinBg = new Map<string, string | null>(Object.values(MASCOT).map((m) => [m.src, m.bg]));

/** Media ids used by the content (to check they exist before saving). */
export function mediaIdsOf(c: HomepageContent): string[] {
  const paths = [...(c.hero ?? []).flatMap((s) => [s.desktopImage, s.mobileImage]), c.campaign?.image ?? null];
  return paths.map((p) => (p ? MEDIA_RE.exec(p)?.[1] : undefined)).filter((x): x is string => !!x);
}

function imagePath(v: unknown, where: string, nullable: true): string | null;
function imagePath(v: unknown, where: string, nullable: false): string;
function imagePath(v: unknown, where: string, nullable: boolean): string | null {
  if ((v === null || v === undefined || v === "") && nullable) return null;
  if (typeof v === "string" && (MEDIA_RE.test(v) || BUILTIN.has(v))) return v;
  throw new ValidationError(`${where}: choose an uploaded photo or one of the built-in images.`);
}

// ── Field validators ────────────────────────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
/** Same-site path: starts with one "/", no "//" or "\" tricks, plain URL characters only. */
export const INTERNAL_HREF_RE = /^\/(?![/\\])[A-Za-z0-9/_\-?=&.%+#~]{0,200}$/;
const ID_RE = /^[a-z0-9-]{1,40}$/;

const text = (v: unknown, where: string, min: number, max: number) => (v === undefined || v === null ? (min ? cleanText("", where, { min, max }) : "") : cleanText(v, where, { min, max }));

function href(v: unknown, where: string): string {
  if (typeof v !== "string" || !INTERNAL_HREF_RE.test(v.trim())) throw new ValidationError(`${where}: use a link on this store that starts with “/”, e.g. /collections/new-in.`);
  return v.trim();
}

function cta(v: unknown, where: string) {
  const o = asObject(v);
  rejectUnknownFields(o, ["label", "href"]);
  return { label: text(o.label, `${where} button text`, 2, 30), href: href(o.href, `${where} button link`) };
}

function lines(v: unknown, where: string, max: number): string[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > HOMEPAGE_LIMITS.headlineLines) throw new ValidationError(`${where}: 1–${HOMEPAGE_LIMITS.headlineLines} headline lines.`);
  return v.map((l, i) => text(l, `${where} headline line ${i + 1}`, 1, max));
}

function isoOrUndefined(v: unknown, where: string): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw new ValidationError(`${where}: enter a valid date and time.`);
  return new Date(v).toISOString();
}

// ── Parse (admin save) ──────────────────────────────────────────────────────────────────────────────

export function parseHeroSlides(raw: unknown): StoredHeroSlide[] {
  if (!Array.isArray(raw) || raw.length > HOMEPAGE_LIMITS.slides) throw new ValidationError(`The hero holds at most ${HOMEPAGE_LIMITS.slides} slides.`);
  const seen = new Set<string>();
  const slides = raw.map((r, i) => {
    const where = `Slide ${i + 1}`;
    const o = asObject(r);
    rejectUnknownFields(o, ["id", "enabled", "kicker", "headline", "subline", "cta", "textTone", "desktopImage", "mobileImage", "alt", "fill", "startsAt", "endsAt", "devices"]);
    const id = typeof o.id === "string" && ID_RE.test(o.id) ? o.id : `slide-${i + 1}`;
    if (seen.has(id)) throw new ValidationError(`${where}: two slides share the id “${id}”.`);
    seen.add(id);
    const desktopImage = imagePath(o.desktopImage, `${where} desktop image`, true);
    const mobileImage = imagePath(o.mobileImage, `${where} mobile image`, true);
    const alt = text(o.alt, `${where} image description`, desktopImage || mobileImage ? 4 : 0, 140);
    if (o.fill !== undefined && (typeof o.fill !== "string" || !HEX_RE.test(o.fill))) throw new ValidationError(`${where}: pick a background colour.`);
    if (o.textTone !== "volt" && o.textTone !== "white") throw new ValidationError(`${where}: pick the headline colour.`);
    const startsAt = isoOrUndefined(o.startsAt, `${where} start`);
    const endsAt = isoOrUndefined(o.endsAt, `${where} end`);
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new ValidationError(`${where}: the end must be after the start.`);
    let devices: Device[] | undefined;
    if (o.devices !== undefined && o.devices !== null) {
      if (!Array.isArray(o.devices) || o.devices.length < 1 || o.devices.some((d) => d !== "mobile" && d !== "desktop")) throw new ValidationError(`${where}: show on mobile, desktop or both.`);
      devices = o.devices.length === 2 ? undefined : (o.devices as Device[]);
    }
    return {
      id,
      enabled: o.enabled !== false,
      kicker: text(o.kicker, `${where} small line`, 0, 60),
      headline: lines(o.headline, where, 24),
      subline: text(o.subline, `${where} text`, 0, 160),
      cta: cta(o.cta, where),
      textTone: o.textTone,
      desktopImage,
      mobileImage,
      alt,
      fill: typeof o.fill === "string" ? o.fill.toLowerCase() : "#0a0a0a",
      ...(startsAt ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {}),
      ...(devices ? { devices } : {}),
    } satisfies StoredHeroSlide;
  });
  if (slides.length > 0 && !slides.some((s) => s.enabled)) throw new ValidationError("Switch on at least one slide, or remove them all to use the built-in slides.");
  return slides;
}

export function parseCampaign(raw: unknown): StoredCampaign {
  const o = asObject(raw);
  rejectUnknownFields(o, ["enabled", "kicker", "headline", "text", "cta", "image", "alt", "bg"]);
  const image = imagePath(o.image, "Campaign image", false);
  if (o.bg !== null && o.bg !== undefined && (typeof o.bg !== "string" || !HEX_RE.test(o.bg))) throw new ValidationError("Campaign: pick a panel colour or none.");
  return {
    enabled: o.enabled !== false,
    kicker: text(o.kicker, "Campaign small line", 0, 40),
    headline: lines(o.headline, "Campaign", 28),
    text: text(o.text, "Campaign text", 0, 240),
    cta: cta(o.cta, "Campaign"),
    image,
    alt: text(o.alt, "Campaign image description", 4, 140),
    bg: typeof o.bg === "string" ? o.bg.toLowerCase() : null,
  };
}

export function parseSeo(raw: unknown): StoredSeo {
  const o = asObject(raw);
  rejectUnknownFields(o, ["heading", "groups", "text"]);
  if (!Array.isArray(o.groups) || o.groups.length > HOMEPAGE_LIMITS.seoGroups) throw new ValidationError(`The SEO block holds at most ${HOMEPAGE_LIMITS.seoGroups} link groups.`);
  if (!Array.isArray(o.text) || o.text.length > HOMEPAGE_LIMITS.seoParagraphs) throw new ValidationError(`The SEO block holds at most ${HOMEPAGE_LIMITS.seoParagraphs} paragraphs.`);
  return {
    heading: text(o.heading, "SEO heading", 4, 80),
    groups: o.groups.map((g, i) => {
      const go = asObject(g);
      rejectUnknownFields(go, ["title", "links"]);
      const title = text(go.title, `Link group ${i + 1} title`, 2, 40);
      if (!Array.isArray(go.links) || go.links.length < 1 || go.links.length > HOMEPAGE_LIMITS.seoLinks) throw new ValidationError(`${title}: 1–${HOMEPAGE_LIMITS.seoLinks} links.`);
      return {
        title,
        links: go.links.map((l, j) => {
          const lo = asObject(l);
          rejectUnknownFields(lo, ["label", "href"]);
          return { label: text(lo.label, `${title} link ${j + 1} text`, 2, 40), href: href(lo.href, `${title} link ${j + 1}`) };
        }),
      };
    }),
    text: o.text.map((p, i) => text(p, `SEO paragraph ${i + 1}`, 20, 600)),
  };
}

/**
 * The admin's save body `{ hero?, campaign?, seo? }`: each part is either the new content or `null` (go back to the
 * built-in content). Parts left out keep what is stored.
 */
export function parseHomepage(body: Record<string, unknown>, current: HomepageContent | undefined): HomepageContent {
  rejectUnknownFields(body, ["revision", "hero", "campaign", "seo"]);
  const next: HomepageContent = { ...(current ?? {}) };
  if (body.hero !== undefined) {
    if (body.hero === null) delete next.hero;
    else next.hero = parseHeroSlides(body.hero);
    if (next.hero?.length === 0) delete next.hero;
  }
  if (body.campaign !== undefined) {
    if (body.campaign === null) delete next.campaign;
    else next.campaign = parseCampaign(body.campaign);
  }
  if (body.seo !== undefined) {
    if (body.seo === null) delete next.seo;
    else next.seo = parseSeo(body.seo);
  }
  return next;
}

// ── Built-in content (what the editor starts from) ──────────────────────────────────────────────────

const DEFAULT_LOOK: FigureLook = { top: "#151515", bottom: "#151515", skin: "#C9946B" };

/** The built-in parts in the stored shape, so "Customise" starts from what the store shows today. */
export function builtInContent(blocks: HomeBlock[]): Required<HomepageContent> {
  const hero = blocks.find((b) => b.type === "hero");
  const campaign = blocks.find((b) => b.type === "campaign_band");
  const seo = blocks.find((b) => b.type === "seo");
  return {
    hero:
      hero?.type === "hero"
        ? hero.slides.map((s) => ({
            id: s.id,
            enabled: true,
            kicker: s.kicker,
            headline: s.headline,
            subline: s.subline,
            cta: s.cta,
            textTone: s.textTone,
            desktopImage: s.image?.desktop ?? null,
            mobileImage: s.image?.mobile ?? null,
            alt: s.image?.alt ?? "",
            fill: s.placeholder.fill,
          }))
        : [],
    campaign:
      campaign?.type === "campaign_band"
        ? { enabled: true, kicker: campaign.kicker, headline: campaign.headline, text: campaign.text, cta: campaign.cta, image: campaign.image.src, alt: campaign.image.alt, bg: campaign.image.bg }
        : { enabled: false, kicker: "", headline: ["New season"], text: "", cta: { label: "Shop now", href: "/collections/new-in" }, image: MASCOT["scene-22-the-pack"].src, alt: "Campaign image", bg: null },
    seo: seo?.type === "seo" ? { heading: seo.heading, groups: seo.groups, text: seo.text } : { heading: "More about shopping with us", groups: [], text: [] },
  };
}

// ── Apply (storefront) ──────────────────────────────────────────────────────────────────────────────

function heroSlide(s: StoredHeroSlide): HeroSlide {
  const desktop = s.desktopImage ?? s.mobileImage;
  const mobile = s.mobileImage ?? s.desktopImage;
  return {
    id: s.id,
    kicker: s.kicker,
    headline: s.headline,
    subline: s.subline,
    cta: s.cta,
    textTone: s.textTone,
    ...(desktop && mobile ? { image: { desktop, mobile, alt: s.alt } } : {}),
    placeholder: { fill: s.fill, look: DEFAULT_LOOK },
    ...(s.startsAt ? { startsAt: s.startsAt } : {}),
    ...(s.endsAt ? { endsAt: s.endsAt } : {}),
    ...(s.devices ? { devices: s.devices } : {}),
  };
}

/** The homepage blocks with the admin's content in place of the built-in hero / campaign / SEO. */
export function applyHomepage(blocks: HomeBlock[], content: HomepageContent | null | undefined): HomeBlock[] {
  if (!content) return blocks;
  const out: HomeBlock[] = [];
  for (const block of blocks) {
    if (block.type === "hero" && content.hero) {
      const slides = content.hero.filter((s) => s.enabled).map(heroSlide);
      if (slides.length) out.push({ ...block, slides });
      continue;
    }
    if (block.type === "campaign_band" && content.campaign) {
      const c = content.campaign;
      if (!c.enabled) continue;
      out.push({
        ...block,
        kicker: c.kicker,
        headline: c.headline,
        text: c.text,
        cta: c.cta,
        image: { src: c.image, width: 1200, height: 1500, bg: c.bg ?? (builtinBg.get(c.image) ?? null), alt: c.alt },
      });
      continue;
    }
    if (block.type === "seo" && content.seo) {
      out.push({ ...block, heading: content.seo.heading, groups: content.seo.groups, text: content.seo.text });
      continue;
    }
    out.push(block);
  }
  return out;
}
