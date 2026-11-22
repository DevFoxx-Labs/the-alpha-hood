export type NoticeLang = "en" | "hi";

export type NoticeBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] };

export interface NoticeSection {
  id: string;
  heading: string;
  blocks: NoticeBlock[];
}

export interface NoticeText {
  title: string;
  summary: string;
  sections: NoticeSection[];
}

export type NoticeSlug = "privacy" | "terms" | "refund-cancellation" | "cookies";

export interface Notice {
  slug: NoticeSlug;
  /** ISO date; bump on every material change. Recorded in the consent ledger as `slug@version`. */
  version: string;
  lastUpdated: string;
  text: Partial<Record<NoticeLang, NoticeText>> & { en: NoticeText };
}
