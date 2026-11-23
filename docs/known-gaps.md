# Known gaps

🔴 blocks launch · 🟠 fix before the related milestone ships · 🟡 improvement

## DPDP / legal
- 🔴 **Notices are drafts.** Company, address, GSTIN, support and Grievance Officer details are placeholders
  (`lib/legal/config.ts`, env) and every text needs lawyer review (Privacy, Terms, Refund, Cookie; Hindi translation too).
- 🔴 **No production persistence** for the consent ledger, newsletter list and grievance inbox — they fail closed (503)
  in production. Needs the database from the platform decision (PRD §4) with an append-only `consent_records` table.
- 🟠 Privacy requests are worked in `/admin/privacy` (M7); the acknowledgement message and identity-check OTP still need
  an email/SMS provider.
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
- 🟠 No Content-Security-Policy yet (baseline headers only, `next.config.ts`). Add a nonce-based CSP; tracker hosts to
  allow-list (M8): `www.googletagmanager.com`, `www.google-analytics.com`, `*.google.com` / `googleadservices.com`
  (Ads), `connect.facebook.net`, `www.facebook.com`.
- 🟠 Semgrep (SAST) not in CI yet; ZAP baseline needs a staging URL.
- 🔴 **No real payment gateway, SMS provider or database.** Checkout refuses to run on the live store until they're
  configured (demo gateway/SMS only with `ALLOW_MOCK_PAYMENTS`); carts, orders, customers and sessions are in memory.
  With a DB: UNIQUE indexes (order number, customer+idempotency key, payment id, event id), row locks / conditional
  updates in transactions, and a cron for `reconcilePending` every few minutes.
- 🔴 Pentest of the High-risk flows (OTP, checkout/payments, wallet/gift cards, refunds, admin/MFA, uploads, webhooks)
  before launch. `/security-review` of M5–M9 done 2026-11-25: no high-confidence findings
  (`docs/security/2026-11-25-security-review-m5-m9.md`); repeat it once the DB, gateway and providers are wired in.
- 🟠 No bot protection (Turnstile) on OTP send, coupon apply and place order (PRD §7) — rate limits only.

- 🟠 Guest cart is not merged into a signed-in customer's earlier cart (CART-04 merge on login — M6).
- 🟠 Paid-but-out-of-stock and duplicate payments go to `needs_review` — refunds need the gateway + admin (M7).
- 🟠 Real gateway redirect will be an external URL — extend `safeRedirect` with the gateway host allow-list.
- 🟡 Sentry not set up (needs owner account / DSN).

- 🔴 **GST invoice number too long:** `lib/orders/store.ts` `nextInvoiceNumber` issues `INV/2026-27/000001`
  (18 characters); CGST Rule 46(b) allows a consecutive serial of at most 16. Fix: a shorter format such as
  `INV/2627/000001` (15), shared with the POS document series (POS.md BILL-02), update `lib/returns/returns.test.ts`.
  CA to confirm before the first real invoice.

## POS (proposed — `docs/alpha-hood-store-kit/POS.md`)
- 🟡 POS is not in the PRD scope (PRD §2 non-goal) — waiting for the owner's approval and answers to POS.md §13.
  Prerequisites already visible in the code: no variant barcodes, a single stock pool (no locations), orders require an
  address + customer, GST assumes one warehouse state, consent sources are web/android/ios only.

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
  platform search) and load `SYNONYM_GROUPS` into it.
- 🟡 Single-filter landing pages are `noindex` like every filtered URL — make chosen ones (e.g. "black oversized tees")
  real collection pages with their own copy instead of indexing filter URLs.
- 🟡 PLP card hover shows the same placeholder art (second photo needed for the hover swap).
- 🟠 Homepage offers/claims (ALPHA10, combos, "up to 40%", COD, payment chips) are demo copy — publish only live offers.
- 🟠 UPI app tiles are neutral placeholders; real brand logos need licensed assets.
- 🟠 GST rate table, warehouse state, COD fee/limit, shipping fee, prepaid offer and coupons/combos are DEMO values.
- 🟡 Hood Coins (CHK-05) and one-click checkout
  (CHK-08) are P1.
- 🟡 HOME-07/09/10 (Shop the Look, Alpha Club band, #WearTheHood) are P1 (M9) — not on the homepage yet.
- 🟡 Size guide modal, mega-menu-on-hover (desktop) and mobile filter bottom sheet are M3/M4 items.
- 🟠 Lighthouse CI not set up and Lighthouse mobile not measured (the M8 "≥ 90" gate is unverified). RUM is live
  (`/api/rum` → admin Reports). Needs `@lhci/cli` (owner OK) and real images to measure the hero LCP.
- 🟡 No Playwright e2e yet (flows covered by route-level tests + a CDP script for now).

## Accounts, orders & returns (M6)
- 🟠 Only phone OTP sign-in exists; email OTP and Google (ACC-01) need an email provider / OAuth client — each new path
  must record `terms_privacy` in the consent ledger like OTP sign-up does.
- 🟠 No list of active sessions/devices and no new-device alerts yet.
- 🟠 COD refunds to UPI are queued (`payout_pending`) — needs the gateway payout API + ops approval (M7). UPI IDs must be
  encrypted at rest once a database exists.
- 🟠 Return photos live in memory — production needs a private bucket, short-lived signed URLs and a purge job.
- 🟠 Notifications are only queued (outbox) — SMS (DLT templates) / email providers and the delivery worker are pending.
- 🟠 Courier webhooks (shipped / delivered / NDR / RTO) not connected — staff advance orders in `/admin`; NDR handling pending.
- 🟠 Account deletion keeps addresses inside past orders (tax records) — confirm with the lawyer.
- 🟡 Wishlist and recent searches are kept on the device only (no account sync).
- 🟡 Store credit can't be spent at checkout yet (CHK-05, P1).

## Admin & ops (M7)
- 🔴 Staff, sessions, audit log and TOTP secrets live in memory (dev only, refused in production like every mock store).
  With the database: TOTP secrets encrypted at rest (envelope key in the secret store), audit log in an append-only table.
- 🟠 Products, prices, images, coupons and combos are read-only in `/admin` — edited in the commerce platform's admin
  once Shopify / Medusa is chosen (PRD §4).
- 🟠 COD UPI payouts are recorded by hand (UTR) — needs the gateway payout API and a two-person approval above a limit.
- 🟠 No new-device / new-IP alert for staff sign-ins, and no WebAuthn (phishing-resistant MFA) yet.
- 🟠 Admin rate limits are per process (in memory) — move to the shared store with the database.
- 🟡 Reports chart uses plain CSS bars (`recharts` not installed — needs the owner's OK to add the package).
- 🟡 No notification bell feed in the admin topbar yet (counts only).
- 🟡 Missing negative tests: admin ticket reuse, COD payout marked paid twice, production setup without/with a wrong token.

## SEO, analytics & feeds (M8)
- 🔴 Trackers not validated: GA4 DebugView, Meta Events Manager (test events) and Google Ads conversions need the real
  IDs and a browser session — not done. Nothing loads until IDs are set, so the store is safe meanwhile.
- 🟠 Product feed has no `image_link` until real product photos exist (Merchant Center / Meta reject items without one);
  placeholder art and the generated OG cards must not be used as feed images.
- 🟠 Server-side event outbox and RUM samples are in memory (lost on restart) — durable outbox / table with the database.
- 🟠 Help, About and FAQ copy is draft (owner + lawyer review); returns & cancellation pages redirect into the Refund &
  Cancellation Policy. Gift Cards and Alpha Club merch tiles still link to pages that don't exist yet (M9, P1).
- 🟡 Brand icons from the logo kit (bag, wishlist, delivery, returns, Alpha Club) are in `public/brand/icons/` but not
  used in the UI: the icon rule is Hugeicons only. Owner to decide (e.g. Alpha Club badge in M9 as a brand asset).
- 🟡 Logo kit colours differ slightly from DESIGN.md tokens (kit yellow #F5C80B vs `volt` #F4E04D; kit black #0A0A0A
  vs `ink` #111111). Tokens unchanged until the owner decides.
- 🟡 Logo SVGs are ~22 KB gzipped each (traced paths). Fine for now; a designer-cleaned master would be lighter.
- 🟡 Google product categories in the feed are mapped by category handle — check against the platform's final
  category list.
- 🟡 Server-side GA4 purchase is not sent (browser `purchase` only, to avoid double counting); Google Ads enhanced
  conversions and Meta CAPI for other events (AddToCart etc.) are not built.

## Mascot "ALPHA" (2026-11-24)
- 🟠 AI-generated mascot images have unclear copyright — designer / 3D artist to recreate the final character before
  trademark filing or merch (MASCOT_PROMPTS §8). Merch mockups are deliberately not on the site.
- 🟠 Homepage hero slides 2–3 and the collection tiles use mascot art because there is no campaign shoot yet; replace
  with real product/model photography when it exists (mascot keeps slide 1 and the in-between moments).
- 🟡 "Alpha Wolf Stride" has a fake (painted) checkerboard background — regenerate with a real transparent / plain
  background before using it for "new drop" banners.
- 🟡 Corner-peek widget (#14) not built: needs a transparent cut-out of the peek pose (current file has a grey panel);
  used on the 404 page instead.
- 🟡 Homepage mascot changes not checked in a browser (1440/390/360) or with Lighthouse; the homepage renders only with
  demo data (dev), production shows the coming-soon page (now with the hood-up mascot as its LCP image).
- 🟡 Unknown category / collection / product / help / legal URLs now render "Page not found" with
  `<meta name="robots" content="noindex">` but HTTP **200** (soft 404): `notFound()` runs inside `<Suspense>` after
  the shell has streamed, and `dynamicParams=false` is not supported with Cache Components. If search consoles report
  soft-404s, return 404 for unknown handles earlier (e.g. a proxy check against the catalogue).

## Growth pack (M9)
- 🔴 Wallet payments (coins, gift cards, store credit) are built as **payment instruments** (invoice/GST on the full
  total). The CA must confirm this, especially for Hood Coins (a discount would reduce the taxable value). If the
  answer is "discount", coins move into priceCart before launch.
- 🟠 Gift cards can't be bought online yet: that needs a checkout for a non-physical product, a GST decision
  (voucher taxed at issue vs redemption) and email delivery of the code. Staff issue them from the admin today.
- 🟠 Gift card, coin and credit ledgers live in memory (dev) — production needs DB tables with UNIQUE(reference),
  row locks (`SELECT … FOR UPDATE`) on balance changes, and the same all-or-nothing hold in one transaction.
- 🟡 A late gateway success after the wallet was released, when the balance is gone, goes to `needs_review`; ops must
  refund the card payment (admin queue for such cases not built).
- 🔴 Alpha Club, alerts, UGC, flows and the outbox live in memory — production refuses them (fail closed) until the
  database exists. Coins also need a scheduled expiry job (today expiry is applied when balances are read).
- 🟠 Referral fraud: a friend using a different device and a new address still passes. Add velocity limits
  (referrals per code per month) and an admin review queue before referral rewards become spendable.
- 🟠 No notification provider: WhatsApp (BSP + approved templates), SMS DLT templates and email are still pending;
  the outbox only queues. The cron sweep needs a scheduler (e.g. Vercel Cron every 15 min) and `CRON_SECRET`.
- 🟠 Early access to drops and a birthday reward (LOY-01) are not built (birthday needs a date of birth — new
  personal data, optional, must be added to the notice first).
- 🟠 Browse abandonment and wishlist reminders (LOY-04) need server-side browsing / wishlist data, which we don't
  keep (the wishlist is device-only).
- 🟠 Push notifications (PWA) need a push provider / VAPID keys and a consent purpose.
- 🟠 #WearTheHood photos are stored with the return photos in memory — production needs a private bucket, signed
  URLs and a purge job for rejected and withdrawn photos (retention: 30 days).
- 🟡 One-click checkout (CHK-08) and marketing automation (ANL-03) are flags and seams only; each provider needs its
  integration and a Privacy Notice entry before it is switched on.
- 🟡 Shop the Look uses placeholder art and demo looks; the CMS / platform should own looks and hotspots.
- 🟡 Size advice uses order history only; the height/weight quiz (PDP-04) is not built.
- 🟡 Not browser-checked at 1440/390/360; homepage M9 blocks render only with demo data (`pnpm dev`).

## Own backend (2026-11-26 — `docs/backend/README.md`)
- 🔴 Phases 1–2 are on the database: consent, customers, sessions, OTP, locks, carts, inventory, orders, payments,
  invoice series, store credit, Hood Coins, Alpha Club and gift cards. Still memory-only: returns, privacy inbox,
  newsletter (phase 3); catalogue (phase 4); staff, MFA, audit log, alerts, UGC, outbox, rate limiter, flows
  (phase 5). In production, everything that needs the catalogue still refuses (fail closed). Phases 3–6 pending.
- 🟠 The catalogue still comes from the mock adapter. Inventory `on_hand` is seeded from its stock numbers once per
  SKU (`lib/db/stores/commerce.ts` `ensureSku`). After phase 4, the seed must come from the real product data.
- 🟡 SQL `app_locks` / `markers` / expired `inventory_reservations` rows aren't cleaned yet (harmless, they grow).
  Add a cleanup to the cron sweep. Mongo has the same gap for expired reservations.
- 🟠 MySQL and PostgreSQL stores are written but not yet run against a real server (contract tests skip without
  `TEST_MYSQL_URL` / `TEST_POSTGRES_URL`). Run them before relying on either engine.
- 🟠 The local MongoDB replica set (port 27018) is a manual process (`pnpm db:mongo:dev`); it isn't a Windows service.
- 🟡 Expired sessions / OTP rows: MongoDB TTL indexes clean them; SQL needs a scheduled cleanup (add to the cron sweep).
- 🟡 No CI database matrix yet (MySQL + Postgres + Mongo service containers running the contract suite).

