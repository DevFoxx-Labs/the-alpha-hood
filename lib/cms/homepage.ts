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
export const HOMEPAGE_LIMITS = { slides: 6, headlineLines: 3, seoGroups: 3, seoLinks: 24, seoParagraphs: 3, ambassadorProducts: 4, limitedProducts: 3, editionMax: 100_000, spotlights: 6, spotlightDetails: 5, points: 4 } as const;

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

export interface StoredAmbassador {
  enabled: boolean;
  eyebrow: string;
  line1: string;
  line2: string;
  text: string;
  ambassadorName: string;
  cta: { label: string; href: string };
  desktopImage: string;
  mobileImage: string;
  alt: string;
  productIds: string[];
}

export interface StoredLimited {
  enabled: boolean;
  eyebrow: string;
  line1: string;
  line2: string;
  text: string;
  cta: { label: string; href: string };
  editionSize: number | null;
  cutoutImage: string;
  cutoutAlt: string;
  sceneImage: string;
  productIds: string[];
}

export interface StoredSpotlight {
  lead: string;
  title: string;
  productId: string;
  details: string[];
  signedBy: string | null;
  editionSize: number | null;
  reverse: boolean;
}

export interface StoredPoints {
  title: string;
  points: { title: string; text: string }[];
}

export type LandingLayout = "store" | "drop";

/** The "Exclusive drop" landing page's own parts (hero and SEO differ from the full store's). */
export interface StoredDrop {
  hero?: StoredHeroSlide[];
  seo?: StoredSeo;
  spotlights?: StoredSpotlight[];
  points?: StoredPoints;
}

export interface HomepageContent {
  /** Which landing page the store shows. Absent = "store" (the full catalogue page). */
  layout?: LandingLayout;
  /** Parts used only by the "Exclusive drop" layout. */
  drop?: StoredDrop;
  hero?: StoredHeroSlide[];
  campaign?: StoredCampaign;
  seo?: StoredSeo;
  /** Brand-ambassador exclusives band. */
  ambassador?: StoredAmbassador;
  /** Limited-edition drop (pinned finale). */
  limited?: StoredLimited;
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
  const paths = [
    ...(c.hero ?? []).flatMap((s) => [s.desktopImage, s.mobileImage]),
    ...(c.drop?.hero ?? []).flatMap((s) => [s.desktopImage, s.mobileImage]),
    c.campaign?.image ?? null,
    c.ambassador?.desktopImage ?? null,
    c.ambassador?.mobileImage ?? null,
    c.limited?.cutoutImage ?? null,
    c.limited?.sceneImage ?? null,
  ];
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

const PRODUCT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function productIds(v: unknown, where: string, max: number): string[] {
  if (!Array.isArray(v) || v.length > max) throw new ValidationError(`${where}: pick up to ${max} products.`);
  const seen = new Set<string>();
  for (const id of v) {
    if (typeof id !== "string" || !PRODUCT_ID_RE.test(id)) throw new ValidationError(`${where}: a picked product is invalid. Pick it again.`);
    if (seen.has(id)) throw new ValidationError(`${where}: a product is picked twice.`);
    seen.add(id);
  }
  return v as string[];
}

/** One giant display line (fits the full width at the size the band uses). */
const bigLine = (v: unknown, where: string) => text(v, where, 2, 16);

export function parseAmbassador(raw: unknown): StoredAmbassador {
  const o = asObject(raw);
  rejectUnknownFields(o, ["enabled", "eyebrow", "line1", "line2", "text", "ambassadorName", "cta", "desktopImage", "mobileImage", "alt", "productIds"]);
  return {
    enabled: o.enabled !== false,
    eyebrow: text(o.eyebrow, "Ambassador small line", 0, 50),
    line1: bigLine(o.line1, "Ambassador headline line 1"),
    line2: bigLine(o.line2, "Ambassador headline line 2"),
    text: text(o.text, "Ambassador text", 0, 240),
    ambassadorName: text(o.ambassadorName, "Ambassador name", 2, 40),
    cta: cta(o.cta, "Ambassador"),
    desktopImage: imagePath(o.desktopImage, "Ambassador desktop image", false),
    mobileImage: imagePath(o.mobileImage, "Ambassador mobile image", false),
    alt: text(o.alt, "Ambassador image description", 4, 140),
    productIds: productIds(o.productIds ?? [], "Ambassador products", HOMEPAGE_LIMITS.ambassadorProducts),
  };
}

export function parseLimited(raw: unknown): StoredLimited {
  const o = asObject(raw);
  rejectUnknownFields(o, ["enabled", "eyebrow", "line1", "line2", "text", "cta", "editionSize", "cutoutImage", "cutoutAlt", "sceneImage", "productIds"]);
  let editionSize: number | null = null;
  if (o.editionSize !== null && o.editionSize !== undefined && o.editionSize !== "") {
    if (typeof o.editionSize !== "number" || !Number.isSafeInteger(o.editionSize) || o.editionSize < 1 || o.editionSize > HOMEPAGE_LIMITS.editionMax) throw new ValidationError(`Limited edition: pieces must be a whole number from 1 to ${HOMEPAGE_LIMITS.editionMax}.`);
    editionSize = o.editionSize;
  }
  return {
    enabled: o.enabled !== false,
    eyebrow: text(o.eyebrow, "Limited edition small line", 0, 50),
    line1: bigLine(o.line1, "Limited edition headline line 1"),
    line2: bigLine(o.line2, "Limited edition headline line 2"),
    text: text(o.text, "Limited edition text", 0, 240),
    cta: cta(o.cta, "Limited edition"),
    editionSize,
    cutoutImage: imagePath(o.cutoutImage, "Limited edition cut-out", false),
    cutoutAlt: text(o.cutoutAlt, "Limited edition cut-out description", 4, 140),
    sceneImage: imagePath(o.sceneImage, "Limited edition scene", false),
    productIds: productIds(o.productIds ?? [], "Limited edition products", HOMEPAGE_LIMITS.limitedProducts),
  };
}

/** Product ids the content points at (checked against the catalogue before saving). */
export const productIdsOf = (c: HomepageContent) => [...(c.ambassador?.productIds ?? []), ...(c.limited?.productIds ?? []), ...(c.drop?.spotlights ?? []).map((s) => s.productId)];

export function parseSpotlights(raw: unknown): StoredSpotlight[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > HOMEPAGE_LIMITS.spotlights) throw new ValidationError(`The drop shows 1–${HOMEPAGE_LIMITS.spotlights} product spotlights.`);
  const seen = new Set<string>();
  return raw.map((r, i) => {
    const where = `Spotlight ${i + 1}`;
    const o = asObject(r);
    rejectUnknownFields(o, ["lead", "title", "productId", "details", "signedBy", "editionSize", "reverse"]);
    const [productId] = productIds([o.productId], where, 1);
    if (seen.has(productId)) throw new ValidationError(`${where}: this product already has a spotlight.`);
    seen.add(productId);
    if (!Array.isArray(o.details) || o.details.length > HOMEPAGE_LIMITS.spotlightDetails) throw new ValidationError(`${where}: up to ${HOMEPAGE_LIMITS.spotlightDetails} detail lines.`);
    let editionSize: number | null = null;
    if (o.editionSize !== null && o.editionSize !== undefined && o.editionSize !== "") {
      if (typeof o.editionSize !== "number" || !Number.isSafeInteger(o.editionSize) || o.editionSize < 1 || o.editionSize > HOMEPAGE_LIMITS.editionMax) throw new ValidationError(`${where}: pieces must be a whole number from 1 to ${HOMEPAGE_LIMITS.editionMax}.`);
      editionSize = o.editionSize;
    }
    const signed = o.signedBy === null || o.signedBy === undefined || o.signedBy === "" ? null : text(o.signedBy, `${where} signed by`, 2, 40);
    return {
      lead: text(o.lead, `${where} small line`, 0, 30),
      title: text(o.title, `${where} title`, 2, 40),
      productId,
      details: o.details.map((d, j) => text(d, `${where} detail ${j + 1}`, 2, 80)),
      signedBy: signed,
      editionSize,
      reverse: o.reverse === true,
    };
  });
}

export function parsePoints(raw: unknown): StoredPoints {
  const o = asObject(raw);
  rejectUnknownFields(o, ["title", "points"]);
  if (!Array.isArray(o.points) || o.points.length < 1 || o.points.length > HOMEPAGE_LIMITS.points) throw new ValidationError(`"Why it's exclusive": 1–${HOMEPAGE_LIMITS.points} points.`);
  return {
    title: text(o.title, "“Why it's exclusive” title", 2, 50),
    points: o.points.map((p, i) => {
      const po = asObject(p);
      rejectUnknownFields(po, ["title", "text"]);
      return { title: text(po.title, `Point ${i + 1} title`, 2, 30), text: text(po.text, `Point ${i + 1} text`, 4, 160) };
    }),
  };
}

/** `drop` in the save body: each part content or null (built-in); parts left out keep what is stored. */
export function parseDrop(raw: unknown, current: StoredDrop | undefined): StoredDrop {
  const o = asObject(raw);
  rejectUnknownFields(o, ["hero", "seo", "spotlights", "points"]);
  const next: StoredDrop = { ...(current ?? {}) };
  if (o.hero !== undefined) {
    if (o.hero === null) delete next.hero;
    else next.hero = parseHeroSlides(o.hero);
    if (next.hero?.length === 0) delete next.hero;
  }
  if (o.seo !== undefined) {
    if (o.seo === null) delete next.seo;
    else next.seo = parseSeo(o.seo);
  }
  if (o.spotlights !== undefined) {
    if (o.spotlights === null) delete next.spotlights;
    else next.spotlights = parseSpotlights(o.spotlights);
  }
  if (o.points !== undefined) {
    if (o.points === null) delete next.points;
    else next.points = parsePoints(o.points);
  }
  return next;
}

/**
 * The admin's save body `{ hero?, campaign?, seo?, ambassador?, limited? }`: each part is either the new content or
 * `null` (go back to the built-in content). Parts left out keep what is stored.
 */
export function parseHomepage(body: Record<string, unknown>, current: HomepageContent | undefined): HomepageContent {
  rejectUnknownFields(body, ["revision", "layout", "drop", "hero", "campaign", "seo", "ambassador", "limited"]);
  const next: HomepageContent = { ...(current ?? {}) };
  if (body.layout !== undefined) {
    // null = no admin choice: follow LANDING_LAYOUT (or the full store).
    if (body.layout === null) delete next.layout;
    else if (body.layout !== "store" && body.layout !== "drop") throw new ValidationError("Choose the landing page: full store, exclusive drop, or follow the environment.");
    else next.layout = body.layout;
  }
  if (body.drop !== undefined) {
    if (body.drop === null) delete next.drop;
    else next.drop = parseDrop(body.drop, current?.drop);
  }
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
  if (body.ambassador !== undefined) {
    if (body.ambassador === null) delete next.ambassador;
    else next.ambassador = parseAmbassador(body.ambassador);
  }
  if (body.limited !== undefined) {
    if (body.limited === null) delete next.limited;
    else next.limited = parseLimited(body.limited);
  }
  return next;
}

// ── Built-in content (what the editor starts from) ──────────────────────────────────────────────────

const DEFAULT_LOOK: FigureLook = { top: "#151515", bottom: "#151515", skin: "#C9946B" };

const heroOf = (blocks: HomeBlock[]): StoredHeroSlide[] => {
  const hero = blocks.find((b) => b.type === "hero");
  return hero?.type === "hero"
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
    : [];
};
const seoOf = (blocks: HomeBlock[]): StoredSeo => {
  const seo = blocks.find((b) => b.type === "seo");
  return seo?.type === "seo" ? { heading: seo.heading, groups: seo.groups, text: seo.text } : { heading: "More about shopping with us", groups: [], text: [] };
};

/** The built-in drop parts in the stored shape (spotlight product ids are empty: the admin picks them). */
export function builtInDrop(dropBlocks: HomeBlock[]): Required<StoredDrop> {
  const points = dropBlocks.find((b) => b.type === "exclusive_points");
  return {
    hero: heroOf(dropBlocks),
    seo: seoOf(dropBlocks),
    spotlights: dropBlocks.flatMap((b) =>
      b.type === "product_spotlight" ? [{ lead: b.lead, title: b.title, productId: b.productId, details: b.details, signedBy: b.signedBy, editionSize: b.editionSize, reverse: b.reverse }] : [],
    ),
    points: points?.type === "exclusive_points" ? { title: points.title, points: points.points } : { title: "Why it's exclusive", points: [] },
  };
}

/** The built-in parts in the stored shape, so "Customise" starts from what the store shows today. */
export function builtInContent(blocks: HomeBlock[], dropBlocks: HomeBlock[] = []): Required<HomepageContent> {
  const hero = blocks.find((b) => b.type === "hero");
  const campaign = blocks.find((b) => b.type === "campaign_band");
  const amb = blocks.find((b) => b.type === "ambassador");
  const ltd = blocks.find((b) => b.type === "limited_edition");
  const strip = <T extends { type: string; id: string }>(b: T) => {
    const { type: _t, id: _i, ...rest } = b;
    void _t;
    void _i;
    return rest;
  };
  void hero;
  return {
    layout: "store",
    drop: builtInDrop(dropBlocks),
    ambassador:
      amb?.type === "ambassador"
        ? { enabled: true, ...(strip(amb) as Omit<StoredAmbassador, "enabled">) }
        : { enabled: false, eyebrow: "", line1: "Signed by", line2: "our ambassador", text: "", ambassadorName: "Ambassador", cta: { label: "Shop now", href: "/collections/new-in" }, desktopImage: MASCOT_HERO["hood-up"].desktop, mobileImage: MASCOT_HERO["hood-up"].mobile, alt: "Brand ambassador", productIds: [] },
    limited:
      ltd?.type === "limited_edition"
        ? { enabled: true, ...(strip(ltd) as Omit<StoredLimited, "enabled">) }
        : { enabled: false, eyebrow: "", line1: "Limited", line2: "Edition.", text: "", cta: { label: "Shop the drop", href: "/collections/new-in" }, editionSize: null, cutoutImage: MASCOT["alpha-01-hero-stance"].src, cutoutAlt: "Limited edition", sceneImage: MASCOT["scene-25-lookbook"].src, productIds: [] },
    hero: heroOf(blocks),
    campaign:
      campaign?.type === "campaign_band"
        ? { enabled: true, kicker: campaign.kicker, headline: campaign.headline, text: campaign.text, cta: campaign.cta, image: campaign.image.src, alt: campaign.image.alt, bg: campaign.image.bg }
        : { enabled: false, kicker: "", headline: ["New season"], text: "", cta: { label: "Shop now", href: "/collections/new-in" }, image: MASCOT["scene-22-the-pack"].src, alt: "Campaign image", bg: null },
    seo: seoOf(blocks),
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

/**
 * `LANDING_LAYOUT` environment variable: "drop" or "store" — the deployment's default landing page, used while the
 * admin hasn't chosen one. Empty / anything else = not set.
 */
export function envLandingLayout(env: Record<string, string | undefined> = process.env): LandingLayout | null {
  const v = env.LANDING_LAYOUT?.trim().toLowerCase();
  return v === "drop" || v === "store" ? v : null;
}

/**
 * Which landing page is live, in this order: the admin's choice (Admin → Homepage → Landing page layout), else
 * `LANDING_LAYOUT`, else the full store. "Follow the environment" in the admin clears the admin's choice.
 */
export const landingLayout = (content: HomepageContent | null | undefined, env: Record<string, string | undefined> = process.env): LandingLayout =>
  content?.layout === "drop" || content?.layout === "store" ? content.layout : (envLandingLayout(env) ?? "store");

/**
 * The homepage blocks with the admin's content in place of the built-in parts. `blocks` is the built-in list of the
 * live layout (full store or drop); for the drop, its own hero / SEO / spotlights / points are used.
 */
export function applyHomepage(blocks: HomeBlock[], content: HomepageContent | null | undefined, layout: LandingLayout = "store"): HomeBlock[] {
  if (!content) return blocks;
  const drop = layout === "drop" ? content.drop : undefined;
  const heroContent = layout === "drop" ? drop?.hero : content.hero;
  const seoContent = layout === "drop" ? drop?.seo : content.seo;
  let spotlightsDone = false;
  const out: HomeBlock[] = [];
  for (const block of blocks) {
    if (block.type === "product_spotlight" && drop?.spotlights) {
      // The admin's list replaces the built-in spotlights, at the first one's place.
      if (!spotlightsDone) {
        spotlightsDone = true;
        drop.spotlights.forEach((sp, i) => out.push({ ...block, id: `spotlight-${i + 1}`, ...sp, demoCategory: undefined }));
      }
      continue;
    }
    if (block.type === "exclusive_points" && drop?.points) {
      out.push({ ...block, title: drop.points.title, points: drop.points.points });
      continue;
    }
    if (block.type === "hero" && heroContent) {
      const slides = heroContent.filter((s) => s.enabled).map(heroSlide);
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
    if (block.type === "seo" && seoContent) {
      out.push({ ...block, heading: seoContent.heading, groups: seoContent.groups, text: seoContent.text });
      continue;
    }
    if (block.type === "ambassador" && content.ambassador) {
      const { enabled, ...rest } = content.ambassador;
      if (enabled) out.push({ ...block, ...rest });
      continue;
    }
    if (block.type === "limited_edition" && content.limited) {
      const { enabled, ...rest } = content.limited;
      if (enabled) out.push({ ...block, ...rest });
      continue;
    }
    out.push(block);
  }
  return out;
}
