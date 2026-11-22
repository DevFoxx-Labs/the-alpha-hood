import { STORE_CONFIG } from "@/lib/config/store";
import { LEGAL_CONFIG, type LegalConfig } from "./config";
import { COOKIES_NOTICE } from "./notices/cookies";
import { PRIVACY_NOTICE } from "./notices/privacy";
import { REFUND_NOTICE } from "./notices/refund";
import { TERMS_NOTICE } from "./notices/terms";
import type { Notice, NoticeBlock, NoticeLang, NoticeSlug, NoticeText } from "./types";

/**
 * Single source for every legal notice (DPDP rule §1). Website pages, `GET /api/legal[/slug]` and, later,
 * the apps all read from here. Contact facts are filled at render time from config.
 */
export const NOTICES: Record<NoticeSlug, Notice> = {
  privacy: PRIVACY_NOTICE,
  terms: TERMS_NOTICE,
  "refund-cancellation": REFUND_NOTICE,
  cookies: COOKIES_NOTICE,
};

export const NOTICE_SLUGS = Object.keys(NOTICES) as NoticeSlug[];

export function isNoticeSlug(value: string): value is NoticeSlug {
  return Object.hasOwn(NOTICES, value);
}

export function noticeLanguages(slug: NoticeSlug): NoticeLang[] {
  return Object.keys(NOTICES[slug].text) as NoticeLang[];
}

/** e.g. `cookies@2026-11-22;privacy@2026-11-22` — stored on every consent ledger row. */
export function noticeVersion(slugs: NoticeSlug[]): string {
  return slugs.map((s) => `${s}@${NOTICES[s].version}`).join(";");
}

export function tokenValues(config: LegalConfig = LEGAL_CONFIG): Record<string, string> {
  return {
    storeName: STORE_CONFIG.name,
    entityName: config.entityName,
    registeredAddress: config.registeredAddress,
    gstin: config.gstin,
    jurisdictionCity: config.jurisdictionCity,
    supportEmail: config.supportEmail,
    supportPhone: config.supportPhone,
    supportHours: config.supportHours,
    privacyEmail: config.privacyEmail,
    grievanceName: config.grievanceName,
    grievanceDesignation: config.grievanceDesignation,
    grievanceEmail: config.grievanceEmail,
    grievancePhone: config.grievancePhone,
    ackHours: String(config.acknowledgeWithinHours),
    resolveDays: String(config.resolveWithinDays),
    returnWindowDays: String(STORE_CONFIG.returnWindowDays),
    damageReportHours: String(STORE_CONFIG.damageReportHours),
    refundInitiateDays: String(STORE_CONFIG.refundInitiateDays),
    minimumAge: String(STORE_CONFIG.minimumAge),
  };
}

const TOKEN_RE = /\{\{(\w+)\}\}/g;

export function fillTokens(text: string, values: Record<string, string>): string {
  return text.replace(TOKEN_RE, (_, key: string) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown legal token {{${key}}}`);
    return values[key];
  });
}

function fillBlock(block: NoticeBlock, v: Record<string, string>): NoticeBlock {
  switch (block.type) {
    case "p":
      return { type: "p", text: fillTokens(block.text, v) };
    case "list":
      return { type: "list", items: block.items.map((i) => fillTokens(i, v)) };
    case "table":
      return {
        type: "table",
        head: block.head.map((h) => fillTokens(h, v)),
        rows: block.rows.map((r) => r.map((c) => fillTokens(c, v))),
      };
  }
}

export interface RenderedNotice extends NoticeText {
  slug: NoticeSlug;
  lang: NoticeLang;
  version: string;
  lastUpdated: string;
  languages: NoticeLang[];
}

export function renderNotice(slug: NoticeSlug, lang: NoticeLang = "en", config?: LegalConfig): RenderedNotice | null {
  const notice = NOTICES[slug];
  const text = notice.text[lang];
  if (!text) return null;
  const v = tokenValues(config);
  return {
    slug,
    lang,
    version: notice.version,
    lastUpdated: notice.lastUpdated,
    languages: noticeLanguages(slug),
    title: fillTokens(text.title, v),
    summary: fillTokens(text.summary, v),
    sections: text.sections.map((s) => ({
      id: s.id,
      heading: fillTokens(s.heading, v),
      blocks: s.blocks.map((b) => fillBlock(b, v)),
    })),
  };
}

export function noticeIndex() {
  return NOTICE_SLUGS.map((slug) => ({
    slug,
    title: NOTICES[slug].text.en.title,
    version: NOTICES[slug].version,
    lastUpdated: NOTICES[slug].lastUpdated,
    languages: noticeLanguages(slug),
  }));
}

export type { Notice, NoticeLang, NoticeSlug } from "./types";
