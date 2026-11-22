# Known gaps

🔴 blocks launch · 🟠 fix before the related milestone ships · 🟡 improvement

## DPDP / legal
- 🔴 **Notices are drafts.** Company, address, GSTIN, support and Grievance Officer details are placeholders
  (`lib/legal/config.ts`, env) and every text needs lawyer review (Privacy, Terms, Refund, Cookie; Hindi translation too).
- 🔴 **No production persistence** for the consent ledger, newsletter list and grievance inbox — they fail closed (503)
  in production. Needs the database from the platform decision (PRD §4) with an append-only `consent_records` table.
- 🔴 **No staff inbox / notifications for privacy requests** — requests can't be worked yet (M7 admin). Also needs an
  email/SMS provider to send the acknowledgement and identity-check OTP.
- 🟠 Newsletter double opt-in (confirmation message before any offer) when the email/WhatsApp provider is added;
  unsubscribe link in every message.
- 🟠 Account paths (M6): `terms_privacy` ledger row at every sign-up path, "Your consents" per user across devices,
  in-app delete account / data download, notification toggles synced with the ledger.
- 🟠 Retention/deletion jobs listed in `docs/legal/retention-schedule.md` don't exist yet (need the DB).
- 🟠 `DeliveryCheck` will use geolocation/IP for pincode (PDP-05) — consent-gate it in M4.
- 🟡 Hindi only for the Privacy Notice; Terms/Refund/Cookie and the banner are English.

## Security
- 🟠 Rate limiter is in-memory per instance — move to a shared store (Redis/Upstash) before multi-instance hosting.
- 🟠 `clientIp` trusts the first `X-Forwarded-For` hop — correct only behind our CDN/host; confirm with hosting choice.
- 🟠 No Content-Security-Policy yet (baseline headers only, `next.config.ts`). Add a nonce-based CSP (allow-list
  tracker domains only once consented scripts exist).
- 🟠 Semgrep (SAST) not in CI yet; ZAP baseline needs a staging URL.
- 🟠 Mock cart/bag is client display state — real cart + rate limits in M5.
- 🟡 Sentry not set up (needs owner account / DSN).

## Product / design
- 🟠 All imagery is placeholder art — real photography + hero campaign crops (16:7 / 4:5) required (DESIGN.md §5).
  `next.config.ts` `images.remotePatterns` must allow the CMS asset host.
- 🟠 CMS provider not chosen — homepage blocks are editable only in `lib/cms/mock-home.ts`; CMS-02 preview mode pending.
- 🟠 Product pages (`/products/*`, M4), help, account, wishlist, track-order, gift cards and Alpha Club routes still
  404. Category, collection and search links now resolve (M3).
- 🟠 Search is in-process over the mock catalogue — choose the hosted engine (Algolia / Typesense / Meilisearch or
  platform search) and load `SYNONYM_GROUPS` into it; add the `search{query,results}` analytics event in M8.
- 🟡 Single-filter landing pages are `noindex` like every filtered URL — revisit with SEO in M8.
- 🟡 PLP card hover shows the same placeholder art (second photo needed for the hover swap).
- 🟠 Homepage offers/claims (ALPHA10, combos, "up to 40%", COD, payment chips) are demo copy — publish only live offers.
- 🟠 UPI app tiles are neutral placeholders; real brand logos need licensed assets (M5).
- 🟡 HOME-07/09/10 (Shop the Look, Alpha Club band, #WearTheHood) are P1 (M9) — not on the homepage yet.
- 🟡 Size guide modal, mega-menu-on-hover (desktop) and mobile filter bottom sheet are M3/M4 items.
- 🟡 Lighthouse CI + `web-vitals` RUM not set up — add once real images exist (measure LCP of the hero).
- 🟡 No Playwright e2e yet (flows covered by route-level tests + a CDP script for now).
