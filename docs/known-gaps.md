# Known gaps

🔴 blocks launch · 🟠 fix before the related milestone ships · 🟡 improvement

## DPDP / legal
- 🔴 **Notices are drafts.** Company, address, GSTIN, support and Grievance Officer details are placeholders
  (`lib/legal/config.ts`, env) and every text needs lawyer review (Privacy, Terms, Refund, Cookie; Hindi translation too).
- 🟠 The consent ledger, newsletter list and grievance inbox now persist on the own backend (phases 1 and 3,
  `docs/backend/README.md`). Without `DATABASE_DRIVER` + `DATABASE_URL` they still fail closed (503) in production.
  Remaining step: choose and host the production database (owner TODO).
- 🟠 Privacy requests are worked in `/admin/privacy` (M7); the acknowledgement message and identity-check OTP still need
  an email/SMS provider.
- 🟠 Newsletter subscribers can't be messaged from the admin yet (no email / WhatsApp provider). Today: export CSV
  from `/admin/subscribers` and send from the provider. Statuses stay `pending_confirmation` ("Subscribed" in the
  admin) until double opt-in exists.
- 🟡 `lib/db/contract.test.ts` › "own-backend store end to end · mongodb" › "style editor, CSV export -> import and
  bulk actions" fails on local MongoDB (2026-11-25): it expected `['E2E Overshirt']` and got `[]`. This is the
  uncommitted catalog CSV / bulk work; not caused by the newsletter change. Investigate before committing that work.
- 🟠 Newsletter double opt-in (confirmation message before any offer) when the email/WhatsApp provider is added;
  unsubscribe link in every message.
- 🟠 Account paths (M6): `terms_privacy` ledger row at every sign-up path, "Your consents" per user across devices,
  in-app delete account / data download, notification toggles synced with the ledger.
- 🟠 Retention/deletion jobs listed in `docs/legal/retention-schedule.md` don't exist yet (need the DB).
- 🟡 PDP-05 auto-detect of the pincode by IP/geolocation is not built (manual entry + device-remembered pincode only).
  If added, ask for geolocation just-in-time and never send coordinates without consent.
- 🟡 Hindi only for the Privacy Notice; Terms/Refund/Cookie and the banner are English.

## Security
- 🟡 With the own backend configured, rate limits are shared through the database (`rate_limits`, hashed keys); without it they are per process. At high traffic consider Redis for the counters (one DB write per limited request).
- 🟠 `clientIp` trusts the first `X-Forwarded-For` hop — correct only behind our CDN/host; confirm with hosting choice.
- 🟠 No Content-Security-Policy yet (baseline headers only, `next.config.ts`). Add a nonce-based CSP; tracker hosts to
  allow-list (M8): `www.googletagmanager.com`, `www.google-analytics.com`, `*.google.com` / `googleadservices.com`
  (Ads), `connect.facebook.net`, `www.facebook.com`.
- 🟠 Semgrep (SAST) not in CI yet; ZAP baseline needs a staging URL.
- 🔴 **No SMS / email provider yet.** OTP sign-in can't send codes on the live store (the demo SMS needs
  `ALLOW_MOCK_PAYMENTS`), and order messages wait in `notify_outbox`.

  Already done:
  - Payments: Razorpay.
  - Database: the own backend.
  - Payment reconciliation: the cron sweep calls `reconcilePending`.

  See docs/backend/go-live.md.
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
- 🟠 Trademark files (`docs/brand/trademark/`) are cut from a vector-traced logo concept. Before filing, confirm who
  owns the concept artwork and get a designer's final master. No clearance search has been done yet.
- 🟡 PLP-08 rail gallery (`components/listing/product-rail-gallery.tsx`):
  - **Only one colour has photos so far.** The rail turns real on-hanger photos once staff tag them in the style
    editor; only the DEMO "Heavyweight Oversized Hoodie — Black" has them (owner mock-ups in `public/demo/products/`).
    Every other colour shows a `GarmentArt` drawing turned side-on.
  - **Staff photos must share one frame.** Front, back and side need the same canvas, scale and hook position, or
    the garment jumps as it turns. Nothing checks this on upload. Fix: an aspect / transparency check in
    `prepareProductPhoto`, or a server-side cut-out and normalise step (needs an image library; owner OK first).
  - **No autoplay.** The reference component in `docs/rail.md` can turn garments one by one on its own; that would
    need a pause control (WCAG 2.2.2).
  - **Picking is automatic:** popularity, one colour per style, photographed colour first. Per-collection hand-picking
    belongs to PLP-07 admin merchandising.
  - PLP-08 is not in the PRD yet (owner to confirm the ID / priority).
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
- 🟠 Return photos are stored in the database (`return_photos`, owner-scoped, EXIF stripped), never in a public
  folder. Still needed before scale:
  - move them to a private bucket with short-lived signed URLs (DB rows add backup weight);
  - a purge job for photos never attached to a return, and for return photos past their retention period.
- 🟠 Notifications are only queued (outbox) — SMS (DLT templates) / email providers and the delivery worker are pending.
- 🟠 Courier webhooks (shipped / delivered / NDR / RTO) not connected — staff advance orders in `/admin`; NDR handling pending.
- 🟠 Account deletion keeps addresses inside past orders (tax records) — confirm with the lawyer.
- 🟡 Wishlist and recent searches are kept on the device only (no account sync).
- 🟡 Store credit can't be spent at checkout yet (CHK-05, P1).

## Admin & ops (M7)
- 🔴 **Admin can't manage the store without a developer** — full list in `docs/admin/gap-analysis.md`. Homepage,
  menus, footer, announcement bar, categories/collections, coupons, combos, automatic/prepaid offers, looks, size
  charts, shipping/COD/GST/returns settings and feature flags are code constants or CLI-only. In production the mock
  CMS is refused and no real CMS adapter exists, so the homepage/menu/footer have no data source.
- 🟠 Staff, sessions, audit log and TOTP secrets are on the own backend (phase 5): TOTP secrets sealed with
  AES-256-GCM (`SECRET_BOX_KEY`), the audit log insert-only. Still needed: the key in the production secret store
  (owner TODO), and a database-level guard (a DB user without UPDATE/DELETE on `audit_log`).
- 🟠 Products can be created, edited, published and archived in `/admin/catalog` on the own backend
  (`COMMERCE_PROVIDER=own`). Still read-only: coupons and combos. On Shopify / Medusa, products stay read-only too
  (edited in that platform).
- 🟠 COD UPI payouts are recorded by hand (UTR) — needs the gateway payout API and a two-person approval above a limit.
- 🟠 No new-device / new-IP alert for staff sign-ins, and no WebAuthn (phishing-resistant MFA) yet.
- 🔴 **No email provider yet**, so on the live store "Forgot password?" (email code) answers 503 and the "password
  changed" notices aren't sent. Staff then need an owner's Reset link, or `pnpm admin:reset-link` on the server.
  - Fix: owner picks a provider (owner TODO), then add its adapter to `EMAIL_PROVIDERS` in `lib/notify/email.ts`
    and set `EMAIL_PROVIDER`.
- 🟡 "Forgot password?" step 1 answers the same for unknown emails, but returns a little faster for them (no email
  is sent). A careful attacker could time it, within the per-IP limit of 5 per 15 min.
  - Fix: send the email from a queue / after the response, so both paths take the same time.
- 🟡 The admin contract tests (incl. the new password-reset ones) only ran on memory on 2026-11-25. The local
  MongoDB test target timed out in setup (not running), and MySQL / PostgreSQL are commented out in `.env.test.local`.
  Re-run `lib/db/contract.test.ts` against all three databases before deploying migration `2026_11_28_008`.
- 🟡 Reports chart uses plain CSS bars (`recharts` not installed — needs the owner's OK to add the package).
- 🟡 No notification bell feed in the admin topbar yet (counts only).
- 🟡 Missing negative tests: admin ticket reuse, COD payout marked paid twice, production setup without/with a wrong token.

## SEO, analytics & feeds (M8)
- 🔴 Trackers not validated: GA4 DebugView, Meta Events Manager (test events) and Google Ads conversions need the real
  IDs and a browser session — not done. Nothing loads until IDs are set, so the store is safe meanwhile.
- 🟠 Product feed has no `image_link` until real product photos exist (Merchant Center / Meta reject items without one);
  placeholder art and the generated OG cards must not be used as feed images.
- 🟠 The server-side analytics event queue (Meta CAPI / GA4 MP) and RUM samples are still in memory (lost on restart).
  Not moved to the database on purpose: queued events carry the provider access token. To persist them, store the
  event without the token and add it at send time. The customer notification outbox IS on the database (phase 5).
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

## Product (style) editor (2026-11-25)
- 🟠 **No per-size price.** Price / MRP are per colour, not per size (e.g. 3XL can't cost more). Adding it needs
  cart, pricing, PDP ("from ₹…") and feed changes.
- 🟠 **Web addresses of published colours are locked** because there is no 301 redirect manager (CMS-03). Add the
  redirect manager, then allow changes with an automatic redirect.
- 🟡 **Size SKU / barcode uniqueness is checked in the service, not by a database index.** The codes live inside the
  product document. Two saves at the same instant could both pass. Fix: a `product_codes` table / collection with
  UNIQUE(code), written in the same `writeMany` transaction.
- 🟡 **Order lines placed before 2026-11-25 have no HSN** (invoice shows "—"). HSN defaults per GST class are
  placeholders; the CA must confirm every HSN and rate.
- 🟡 **Products list:** bulk actions and CSV import / export are built (2026-11-25). Still missing:
  - a draft preview link;
  - bulk price changes (e.g. −10 % on a selection). Use CSV for now.
- 🟡 **CSV import is atomic per product, not per file.** A failure mid-way leaves the earlier products saved (they show
  as unchanged on re-run). Very large files run in the request; move them to a background job if imports of
  thousands of products become routine.
- 🟡 **CSV doesn't carry photos.** Photos and their hanger front / back / side tags are set in the editor; an import
  keeps a colour's existing photos and tags (`photosFromImages`).
- 🟡 **Shipping data isn't used yet:** packed weight and package size are stored, but nothing reads them until the
  courier adapter exists.
- 🟡 **Not browser-checked** at 1440 / 390 / 360 px.

## Own backend (2026-11-26 — `docs/backend/README.md`)
- 🔴 Phases 1–5 are on the database:
  - identity: consent, customers, sessions, OTP;
  - money: locks, carts, inventory, orders, payments, invoice series, store credit, Hood Coins, Alpha Club, gift cards;
  - after-sales: returns, return photos, privacy inbox, newsletter;
  - catalogue (`COMMERCE_PROVIDER=own`): products, categories, collections, reviews.

  - admin + growth: staff + MFA, audit log, rate limits, alerts, #WearTheHood, notification outbox, flow state.

  Still memory-only: the analytics event queue and RUM samples (see SEO & analytics). The phase 6 switch-over
  checklist (production database, secrets, backups, real catalogue) is the remaining step before going live.
- 🟡 Product photos are stored in the database (`product_media`) and resized by the Next.js image pipeline. At scale,
  move the bytes to object storage + CDN (same id / URL), which also lightens database backups.
- 🟡 Photos keep their pixel orientation, but the EXIF orientation flag is stripped. A phone photo shot sideways
  shows sideways. Export photos upright, or add a server-side re-encode (needs an image library; owner OK for a
  new package).
- 🟡 Uploaded product photos that no product uses are never deleted. They are public but unlinked; add a purge
  once storage grows.
- 🟡 Categories, homepage rail and collections are edited in `/admin/categories` and `/admin/collections` (2026-11-25).
  Still missing there: category banner / description / SEO fields, hiding a category without removing it, per-
  collection pin/bury order (PLP-07), and a schedule (start/end). Not browser-checked at 1440 / 390 / 360 px.
  Collection "used by" checks read combos and the mock CMS content in code; they move to the DB with the CMS.
- 🟡 Each server caches the catalogue snapshot for 10 s. With several servers, an edit can take up to 10 s to show on
  the others. The whole active catalogue is held in memory per server; that's fine for thousands of products, so
  revisit if it grows to tens of thousands.
- 🟡 Popularity (default sort) is 0 for new products and isn't computed from sales yet.
- 🟡 Listings break popularity ties by product id (SQL `ORDER BY id`). On PostgreSQL / MySQL a non-C collation could
  order `_`/digits differently from JavaScript. Only tie order is affected; the contract test will show it when it
  runs on those engines.
- 🟡 The product editor (`/admin/catalog/new`, `/admin/catalog/[id]`) is not browser-checked at 1440 / 390 / 360 px
  yet. Its API is covered by tests, and the store pages were fetched over HTTP on the own backend.
- 🟡 The per-contact privacy-request cap (3 a day) is a count followed by an insert. Two requests sent at the same
  instant could both get through. The per-IP route limit still applies; add a lock if this is ever abused.
- 🟡 Inventory `on_hand` is seeded per SKU from the product's opening stock the first time the SKU is used
  (`ensureSku`). On `COMMERCE_PROVIDER=mock` that opening stock is the demo data's.
- 🟠 MySQL and PostgreSQL stores are written but not yet run against a real server (contract tests skip without
  `TEST_MYSQL_URL` / `TEST_POSTGRES_URL`). Run them before relying on either engine.
- 🟠 The local MongoDB replica set (port 27018) is a manual process (`pnpm db:mongo:dev`); it isn't a Windows service.
- 🟡 No CI database matrix yet (MySQL + Postgres + Mongo service containers running the contract suite).
- 🟡 The retention clean-up runs only when `/api/cron/sweep` is called. Schedule it every 15 min (owner TODO). Queued
  `notify_outbox` rows are kept until a delivery worker exists.
- 🟡 There is no delivery worker reading `notify_outbox` yet (no SMS / email / WhatsApp provider).

## Payments — Razorpay (2026-11-27)
- 🟠 Built against Razorpay's documented API with a fake Razorpay in tests. It hasn't run against the real Razorpay
  test environment yet. Owner TODO: run the test-mode checklist in go-live.md §11 before live keys.
- 🟡 The redirect back from Razorpay isn't signature-checked. It doesn't need to be: that route only asks the API for
  the status. The docs don't publish the exact string Razorpay signs for links, so the code doesn't guess.
- 🟡 Payment link expiry is 16 minutes, just past the 15-minute stock hold. A shopper who pays at the very end can be
  confirmed after the hold expired. Then reconciliation either confirms (if stock was still free) or marks the order
  for review/refund (existing `needs_review` path). Watch for this in the first weeks.
- 🟡 COD refunds still go to UPI by hand (payout API not built).

## SMS (2026-11-27)
- 🔴 **No real SMS provider adapter yet.** The SMS pipeline is built and tested:
  - DLT template allow-list;
  - per-template variable allow-list;
  - outbox delivery worker with exclusive claims, back-off, retries and per-channel results;
  - OTP path;
  - `ops:check` blocker.

  The provider adapter itself is missing. I couldn't confirm MSG91's current v5 API from a first-party source: the
  docs pages render with JavaScript, and the public GitHub SDKs use legacy endpoints. Shipping a guessed request
  format would pass fake-API tests and fail with real SMS.

  Fix, once the owner picks a provider and shares its exact API (MSG91's panel shows the request for each approved
  template; Gupshup, Exotel, Twilio and AWS SNS publish static docs):
  1. add a factory to `SMS_PROVIDERS` in `lib/notify/sms.ts`;
  2. add a contract test against a fake API;
  3. run one real test send.
- 🟡 Email and WhatsApp channels record `no_provider`. Order updates by email/WhatsApp need those providers.
- 🟡 Delivery receipts (DLR) from the provider aren't read yet. "sent" means the provider accepted the message.

