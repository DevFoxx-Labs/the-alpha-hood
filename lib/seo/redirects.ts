/**
 * CMS-03 301 redirects manager: one list, applied by next.config (`redirects()`), so old URLs (renamed
 * products, retired collections, links from the old site) keep their search ranking. Add a row; the
 * build fails (lib/seo/seo.test.ts) if a rule is unsafe. No imports — next.config loads this file.
 *
 * Rules: `from` is an internal path (Next.js path syntax allowed, e.g. `/old/:slug`); `to` is an internal path
 * (an optional `#anchor` is fine) — never an external URL (no open redirects); no chains or loops.
 */
export interface RedirectRule {
  from: string;
  to: string;
  /** Why it exists — kept for whoever cleans the list up later. */
  note: string;
}

export const REDIRECTS: RedirectRule[] = [
  { from: "/help/returns", to: "/legal/refund-cancellation#returns", note: "CMS-04 returns & exchange page lives in the policy" },
  { from: "/help/cancellation", to: "/legal/refund-cancellation#cancel", note: "CMS-04 cancellation page lives in the policy" },
  { from: "/returns", to: "/legal/refund-cancellation#returns", note: "common guess" },
  { from: "/shipping", to: "/help/shipping", note: "common guess" },
  { from: "/faq", to: "/help/faq", note: "common guess" },
  { from: "/size-guide", to: "/help/size-guide", note: "common guess" },
  { from: "/privacy-policy", to: "/legal/privacy", note: "common guess" },
  { from: "/terms", to: "/legal/terms", note: "common guess" },
  { from: "/terms-and-conditions", to: "/legal/terms", note: "common guess" },
  { from: "/cookie-policy", to: "/legal/cookies", note: "common guess" },
  { from: "/refund-policy", to: "/legal/refund-cancellation", note: "common guess" },
];

const PATH = /^\/(?!\/)[A-Za-z0-9\-._~/:*()]*$/;

/** Returns the problems in a redirect list (empty = safe). */
export function redirectProblems(rules: RedirectRule[]): string[] {
  const problems: string[] = [];
  const froms = new Map<string, number>();
  const strip = (p: string) => p.split("#")[0];
  rules.forEach((r, i) => {
    if (!PATH.test(r.from)) problems.push(`#${i} from "${r.from}" is not an internal path`);
    const [toPath, anchor] = r.to.split("#");
    if (!PATH.test(toPath) || (anchor !== undefined && !/^[a-z0-9-]+$/.test(anchor))) problems.push(`#${i} to "${r.to}" is not an internal path`);
    if (strip(r.to) === r.from) problems.push(`#${i} redirects to itself`);
    if (froms.has(r.from)) problems.push(`#${i} duplicates the rule for "${r.from}"`);
    froms.set(r.from, i);
  });
  rules.forEach((r, i) => {
    if (froms.has(strip(r.to))) problems.push(`#${i} "${r.from}" → "${r.to}" is a chain (target is redirected again)`);
  });
  return problems;
}

/** next.config `redirects()` entries. Unsafe lists throw, so a bad rule never deploys. */
export function nextRedirects(rules: RedirectRule[] = REDIRECTS) {
  const problems = redirectProblems(rules);
  if (problems.length) throw new Error(`Unsafe redirects:\n${problems.join("\n")}`);
  return rules.map((r) => ({ source: r.from, destination: r.to, permanent: true }));
}
