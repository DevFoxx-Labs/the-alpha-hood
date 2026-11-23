import { TRACKING } from "@/lib/config/tracking";
import { activeCookiePurposes, COOKIE_INVENTORY, PURPOSES } from "@/lib/consent/purposes";
import type { Notice } from "../types";

/**
 * Cookie Policy. The cookie table is generated from COOKIE_INVENTORY (lib/consent/purposes.ts) so the
 * policy can never drift from what the site sets. Bump `version` whenever a cookie or category is added —
 * that re-asks every visitor (lib/consent/cookie.ts).
 */
const active = new Set(activeCookiePurposes(TRACKING));

const categoryLabel = (c: (typeof COOKIE_INVENTORY)[number]["category"]) =>
  c === "necessary" ? "Strictly necessary" : PURPOSES[c].label;

const inUse = (c: (typeof COOKIE_INVENTORY)[number]["category"]) =>
  c === "necessary" || active.has(c) ? "In use" : "Not in use";

export const COOKIES_NOTICE: Notice = {
  slug: "cookies",
  version: "2026-11-25",
  lastUpdated: "2026-11-25",
  text: {
    en: {
      title: "Cookie Policy",
      summary: "Which cookies the store uses, why, and how to change your choices.",
      sections: [
        {
          id: "what",
          heading: "1. What cookies are",
          blocks: [
            {
              type: "p",
              text: "Cookies are small files a website stores in your browser. We also count similar technologies (local storage, pixels) as cookies in this policy.",
            },
          ],
        },
        {
          id: "categories",
          heading: "2. Categories",
          blocks: [
            {
              type: "list",
              items: [
                "Strictly necessary — needed for the store to work and to remember your privacy choices. Always on; no consent needed.",
                `${PURPOSES.analytics.label} — ${PURPOSES.analytics.description} Off unless you accept.`,
                `${PURPOSES.advertising.label} — ${PURPOSES.advertising.description} Off unless you accept.`,
              ],
            },
            {
              type: "p",
              text: "No analytics or advertising script loads, and nothing is sent to those partners, until you accept that category. Closing the banner without choosing counts as \"Reject all\".",
            },
          ],
        },
        {
          id: "list",
          heading: "3. Every cookie we use",
          blocks: [
            {
              type: "table",
              head: ["Cookie", "Purpose", "Category", "Lifetime", "Set by", "Status"],
              rows: COOKIE_INVENTORY.map((c) => [
                c.name,
                c.purpose,
                categoryLabel(c.category),
                c.lifetime,
                c.provider,
                inUse(c.category),
              ]),
            },
          ],
        },
        {
          id: "choices",
          heading: "4. Changing your choices",
          blocks: [
            {
              type: "p",
              text: "Use \"Cookie preferences\" in the footer of any page, or \"Your consents\" (/privacy/consents). When you withdraw a category we delete its cookies and reload the page without it. You can also delete cookies in your browser settings.",
            },
            {
              type: "p",
              text: "We ask again when this policy changes or after 6 months.",
            },
          ],
        },
        {
          id: "contact",
          heading: "5. Contact",
          blocks: [{ type: "p", text: "Questions: {{privacyEmail}}. See also our Privacy Notice (/legal/privacy)." }],
        },
      ],
    },
  },
};
