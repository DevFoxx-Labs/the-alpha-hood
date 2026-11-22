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
- 🟡 PDP-05 auto-detect of the pincode by IP/geolocation is not built (manual entry + device-remembered pincode only).
  If added, ask for geolocation just-in-time and never send coordinates without consent.
- 🟡 Hindi only for the Privacy Notice; Terms/Refund/Cookie and the banner are English.

## Security
- 🟠 Rate limiter is in-memory per instance — move to a shared store (Redis/Upstash) before multi-instance hosting.
- 🟠 `clientIp` trusts the first `X-Forwarded-For` hop — correct only behind our CDN/host; confirm with hosting choice.
- 🟠 No Content-Security-Policy yet (baseline headers only, `next.config.ts`). Add a nonce-based CSP (allow-list
  tracker domains only once consented scripts exist).
- 🟠 Semgrep (SAST) not in CI yet; ZAP baseline needs a staging URL.
- 🔴 **No real payment gateway, SMS provider or database.** Checkout refuses to run on the live store until they're
  configured (demo gateway/SMS only with `ALLOW_MOCK_PAYMENTS`); carts, orders, customers and sessions are in memory.
  With a DB: UNIQUE indexes (order number, customer+idempotency key, payment id, event id), row locks / conditional
  updates in transactions, and a cron for `reconcilePending` every few minutes.
- 🔴 High-tier second review (`/security-review`) of M5 not yet run; pentest of checkout/OTP/webhook before launch.
- 🟠 No bot protection (Turnstile) on OTP send, coupon apply and place order (PRD §7) — rate limits only.
- 🟠 No sign-out / "sign out everywhere" and no session list yet (M6 account).
- 🟠 Guest cart is not merged into a signed-in customer's earlier cart (CART-04 merge on login — M6).
- 🟠 Paid-but-out-of-stock and duplicate payments go to `needs_review` — refunds need the gateway + admin (M7).
- 🟠 Real gateway redirect will be an external URL — extend `safeRedirect` with the gateway host allow-list.
- 🟡 Sentry not set up (needs owner account / DSN).

## Product / design
- 🟡 PLP-08 rail gallery (`components/listing/product-rail-gallery.tsx`): uses `GarmentArt` placeholders; the "Back"
  view is the mirrored placeholder until real front/back/side cut-out photos (transparent PNG/WebP) exist. Products are
  auto-picked (popularity, one colour per style) — per-collection hand-picking belongs to PLP-07 admin merchandising.
  PLP-08 is not in the PRD yet (owner to confirm the ID / priority).
- 🟡 Dev console warns "`params` accessed outside `<Suspense>`" on `/collections/[handle]` (instant-navigation hint for
  the existing `await params`); not caused by PLP-08 — consider `export const instant = false` or streaming the header.
- 🟠 All imagery is placeholder art — real photography + hero campaign crops (16:7 / 4:5) required (DESIGN.md §5).
  `next.config.ts` `images.remotePatterns` must allow the CMS asset host.
- 🟠 CMS provider not chosen — homepage blocks are editable only in `lib/cms/mock-home.ts`; CMS-02 preview mode pending.
- 🔴 **Legal Metrology** fields on every PDP (manufacturer/packer/importer, country of origin) are placeholders — the
  real values must come from the catalogue before launch (PRD §7, acceptance §13).
- 🟠 Shipping partner, reviews provider and coupons are mocks (refused in production): real EDD/COD rules (PRD §15 Q4),
  real reviews only from verified buyers (M6 "Write a review"), real coupons in the platform (M5).
- 🟠 BUY NOW opens the bag until checkout exists (M5 → straight to checkout).
- 🟠 Size charts are demo measurements — replace with measured spec sheets per style.
- 🟡 PDP-09 (complete the look, you may also like, recently viewed), PDP-04 fit quiz, PDP-10 notify me, PDP-11 Ask
  Alpha and the video tile are later milestones (P1/P2).
- 🟠 Help, account, wishlist, track-order, gift cards and Alpha Club routes still
  404. Category, collection and search links now resolve (M3).
- 🟠 Search is in-process over the mock catalogue — choose the hosted engine (Algolia / Typesense / Meilisearch or
  platform search) and load `SYNONYM_GROUPS` into it; add the `search{query,results}` analytics event in M8.
- 🟡 Single-filter landing pages are `noindex` like every filtered URL — revisit with SEO in M8.
- 🟡 PLP card hover shows the same placeholder art (second photo needed for the hover swap).
- 🟠 Homepage offers/claims (ALPHA10, combos, "up to 40%", COD, payment chips) are demo copy — publish only live offers.
- 🟠 UPI app tiles are neutral placeholders; real brand logos need licensed assets.
- 🟠 GST rate table, warehouse state, COD fee/limit, shipping fee, prepaid offer and coupons/combos are DEMO values.
- 🟡 Purchase analytics event (fire once) arrives with analytics in M8; Hood Coins (CHK-05) and one-click checkout
  (CHK-08) are P1.
- 🟡 HOME-07/09/10 (Shop the Look, Alpha Club band, #WearTheHood) are P1 (M9) — not on the homepage yet.
- 🟡 Size guide modal, mega-menu-on-hover (desktop) and mobile filter bottom sheet are M3/M4 items.
- 🟡 Lighthouse CI + `web-vitals` RUM not set up — add once real images exist (measure LCP of the hero).
- 🟡 No Playwright e2e yet (flows covered by route-level tests + a CDP script for now).
