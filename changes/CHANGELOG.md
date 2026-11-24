# Change log

## 2026-11-24 — Trademark filing files

**Threat model:** static image and docs files only. There is no new route, personal data, tracker or processor, and
nothing is served publicly: the files live in `docs/`, not `public/`.

**Added**
- `docs/brand/trademark/`:
  - `word-mark.txt`;
  - wordmark (B&W), logo mark and composite (B&W + colour) as filing JPGs (≤ 944 px, 300 dpi, white background,
    fits the TM-A 8 × 8 cm box), plus 2400 px `-hires.png` copies;
  - `TRADEMARK.md`: which file is which, B&W vs colour claim, filing order, classes to discuss, owner checklist,
    and the ™ / ® rules.
- `scripts/brand-trademark.mjs` rebuilds the files from the vector masters in `docs/brand/logo-kit/logo/`
  using sharp, which comes with Next. The logo is not redrawn: B&W only stretches `#0A0A0A` to `#000`.

**Verified**
- Ran `node scripts/brand-trademark.mjs`. It printed the size and dpi of every JPG.
- Checked each image visually.
- `eslint scripts/brand-trademark.mjs` passes.
- Not run: `pnpm verify`. No app code changed.

## 2026-11-26 — Own backend, phase 5: staff + MFA, audit log, rate limits, alerts, UGC, outbox, flows on the database (High-risk tier: auth, admin powers)

**Threat model:**
- *Assets:* staff accounts and their second factor, admin sessions, the audit trail, rate-limit protection,
  customers' alert / UGC / message data.
- *Actors:* password guessers; someone with a stolen or shoulder-surfed TOTP code; anyone holding an invite link;
  two servers or retried crons acting at once; a database dump in the wrong hands.
- *Abuse cases and the layer that stops each:*
  - password guessing across servers → database-counted lockout;
  - replaying a TOTP code (also in parallel) → step accepted once, only if newer (conditional update);
  - brute-forcing a sign-in ticket → 5 guesses, counted atomically;
  - reusing an invite → single-use consume + UNIQUE email;
  - two first owners → setup under a lock;
  - two owners demoting each other at once → staff changes under a lock (the last owner stays);
  - TOTP secrets readable from a DB dump → AES-256-GCM sealed (`SECRET_BOX_KEY`; production refuses without it);
  - rate limits bypassed by hitting other servers → shared DB counters;
  - IPs / phone numbers sitting in the limiter table → hashed keys;
  - limiter store down → in-process fallback (never switches off);
  - an alert or reminder sent twice → conditional fire / claim;
  - the marketing cap exceeded by parallel sweeps → per-customer lock;
  - an admin route missing the guard → guard test now requires `await requireStaff(` / `await adminWrite(`.

**Added**
- Migrations `2026_11_26_005_admin_growth` (SQL + Mongo, additive): `staff`, `staff_invites`, `staff_tickets`,
  `staff_sessions`, `audit_log`, `rate_limits`, `product_alerts`, `ugc_posts`, `notify_outbox`, `flow_checkouts`.
  Mongo TTL indexes cover sessions, tickets and rate limits.
- `lib/db/secret-box.ts`: AES-256-GCM sealing with key rotation.
- `lib/db/stores/admin.ts` (staff, audit, rate counters) and `lib/db/stores/growth.ts` (alerts, UGC, outbox, flows),
  each for SQL and MongoDB.
- `SECRET_BOX_KEY` / `SECRET_BOX_PREVIOUS_KEYS` in `.env.example`.
- `lib/db/admin-contract.ts`. Every security counter is raced:
  - parallel setups → 1 owner;
  - one TOTP code on two tickets → 1 sign-in, then refused;
  - parallel wrong passwords → lock;
  - 8 parallel guesses on a ticket → spent;
  - double invite accept → 1 account;
  - raw DB row shows only the sealed secret;
  - 12 parallel limiter hits → counts 1…12;
  - alert create/fire races;
  - UGC approve-vs-reject race;
  - outbox windows;
  - flow step claims.

**Changed**
- `StaffStore` is now an async interface; `requireStaff`, `staffFromRequest` and the sign-in steps are async, and
  every admin route awaits them.
- Invite acceptance moved into `acceptInvite`.
- `RateLimiter.hit` / `peek` are async; 34 call sites updated. The gift card attempt limit (`giftCardTriesLeft`)
  is awaited — without that it would have silently stopped limiting.
- Notification outbox and flow state moved behind `OutboxStore` / `FlowStore`; account deletion also erases the
  customer's queued messages.
- `lib/db/index.ts` caches store sets per module instance: a long-running dev server no longer keeps store objects
  built by older code (found during the smoke check: `/api/admin/setup` returned 500 on a server started before this
  change).
- `pnpm db:mongo:dev` now runs `scripts/mongo-rs-start.mjs`. The old one-liner failed on Windows cmd because of
  the space in "Program Files". `MONGOD_PATH` overrides the binary.

**Verified**
- `pnpm verify`: typecheck, lint, 358/358 tests (memory + local MongoDB), build.
- `pnpm audit --prod`: clean.
- `pnpm db:migrate` on local `alpha_hood_dev`: 5 migrations.
- Fresh `next dev` on the Mongo dev DB:
  - `GET /api/admin/setup` → `{"needed":true}`;
  - a wrong login → 401 with the generic message;
  - no admin cookie → 401;
  - `rate_limits` rows have 64-character hashed keys only.

**Not verified**
- MySQL / PostgreSQL (credentials pending).
- No UI change.

## 2026-11-26 — Own backend, phase 4: catalogue + reviews on the database, admin product editing, `COMMERCE_PROVIDER=own` (High-risk tier: admin powers, prices)

**Threat model:**
- *Assets:* prices and MRP (money), what the store shows (product content), stock, reviews.
- *Actors:* staff without catalogue rights; a compromised or careless editor; two editors at once; shoppers
  probing hidden products; anyone injecting markup through product text.
- *Abuse cases and the layer that stops each:*
  - editing without rights → `catalog.write` checked on the server (403), and the admin-route guard test;
  - cross-site writes → same-origin check (403);
  - a price above the MRP, fractional or negative paise, made-up categories/sizes/attributes, unknown fields → server
    allow-list (422);
  - script in text → plain text only, rendered escaped (JSON-LD through `toJsonLd`);
  - two editors overwriting each other → version check (409);
  - taking another product's URL or SKU → UNIQUE handle/SKU (409);
  - drafts or archived products leaking → the storefront snapshot includes only `active` products;
  - deleting history → archive only, no delete;
  - repudiation → every create/update audited, with price and status before and after;
  - ballot-stuffing helpful votes → UNIQUE (review, voter);
  - demo products or fake reviews going live → `db:seed` refuses anything but a local `_dev` / `_test` database;
  - SSRF through image URLs → no URL field at all.

**Added**
- Migrations `2026_11_26_004_catalog` (SQL + Mongo, additive): `products` (UNIQUE handle + SKU, status, version),
  `catalog_documents`, `reviews`, `review_votes`.
- `COMMERCE_PROVIDER=own` (`lib/commerce/resolve.ts`): catalogue, bag, stock and reviews on the database. Works in
  production; refuses without a database.
- `lib/catalog/reader.ts`: one read path (listing, filters, collections, search, suggestions) for the demo
  catalogue and the database.
- `lib/catalog/collection-rules.ts`: collection rules as data.
- `lib/catalog/store.ts` + `own.ts`: snapshot assembly (active only, live stock, derived swatches, ratings) and a
  10 s per-server cache.
- `lib/reviews/store.ts`: one reviews service on any store.
- `lib/db/stores/catalog.ts`: SQL + Mongo stores.
- Admin product editing:
  - `lib/catalog/admin.ts`: server validation and create/update;
  - routes: `POST /api/admin/catalog` and `GET` / `PATCH /api/admin/catalog/[id]`;
  - UI: `/admin/catalog/new` and `/admin/catalog/[id]` (`components/admin/product-editor.tsx`), plus a status filter
    and "New product" button on the list;
  - new permission `catalog.write` (owner, store manager, catalog editor);
  - writes revalidate the `catalog` cache tag.
- `pnpm db:seed`, with `scripts/alias-loader.mjs` so CLI scripts can import app code; local `_dev` / `_test` only.
- Tests:
  - `lib/db/catalog-contract.ts`:
    - the seeded DB serves exactly the demo catalogue;
    - review vote race;
    - draft/active/archived behaviour;
    - concurrent edits (one wins);
    - handle/SKU conflicts;
    - 15 validation probes;
    - an end-to-end flow on each DB: owner signs in with MFA → creates a draft (invisible) → publishes (visible
      through the public API) → stale edit refused → shopper's COD order takes the stock.
  - `app/api/admin-api.test.ts`: `catalog.write` RBAC, read-only on mock (409), CSRF.

**Changed**
- `lib/commerce/mock` uses the shared reader (`mock/search.ts` removed). Behaviour unchanged; the existing catalogue
  and search tests pass.
- `reviews` and `commerce` exports resolve per call (they follow the current environment).
- `/api/admin/inventory` takes product titles from the active adapter, no longer from the demo data.

**Verified**
- `pnpm verify`: typecheck, lint, 335/335 tests (memory + local MongoDB), build.
- `pnpm audit --prod`: clean.
- `pnpm db:migrate` + `pnpm db:seed` on local `alpha_hood_dev`: 4 migrations; 68 products and 686 demo reviews.
- `next dev` with `COMMERCE_PROVIDER=own`, fetched over HTTP (no headless browser): `/`, a product page,
  `/men/shirts` and `/collections/new-in` → 200 with the right titles; `/api/catalog` and `/api/products/by-ids`
  serve data from the database; no errors in the server log.

**Not verified**
- MySQL / PostgreSQL (credentials pending).
- The product editor UI hasn't been viewed in a browser at 1440 / 390 / 360 px or in dark mode.

## 2026-11-26 — Own backend, phase 3: returns, return photos, grievance inbox, newsletter on the database (High-risk tier: uploads, personal data)

**Threat model:**
- *Assets:* return photos (private, may show a home); privacy requests (contact + details); subscriber contacts;
  return / refund state.
- *Actors:* a customer trying to read someone else's photo or reuse one photo on two returns; parallel sign-ups;
  staff working the same privacy request at the same time.
- *Abuse cases and the layer that stops each:*
  - reading another customer's photo → owner-scoped query (an id that isn't yours behaves like one that doesn't
    exist);
  - path-like photo ids → id regex before any query;
  - EXIF/GPS leak → stripped before insert, the same `preparePhoto` for every store;
  - script disguised as an image → magic-byte sniffing;
  - one photo on two returns, or attaching someone else's photo → all-or-nothing conditional attach in a transaction;
  - lost return or privacy-request updates → row lock / version check / atomic `$push`;
  - duplicate subscribers → UNIQUE (channel, contact).

**Added**
- Migrations `2026_11_26_003_aftersales` (SQL + Mongo, additive; reversible only on local `_dev` / `_test`
  databases): `returns`, `return_photos`, `privacy_requests`, `newsletter_subscribers`.
- `lib/db/stores/aftersales.ts`: SQL and MongoDB versions of all four stores.
- Shared rules, so the memory and database stores can't drift:
  - `preparePhoto` / `isPhotoId` in `lib/returns/photos.ts`;
  - `newPrivacyRequest` in `lib/privacy/requests.ts`.
- Tests: `lib/db/aftersales-contract.ts`, the contract with races (photo attach, concurrent status updates, racing
  sign-ups), plus API end-to-end tests on each database:
  - return with a photo;
  - privacy request;
  - newsletter sign-up + withdrawal.

**Changed**
- `resolveReturns`, `resolvePhotos`, `resolveInbox` and `resolveNewsletterStore` use the database when one is
  configured.

**Verified**
- `pnpm verify`: typecheck, lint, 325/325 tests (memory + local MongoDB), build.
- `pnpm audit --prod`: clean.
- `pnpm db:migrate` on local `alpha_hood_dev`: 3 migrations applied.

**Not verified**
- MySQL / PostgreSQL. They need `TEST_MYSQL_URL` / `TEST_POSTGRES_URL` (owner TODO).
- No UI change.

## 2026-11-26 — Own backend, phase 2: money stores on MySQL / PostgreSQL / MongoDB (High-risk tier: payments, wallet, stock)

**Threat model:**
- *Assets:* stock, order and payment state, store credit, Hood Coins, gift-card balances, invoice numbers.
- *Actors:* shoppers double-clicking or retrying; racing webhooks; two app servers; someone guessing a cart id.
- *Abuse cases and the layer that stops each:*
  - overselling the last unit → SKU row lock + all-or-nothing hold in one transaction;
  - spending a balance twice → locked owner balance + floor check, and UNIQUE(ledger, reference);
  - the same payment confirming twice / a payment id attached to two orders → conditional transition + unique
    payment id;
  - duplicate orders on retry → UNIQUE(customer, idempotency key);
  - duplicate or skipped invoice numbers → atomic counter in a transaction;
  - lost cart edits → version check;
  - two checkouts for the same customer on different servers → database lock;
  - cart id path tricks → id regex.

**Added**
- Migrations `2026_11_26_002_money` (SQL + Mongo, additive, reversible on local `_dev` / `_test` databases only):
  - `app_locks`, `markers`, `counters`;
  - `carts`;
  - `orders` and `order_payments`;
  - `inventory_skus`, `inventory_reservations`, `inventory_reservation_items`;
  - `ledger_owners` and `ledger_entries`;
  - `loyalty_members`, `loyalty_referrals`, `gift_cards`.
- `lib/db/primitives.ts`: lock, marker, counter and ledger (append-only, idempotent per reference, never below
  zero), for SQL and Mongo.
- `lib/db/stores/{orders,wallet,commerce}.ts`:
  - order store with the invoice series and the webhook event marker;
  - store credit, loyalty and gift cards on the ledger;
  - database carts and inventory wrapped around the catalogue adapter.
- `lib/commerce/cart-engine.ts`: the bag rules in one place, shared by the mock adapter and the database carts.
- Tests: `lib/db/money-contract.ts`, the race-heavy money contract plus a checkout API end-to-end test
  (gift card + COD → replay → cancel) on each database.

**Changed**
- `resolveOrders`, `resolveCredit`, `resolveLoyalty`, `resolveGiftCards`, `resolveLocks` and `resolveCommerce` use
  the database when `DATABASE_DRIVER` + `DATABASE_URL` are set.
- `lib/commerce/index.ts`: `commerce` now resolves the adapter on each access (the adapters are still cached
  singletons). Before this, the choice was frozen at first import.
- `lib/db/index.ts`: added `forgetDbStores()`; the test teardown drops stores built on a closed connection.

**Verified**
- `pnpm verify`: typecheck, lint, 315/315 tests (memory + local MongoDB replica set), build.
- `pnpm audit --prod`: no known vulnerabilities.
- `pnpm db:migrate` on local `alpha_hood_dev` (Mongo): 2 migrations applied.

**Not verified**
- MySQL / PostgreSQL. The contract skips them until `TEST_MYSQL_URL` / `TEST_POSTGRES_URL` are set (owner TODO).
- No UI change, so no browser check.

## 2026-11-26 — Own backend, phase 1: MySQL / PostgreSQL / MongoDB foundation + identity stores (High-risk tier: auth, personal data)

**Scope:** the store runs on its own backend, on any one of MySQL 8, PostgreSQL or MongoDB, selected by
`DATABASE_DRIVER` + `DATABASE_URL`. Phase 1 builds the foundation and the identity / DPDP stores. The guide is
`docs/backend/README.md`.

**Added**
- Packages (owner-approved 2026-11-26):
  - `kysely` (one typed SQL layer for MySQL + PostgreSQL);
  - `mysql2`, `pg`, `mongodb` (official drivers);
  - `@types/pg` (dev).
- `lib/db/config.ts`:
  - fail-closed config parsing (driver/URL mismatch and a missing database name are errors);
  - `describeTarget` (never shows credentials);
  - `assertDestructiveAllowed` (local + `_dev`/`_test` + not production).
- Connections:
  - `lib/db/sql.ts`: Kysely pools (lazy driver import, UTC, utf8mb4) and `sqlTx` (one transaction, retries
    deadlocks);
  - `lib/db/mongo.ts`: client and `mongoTx` (majority read/write concern).
- Migrations, one runner for all three engines (`lib/db/migrate.ts`):
  - `lib/db/migrations/sql.ts`: tables `consent_records`, `customers`, `customer_addresses` (FK cascade),
    `sessions`, `otp_challenges`, `otp_sends`, with UNIQUE(phone) and indexes;
  - `lib/db/migrations/mongo.ts`: collections plus UNIQUE / TTL indexes, versioned in `_migrations`.
- CLI `scripts/db.ts`: `pnpm db:status | db:migrate | db:reset | db:test:migrate`. It prints the target and
  environment first.
- Local MongoDB replica set: `pnpm db:mongo:dev` / `db:mongo:init`, port 27018, data in `.data/` (gitignored). The
  installed Windows service is untouched.
- Database stores (`lib/db/stores/*`), each for SQL and MongoDB:
  - consent ledger (append-only);
  - customers (race-safe find-or-create, address cap in a locked transaction or an atomic push, atomic counters,
    erasure);
  - sessions (token hash);
  - OTP (atomic attempt counting and single use).
- `lib/db/index.ts` `dbStores(env)`. Each `resolveX()` uses the database when one is configured; otherwise it keeps
  memory-in-dev / refuse-in-production.
- **Auth is now async end to end:**
  - `SessionStore` / `OtpStore` became async interfaces;
  - `requireCustomer`, `requireAccount`, `customerIdFromRequest`, `createSession`, `revokeSession` and
    `revokeAllSessions` return Promises;
  - all 29 call sites now `await` (checked with a scan, not just the type checker: a Promise is truthy, so a
    missing `await` would have looked "signed in").
- `lookupCoupon` moved to the server-only `lib/promotions/lookup.ts`. Through `coupons.ts` it had pulled the
  database drivers into the browser bundle.
- Tests (`lib/db/contract.test.ts`):
  - config / guard tests;
  - the same store contract on memory and every `TEST_*_URL` (races included);
  - the real API routes end to end on each database;
  - a guard that fails if any `"use client"` file can reach `lib/db` or a DB driver (proven by re-adding the leak).
- `.env.local` / `.env.test.local` created (gitignored, no secrets), plus `tsconfig` `allowImportingTsExtensions`
  for the plain-Node CLI.

**Threat model (abuse case → layer)**
- Missing `await` on an auth check reads as "signed in" → every call site awaited and scanned; the API test checks
  no-cookie → 401 on the DB path (prevent, tested).
- Session table leak → only SHA-256 hashes stored (prevent).
- OTP brute force with parallel requests → conditional increment `attempts < max` (prevent, race-tested).
- OTP replay / double use → conditional `used = false → true` (prevent, race-tested).
- Duplicate accounts for one phone → UNIQUE index plus read-back on duplicate (prevent, race-tested).
- SQL injection → Kysely bound parameters only; search input escaped for LIKE and regex (prevent, tested).
- Dropping a real database → destructive operations only on local `_dev`/`_test` (prevent, tested).
- Credentials leaking into logs → `describeTarget` strips them (prevent, tested).
- DB code in the browser → guard test (enforce, tested).

**Verification**
- `pnpm verify` ✓ (typecheck, lint, test 298/298, build) · `pnpm audit --prod`: no known vulnerabilities.
- On local MongoDB (`alpha_hood_dev`, `alpha_hood_test`, 127.0.0.1:27018): migrations applied and idempotent; all 8
  store-contract tests and the API end-to-end test pass.
- **Not done:**
  - MySQL and PostgreSQL contract runs (need the owner's credentials in `.env.test.local`).
  - Phases 2–6 (money, after-sales, catalogue, admin, seed).
  - Browser check.

## 2026-11-25 — Security review M5–M9, fix R1, roadmap

**Added**
- `docs/security/2026-11-25-security-review-m5-m9.md`: the `/security-review` of M5–M9. It records what was checked
  per milestone, 0 findings at confidence ≥ 8, the 6 candidates dropped (with reasons), 2 reliability issues and
  the pre-launch security checklist.
- `docs/roadmap.md`: what's left after M9.
  - The PRD's M10 "Differentiation": PDP-11 Ask Alpha, SRCH-03 visual search, PROMO-07 final sale, apps,
    personalisation.
  - The proposed POS (`POS.md`, not in scope until approved).
  - The ordered backend work (platform decision → DB → gateway → messaging → courier → storage → infra → CMS).
  - Non-code launch blockers and missing quality gates.

**Fixed**
- **R1 (security review):** if the gateway's `createPayment` failed after wallet tenders were taken, the order was
  left without a payment attempt, and reconciliation skipped it, so coins, gift card or store credit stayed on hold.
  - Placement now expires the order and gives back the stock and the wallet at once.
  - `reconcilePending` also expires attempt-less pending orders after the hold.
  - New test in `lib/wallet/tenders.test.ts`.

**Verification**
- `pnpm verify` ✓ (typecheck, lint, test 278/278, build).

## 2026-11-25 — M9 part 2: pay with Hood Coins, gift cards and store credit (High-risk tier: money)

**Scope:** CHK-05, PROMO-06, LOY-01 (spending coins). The how-it-works guide is in
`docs/features/m9-growth-pack.md` §12; all of M9 is documented there.

**Added**
- `lib/wallet/tenders.ts`, the one service for wallet payments:
  - plan (server-side caps; coins ≤ 20% of the products' value; order of use: coins → gift card → store credit);
  - hold (all or nothing, inside the order lock, unique references per hold);
  - release (payment failed or expired, idempotent per hold);
  - proportional refund split (never more than each part paid, whole coins) and refunds back to each instrument
    (an expired or blocked gift card → store credit).
- Treatment: tenders are payment instruments. `pricing.total`, the invoice and GST are unchanged; the new
  `order.payable` is what the gateway or the courier collects. The CA must confirm this.
- `lib/giftcards/store.ts`:
  - 16-character random codes (80 bits), only the SHA-256 hash stored, last 4 shown;
  - ₹500–₹10,000, valid 365 days, append-only ledger, never negative;
  - block / unblock;
  - failed attempts limited (`lib/giftcards/limits.ts`, plus a new `rateLimiter.peek`).
- Checkout:
  - quote and place accept `tenders`, and return `tenders`, `payable` and `wallet`;
  - `expectedTotal` is now the amount to pay;
  - a fully wallet-paid order is confirmed with no gateway payment;
  - COD risk and the COD limit are judged on the amount to collect;
  - retry takes the tenders again; reconciliation releases them on expiry;
  - a late success after a release takes them again, or goes to review.
- Cancellation returns all tenders in full. Return refunds (to source or UPI) are split in proportion.
- UI:
  - checkout step "Coins, credit & gift cards" (`components/checkout/wallet-step.tsx`);
  - summary rows and a pay button showing only what's left;
  - wallet lines on the order confirmation, account order detail, admin order view and invoice ("Paid by").
- Courier label and manifest COD amounts are now the amount to collect, not the full total.
- Admin:
  - **Gift cards** screen and APIs (`giftcards.issue`: owner, finance);
  - issue (code shown once), block and unblock, all audited.
- Coins earn only on the value not paid with coins (no coin-on-coin loop).
- Coin balances now use FIFO lots: spends and reversals come out of the right lot, so an old lot expiring can't make
  a spent balance negative.
- Legal (DPDP / Consumer Protection):
  - Terms add paying with coins and "Gift cards and store credit";
  - the Refund & Cancellation Policy adds how wallet-paid refunds are split;
  - the Privacy Notice (EN + HI) adds wallet payment data;
  - versions: Terms and Refund 2026-11-25.
- "Using coins at checkout is coming soon" copy removed from `/alpha-club` and the dashboard.

**Threat model (abuse case → layer)**
- Client sends tender amounts, or more coins than allowed → only choices accepted; the server caps from live
  balances (prevent, tested).
- Double spend: two tabs, a retry, or a race → customer lock, all-or-nothing hold, unique references, ledgers
  never negative (prevent, tested with a race).
- Gift card guessing → 80-bit codes, hashed at rest, identical errors, failure rate limits (prevent, tested).
- A stolen or lost card → staff block, audited (recover).
- Wallet lost on a payment failure → released once, retried safely (prevent, tested).
- Refund abuse (refund more than paid, cash out a gift card) → proportional split, per-instrument caps,
  wallet-paid parts never go to the gateway (prevent, tested).
- Overcharging COD → label and manifest collect only what's left (prevent, tested).
- Coin farming by paying with coins → no earn on the coin-paid value (prevent, tested).

**Verification**
- `pnpm verify` ✓ (typecheck, lint, test 277/277, build) · `pnpm audit --prod`: no known vulnerabilities.
- New `lib/wallet/tenders.test.ts` (13) and a wallet return test in `lib/returns/returns.test.ts`.
- **Not done:**
  - Browser check at 1440/390/360.
  - Selling gift cards online (a payment flow for a non-physical product, and GST at issue vs redemption).
  - `/security-review` (High tier: still required before launch).

## 2026-11-25 — M9 growth pack, part 1 (High-risk tier: loyalty value, referral discounts, personal data, UGC uploads)

**Scope:** PRD M9 — LOY-01…04, PROMO-05, PDP-04/09/10, CART-03, HOME-07/09/10, ORD-02 WhatsApp, CHK-08, ANL-03/04,
PWA. **Held back on purpose (part 2):** spending Hood Coins, gift cards (PROMO-06) and store credit at checkout
(CHK-05). They change the order total, the gateway amount, refunds and the GST invoice, and the CA must first say
whether coins are a discount or a payment.

**Added**
- **Alpha Club** (LOY-01, ACC-03): `lib/loyalty/{config,store,service}.ts`.
  - Joining needs an unticked consent box, checked again on the server, and is recorded as the `alpha_club`
    ledger purpose. Leaving withdraws consent and forfeits coins.
  - Coins ledger: append-only, idempotent per reference, never negative.
  - Coins are earned on delivery (5 / 7 / 10 % by tier), pending until the return window ends, and expire after
    365 days. Returns (not exchanges) take coins back, never more than were earned.
  - Tiers come from 12-month spend after refunds.
  - Members get a 30-day return window, snapshotted on the order at placement (`order.club`). `windowDaysFor()`
    in returns rules is the one place this is decided.
  - Account deletion erases club data.
  - UI: `/account/club` dashboard and the public `/alpha-club` page.
- **Referral** (LOY-02):
  - Each member has a random `REF…` code. It works as a coupon through `lookupCoupon()`: ₹200 off a first order
    of ₹999+.
  - Checked at placement: not your own account, not the referrer's phone, not a shared delivery address, not the
    same browser (visitor id at joining).
  - The referrer gets 200 coins on the friend's delivery (pending until the window ends); a full return reverses
    it.
  - `/r/CODE` sets `ah_ref` (30 days, necessary). The bag *offers* the code; it is never auto-applied.
- **Shop the Look** (HOME-07, PROMO-05):
  - `lib/promotions/looks.ts`. A new priceCart step after combos takes 10% off one unit of each item when the
    whole look is in the bag. Combo units are excluded, and "no stacking" coupons skip look units.
  - The `lookDiscount` and `looks` fields appear in the breakdown, with a bag row "Shop the look · …".
  - Homepage block with numbered hotspots, a size per item and "Add full look". Placeholder art (never mascot).
- **Alerts** (PDP-10, LOY-04): "Notify me" for sold-out sizes and "Price drop alert" on the product page.
  - Signed-in only, validated on the server, each alert fires once, max 30 open.
  - Swept by the cron and right after admin restocks. Managed in `/account/alerts`.
- **Notifications** (ORD-02, LOY-04): the outbox picks channels from consent.
  - WhatsApp only with the new optional `whatsapp_updates` purpose (a Settings toggle).
  - Marketing messages (abandoned checkout at 1 h and 24 h) only with marketing consent, capped at 1 per day and 3
    per week.
  - New templates: review request (3 days after delivery), back in stock, price drop.
  - `/api/cron/sweep` uses a Bearer `CRON_SECRET` (≥ 32 chars, constant-time compare) and fails closed.
- **#WearTheHood** (HOME-10, LOY-03): `lib/ugc/service.ts`.
  - Photo upload reuses the sanitised return-photo store (magic-byte check, EXIF/GPS stripped).
  - The customer may only tag products from their own delivered orders. Captions may not contain links.
  - Publishing needs an explicit consent per photo (`ugc_publish`), with the first name only.
  - Staff moderate with the new `ugc.moderate` permission (store manager, marketing, owner). Moderation is
    audited, and approval pays members 50 coins once.
  - Only approved photos are public (`/api/ugc`, served with nosniff and a sandbox CSP). The customer can delete
    a photo at once.
  - The homepage grid shows an honest "be the first" call until real posts exist, never fake UGC.
- **PDP** (PDP-04, PDP-09):
  - Size advice from the sizes the customer kept, nudged by too-small / too-large returns.
  - Rails: Complete the look (the curated look first, then rule-based) and You may also like.
  - Recently viewed: ids kept on the device in `ah_recent_products`.
- **Homepage:** Alpha Club band (HOME-09, mascot #2 and #24), Shop the Look and #WearTheHood blocks. The footer's
  "Alpha Club" link now works.
- **ANL-04 experiments** (`lib/experiments`):
  - Static config with a kill switch. Assignment happens in the browser after hydration, and only with analytics
    consent (`ah_ab_id`), so there is no layout shift and no SEO effect.
  - Sends an `experiment_view` event. One demo test is set up, switched off.
- **CHK-08** (`lib/checkout/one-click.ts`): fail-closed flag. The button cannot render until a provider
  integration exists.
- **ANL-03** (`lib/marketing/automation.ts`): a fail-closed seam with no network calls.
- **PWA:** `public/sw.js` caches only versioned static assets and serves `/offline` when a page navigation fails.
  Pages, API, account and checkout are never cached. Registered after `load` in production only; `sw.js` is served
  `no-cache`.
- **CART-03** was already covered: the mini-cart has the add-ons row and combo progress. The bag now also shows
  look savings.
- **DPDP:**
  - The Privacy Notice (EN and HI) adds Alpha Club data (including the referral fraud checks), #WearTheHood
    photos, alerts, WhatsApp updates, size advice and their retention.
  - Terms add "Alpha Club and Hood Coins" and "#WearTheHood photos" sections.
  - Cookie inventory adds `ah_ref`, `ah_recent_products`, `ah_ab_id` and the service-worker cache.
  - Withdrawing analytics also clears `ah_ab_id` and `ah_tracked_orders`.
  - New notice versions: Privacy and Cookie 2026-11-25, Terms 2026-11-24, so visitors are asked again.
- **Fixed (pre-existing):** two checkout tests had a time bomb. They reserved stock at a fixed `NOW` but read
  availability with the real clock, so they only passed within 15 minutes of that date. They now read at `NOW`.

**Threat model (abuse case → layer)**
- Coins farmed by buy-and-return → pending until the window ends, reversed on return, earned only after delivery
  (prevent, tested).
- Double earn or double referral reward on retries → unique references (prevent, tested).
- Self-referral with a second account → phone, address and visitor checks at placement (prevent, tested); a
  different device plus a new address still gets through, so it is logged as a gap (detect).
- Tier or coin values sent by the client → unknown fields rejected; tier is computed on the server (prevent,
  tested).
- Look discount gamed with partial looks or stacked coupons → whole-look rule, combo units excluded, coupon skips
  look units (prevent, tested).
- Alerts used to spam or enumerate → signed-in only, own alerts only (others get 404), 30 open, 40 per day
  (prevent, tested).
- Marketing without consent, or too many messages → consent-picked channels and frequency cap (prevent, tested).
- UGC abuse (malware or a polyglot file, GPS leak, spam links, tagging unbought items, publishing without
  consent) → sniffed and stripped upload, link filter, purchase check, consent, moderation, sandboxed serving
  (prevent and detect, tested).
- Cron endpoint triggered by anyone → secret ≥ 32 chars, constant-time compare, fails closed (prevent, tested).
- Service worker leaking personal pages → static-assets allow-list only (prevent).

**Verification**
- `pnpm verify` ✓ (typecheck, lint, test 263/263, build) · `pnpm audit --prod`: no known vulnerabilities.
- New `app/api/m9-api.test.ts` (16 tests).
- **Not done:**
  - Browser check at 1440/390/360. The dev server wasn't running; the production build shows the coming-soon
    page, so the homepage blocks are verified by tests only.
  - Lighthouse not run.
  - `/security-review` of M5–M9 not run.
  - Part 2: tenders (coins, gift cards, store credit).

## 2026-11-23 — POS (in-store Point of Sale) requirements & implementation plan (docs only, proposed scope)

**Scope:** owner request — a POS for physical stores (staff sign-in, barcode scan, GST bill, payments, returns, shifts).
PRD §2 lists "offline POS integration" as a v1 non-goal, so this is a **proposal** awaiting owner approval; no code changed.

**Added**
- `docs/alpha-hood-store-kit/POS.md`: build vs buy, roles (associate / cashier / store lead, store-scoped), devices
  (HID scanner, 80 mm printer, EDC, enrolment), PIN-on-enrolled-device sign-in, shifts & blind cash count (X/Z), selling on
  the shared `priceCart` with `channel: "pos"`, customers/consent at the counter (customer-verified OTP, `source: "pos"`),
  tenders (cash, UPI QR confirmed by gateway only, EDC, split, s.269ST / Rule 114B checks), GST bill & ≤ 16-char series,
  in-store returns incl. online orders, per-location stock / transfers / stock take / labels, reports & loss-prevention
  exceptions, NFRs, threat model, reuse map onto existing modules, new `lib/pos/*` modules, routes, DB tables and
  milestones POS-M0…M6.

**Found while analysing:** the online GST invoice number `INV/2026-27/000001` is 18 characters; GST Rule 46 allows at
most 16 (logged in `docs/known-gaps.md`, fix planned in POS-M0 / BILL-02, CA to confirm).

**Verification:** docs only — no `pnpm verify` needed; nothing built or run.

## 2026-11-24 — Fix: instant navigation on dynamic routes ("URL data during prerendering")

**Problem:** in dev, Next 16 (Cache Components + Partial Prefetching) flagged `/men/[category]`: `params` awaited
outside `<Suspense>`, so client navigation to the page blocked with no loading UI. The same pattern was in
`/men/[category]/[sub]`, `/collections/[handle]`, `/products/[handle]`, `/help/[slug]`, `/legal/[slug]` and
`/legal/[slug]/hi`.

**Fix** (Next docs: instant-navigation, migrating-to-cache-components):
- Each page's default export is now a sync shell. The params-dependent work moved into a `…Content` component
  inside `<Suspense>`, so the shell renders at once and the content streams in.
- New fallbacks with the same shape as the page: `ListingPageSkeleton` (header, rail, grid), `PdpSkeleton`
  (gallery and panel) and `TextPageSkeleton` (860 px text column).
- `generateMetadata` still reads `params`, which counts as runtime data. Following the docs, a
  `<DynamicMarker />` (`await connection()` inside `<Suspense>`, `components/store/dynamic-marker.tsx`) is rendered
  on these pages, so the shell prerenders and the metadata streams. It is rendered in the "store not live"
  (Holding) branch too; without it, the production build failed on `/collections/[handle]`.
- Tried and rejected: `"use cache"` in `generateMetadata`. Params are runtime data, so it did not help.

**Effect:** these routes are ◐ (static shell plus streamed content). `/legal/*` and `/help/*` went from fully static
to ◐ because of the marker.

**Verification**
- `pnpm verify` ✓ (typecheck, lint, test 247/247, build).
- On the running dev server (port 3001): `/men/jeans`, `/men/jeans/baggy`, `/collections/winter-drop`, `/help/faq`,
  `/legal/privacy` and a product page return 200. Title and canonical are rendered. No instant / URL-data entries in
  `.next/dev/logs`.
- **Not done:** the dev overlay check itself runs in the browser on client navigation, so please confirm the
  overlay is gone there.

## 2026-11-24 — Pages redesigned with the "ALPHA" mascot images (MASCOT_PROMPTS §7)

**Scope:** place the owner's 41 generated images (`E:\TheAlphaHoodImages`) by the placement map in
`MASCOT_PROMPTS.md` §7. The full map (used, kept for M9, not used and why) is in `docs/brand/mascot/README.md`.

**Added**
- `scripts/build-mascot.py` builds web WebP files plus hero composites (16:7 desktop, 4:5 mobile) into
  `public/mascot/`. The 24 images and 6 composites are about 2.3 MB, from 73 MB of PNG. Originals are not committed.
- `lib/brand/mascot.ts` is a typed registry with intrinsic sizes and the sampled background colour.
  `components/brand/mascot.tsx` renders `<Mascot>` with next/image (AVIF/WebP, lazy, `blend` so grey backgrounds
  vanish).
- `next.config` images: AVIF + WebP; srcset widths trimmed to 1920 px.
- Homepage:
  - The hero has 3 mascot slides: rooftop (#21), hood-up drop (#15) and delivery run (#10), with new copy.
  - Collection tiles use the winter, linen and denim looks (#16, #17, #19). "Knit club" became "Denim days".
  - The promo band uses the shopping haul (#6).
  - A new `campaign_band` CMS block, "One pack. Every fit.", uses The Pack (#22).
- Pages:
  - **Coming-soon page** (production today): hood-up (#15) as its LCP image.
  - **About** redesigned: hero stance (#1), The Pack (#22) and an "Every season" strip (#16–20).
  - **404:** peek (#14).
  - **Empty bag** (mini-cart and /bag) and **empty wishlist:** sleeping (#13).
  - **Empty category:** sneaker boxes (#7).
  - **Order confirmation:** celebration (#12), only when the order is confirmed.
  - **Size guide** modal and page: measuring (#8).
  - **Track order** and /help/shipping: delivery run (#10).
  - **FAQ:** thinking (#11).
  - **Sign-in:** welcome salute (#5), desktop only.
  - **Footer newsletter:** pointing (#4).
- The character reference sheet is in `docs/brand/mascot/`. CLAUDE.md has the mascot rule.

**Not used (by design):** merch and packaging mockups and the billboard (they would look like products for sale),
the old logo concepts (replaced by the logo kit), the Stride image (painted fake transparency) and near-duplicates.
Alpha Club, #WearTheHood and Ask Alpha images are ready for M9.

**Verification**
- `pnpm verify` ✓ (typecheck, lint, test 247/247, build). A new test checks that every registered mascot file exists
  and that hero slides have alt text.
- Built HTML: mascot `<img>` tags have width and height. Below-fold images are lazy; the coming-soon and About hero
  images are preloaded.
- **Not done:** browser check at 1440/390/360 and Lighthouse. The homepage with mascots renders only with demo data
  (dev).

## 2026-11-24 — Brand logo kit wired in (before M9)

**Added**
- The owner's logo kit (v1), complete, in `docs/brand/logo-kit/` (SVG, PNG and PDF masters, the brand sheet and its
  usage rules, README). Web copies:
  - `public/brand/logo/` (SVG lockups and marks, plus PNG marks);
  - `public/brand/icons/` (brand icons, not used yet);
  - `public/brand/social/`;
  - `public/icons/` (Android and maskable PNGs).
  The SVGs were checked first: path data only, no scripts or external references.
- Favicon and app icons through Next.js file conventions: `app/favicon.ico` (16/32/48 px), `app/icon.svg`,
  `app/apple-icon.png` (180 px), and `app/manifest.ts` (192/512/maskable, theme #0A0A0A). The generated placeholders
  `app/icon.tsx` and `app/apple-icon.tsx` were removed.
- Share image: `app/opengraph-image.png` (the kit's 1200×630) with alt text. Per-product cards now carry the real
  lockup, read from `assets/brand/`.
- `components/store/logo.tsx` now uses the kit lockup everywhere the logo appears:
  - header, the "coming soon" header, 404, checkout and menu drawer use `primary-horizontal_color`;
  - the footer uses `_color-on-dark`;
  - the "coming soon" page also shows a large on-dark mark.
  Width and height are set on every image, so nothing shifts while loading.
- Admin: the sidebar uses the on-dark lockup (the mark when collapsed). The mobile topbar and the sign-in card follow
  the light/dark theme.
- Organization structured data logo: `/brand/logo/mark_color@600.png`.
- DESIGN.md §1 and CLAUDE.md now record the final logo and its usage rules.

**Verification**
- `pnpm verify` ✓ (typecheck, lint, test 246/246, build).
- The built HTML has `favicon.ico`, `icon.svg`, `apple-touch-icon`, `manifest.webmanifest`, `og:image`
  (1200×630) and the header logo `<img>` with width and height.
- **Not done:** visual check in a browser at 1440/390/360 (not run). The footer logo only renders when CMS footer
  content exists (dev / mock data).

## 2026-11-24 — M8 SEO, analytics, legal pages & performance (High-risk tier: trackers + personal data to third parties)

**Scope:** PRD M8 — CMS-03, CMS-04, ANL-01, ANL-02, §7. Done-when (PRD): Lighthouse ≥ 90 mobile; events validated in
GA4 DebugView and Meta Events Manager; legal pages live. **Status:** the code is done and tested. The Lighthouse and
DebugView checks are not done (no IDs, no browser run) — see Verification.

**Added**
- CMS-03 SEO:
  - `app/sitemap.ts`: home, categories, sub-categories, collections, every product, and the help and legal pages
    (Hindi too). Canonical URLs only.
  - `app/robots.ts`: private areas are disallowed.
  - `lib/seo/indexing.ts` fails closed: robots disallows everything, and pages are `noindex`, unless the build is
    production with a real `SITE_URL`, no demo data, and `ALLOW_INDEXING=true`.
  - `lib/seo/site.ts`: `SITE_URL` is validated as a bare https origin. Root metadata gets `metadataBase`, OG/Twitter
    defaults and `en_IN`.
  - Structured data: Organization and WebSite (sitelinks SearchAction) on the home page; BreadcrumbList on listing,
    help and size-guide pages.
  - Open Graph cards and icons drawn with `next/og` (placeholders), with a per-product share card.
  - Redirects manager `lib/seo/redirects.ts`: one list applied by `next.config`, validated at build. No external
    targets, loops, duplicates or chains.
- CMS-04 pages:
  - `/help/shipping`, `/help/faq`, `/help/size-guide`, `/about` and `/contact`. The contact page has seller details,
    GSTIN and the Grievance Officer, as the E-Commerce Rules 2020 require.
  - Returns and cancellation redirect into the Refund & Cancellation Policy.
  - Text lives once in `lib/content/pages.ts`. Every fee and window is filled from the same config checkout uses.
    Shipping fee, COD fee and COD limit moved into `STORE_CONFIG`; previously they were defined twice.
  - The footer's dead Alpha Club link was replaced with FAQ.
- ANL-01 analytics:
  - Event catalogue: `lib/analytics/events.ts` (GA4 e-commerce, Meta standard events and the PRD §11 custom events).
  - Browser `track()` (`lib/analytics/client.ts`) reads the consent cookie on every call:
    - GA4 only with analytics consent; Meta Pixel and Google Ads only with advertising consent.
    - Scripts load only through `ConsentScript`.
    - A purchase is counted once per device.
    - Search terms and coupon codes that look like a phone number or email are dropped.
  - Wired events:
    - Browsing: view_item_list, select_item, view_item, size_selected, size_guide_open, pincode_check, search.
    - Bag: add_to_wishlist, add_to_cart, view_cart, coupon_apply.
    - Checkout: begin_checkout, add_shipping_info, cod_selected, add_payment_info, purchase.
    - Returns: return_request, exchange_chosen.
  - Server side:
    - The consent snapshot is stored on the order at placement (`lib/analytics/attribution.ts`), holding only the
      identifiers that consent covers.
    - Meta Conversions API `Purchase` uses the same event id as the Pixel, so Meta counts it once. The phone is
      SHA-256 hashed.
    - GA4 Measurement Protocol `refund` events are sent for cancellations and returns.
    - Events are queued and sent after the response with a 3 s timeout. Nothing is sent without the secret *and*
      consent.
- ANL-02 feed:
  - `GET /feeds/products.xml` uses the Google Merchant RSS format, which Meta also reads.
  - One item per size, grouped by product id (the same id the events send). Sale price only when below MRP; stock
    per size.
  - XML-escaped, rate-limited, `noindex`.
- §7 RUM: Next's built-in `useReportWebVitals` sends LCP, INP, CLS, TTFB and FCP to `/api/rum`.
  - The endpoint is same-origin, rate-limited and capped at 256 B.
  - Only the metric, value, route template and device class are kept. No IP, cookie or URL.
  - Admin Reports shows p75 against the targets.
- DPDP: the Privacy Notice (EN + HI) now names Google Analytics 4, Google Ads and Meta Pixel + CAPI, the data each
  gets, the consent basis, transfers outside India and retention. Cookie inventory adds `_fbc`, `_gcl_*` and
  `ah_tracked_orders`. Both notices are now version 2026-11-24, so visitors are asked for cookie consent again.

**Threat model (abuse case → layer)**
- Tracker fires before consent / after withdrawal → consent read per event, scripts gated, withdrawal reloads and
  deletes cookies (prevent, tested).
- PII leaks to Google/Meta via search terms, coupons or payloads → filtered; contact data hashed and only with
  advertising consent (prevent, tested).
- Server events sent for shoppers who never consented → snapshot required, else nothing (prevent, tested).
- Secret leak → CAPI token and GA4 secret are server-only env vars (never `NEXT_PUBLIC_*`), sent in the body or
  query to the provider only, and never logged (prevent).
- Third-party outage slows checkout → sent after the response, timeout, failures swallowed (prevent, tested).
- Open redirect / redirect loop through the manager → validated at build (enforce, tested).
- Preview or demo store indexed → fail-closed robots and `noindex` (prevent, tested).
- XML injection through catalogue text in the feed → escaped (prevent, tested).
- RUM endpoint abused to store data or flood → same-origin, rate limit, size cap, allow-listed metrics, route
  templates only (prevent, tested).
- XSS through JSON-LD or the tracking JSON → `toJsonLd` escaping (prevent, tested).

**Verification**
- `pnpm verify` ✓ (typecheck, lint, test 246/246, build) · `pnpm audit --prod`: no known vulnerabilities.
- Build output includes `/sitemap.xml`, `/robots.txt`, `/icon`, `/opengraph-image`, the help, about and contact pages,
  and `/feeds/products.xml`.
- **Not done:**
  - Lighthouse mobile ≥ 90 not measured, and no Lighthouse CI (needs `@lhci/cli`, owner OK).
  - GA4 DebugView, Meta Events Manager and Google Ads validation (no IDs yet).
  - Browser walk-through at 1440/390/360 not run.
  - `/security-review` of M5–M8 not run.

## 2026-11-24 — Fix: production build failed on `/account/orders/[number]` (GLB-04)

**Fixed**
- The Vercel build (commit `7ebcf01`) failed with `CLIENT_HOOK_DYNAMIC`. `MobileTabBar` calls `usePathname()`, and
  on a dynamic-param route without `generateStaticParams` the pathname is only known at runtime. The bar sat
  outside any `<Suspense>` in `app/(store)/layout.tsx`, so it blocked the prerendered shell. It is now wrapped in
  `<Suspense fallback={null}>`, the same pattern as `CheckoutHeader`. The bar is `position: fixed`, so there is no
  layout shift. Static routes still prerender it.

**Threat model**
- No change to data, auth or money. Layout only.

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` 219/219 ✓ · `pnpm build` ✓ (all routes generated).
- **Not done:** visual check at 390 / 360 px of the tab bar on an order-detail page.

## 2026-11-24 — Admin 2-step setup by QR code (ADM-08)

**Added**
- The authenticator enrolment step at `/admin/login` shows a QR code of the `otpauth://` URI (scan with Google /
  Microsoft Authenticator, 1Password or any TOTP app). The setup key and the "open on this device" link stay under
  "Can't scan? Enter the key instead".
- Dependency `qrcode.react` 4.2.0 (owner approved, 2026-11-24): ~15 KB, no dependencies, draws a React SVG (no raw
  HTML), loaded only on the admin sign-in page.

**Threat model**
- Secret leaked to a QR web service → the QR is drawn in the browser from the enrolment response; nothing leaves the
  device (prevent).
- Secret cached or re-shown → enrolment response is `no-store` and returned only once per ticket, before TOTP is on
  (prevent, existing tests).
- Shoulder-surfing during setup → same exposure as the typed key; the code is only shown on the first sign-in (accepted).

**Verification**
- The rendered QR was decoded with OpenCV's QR detector: it returns the exact `otpauth://` URI (57×57 modules, long
  email address).
- `pnpm verify` ✓ (typecheck, lint, test 219/219, build) · `pnpm audit --prod`: no known vulnerabilities.
- **Not done:** scanning with a phone in a real browser (not run).

## 2026-11-23 — M7 admin & ops (High-risk tier: admin powers, refunds, personal data)

**Scope:** PRD M7 — ADM-01…08. Done-when: staff can run the day (confirm, pack, ship, RTO, returns QC, COD payouts,
stock, customers, privacy inbox, reports) from `/admin`, every action role-checked on the server and audited.

**Added**
- Staff auth (ADM-08) `lib/admin/{crypto,staff,auth}.ts`: scrypt passwords (≥ 12 chars), **mandatory TOTP** (RFC 6238,
  ±1 step, replay-protected) on every sign-in; password → 5-min single-use ticket → code → `ah_admin` cookie
  (HttpOnly, SameSite=Strict, 12 h absolute / 30 min idle, token stored as SHA-256). Lockout after 5 failures (15 min),
  constant-time dummy hash for unknown emails. First owner via `/admin/setup` only while no staff exist (production
  also needs `ADMIN_SETUP_TOKEN`); everyone else via one-time 24 h invite links. Role change / disable / MFA reset
  revoke that person's sessions.
- RBAC `lib/admin/permissions.ts`: owner, store manager, catalog editor, support, warehouse, marketing, finance;
  permission map checked by `requireStaff` on each of the 28 `/api/admin/*` routes; refund / credit limits per role.
- Append-only audit log `lib/admin/audit.ts` (actor, action, record, details, IP) for every staff mutation; `/admin/audit`.
- Ops `lib/admin/ops.ts` reusing the M6 services (no second copy of a rule): orders list/search/filters, hold / release
  (incl. high-risk COD confirmation), pack → ship (AWB + GST invoice) → out for delivery → delivered / RTO, staff
  cancel until packed; printable shipping label and daily courier manifest; returns pickup + QC pass/fail; COD UPI
  payout queue with UTR; stock adjustments with reason; customers (masked phone/email, COD block, store-credit
  adjustments); privacy/grievance inbox with acknowledge / in progress / resolved / rejected and 48 h / 30 day dates;
  reports (orders, revenue, AOV, COD share, RTO, GST, by day, categories, return reasons) + orders CSV (formula-injection
  safe); read-only products and promotions.
- Admin UI (`/admin`, admin-panel-design): dark sidebar from one role-keyed `NAV_CONFIG`, topbar, mobile bottom tab bar,
  light/dark scoped to `#admin-root`, PageHeader → URL filters (350 ms search) → card, DataTable with empty / loading /
  error states, sonner toasts, AlertDialog for every destructive action, Hugeicons only. 16 screens + sign-in / setup /
  invite. `noindex` (metadata + `X-Robots-Tag`) and `Cache-Control: no-store` on `/admin`.
- Store extensions: inventory `adjust` / `snapshot`; customers `search` / `setCodBlocked` / `recordRto`; orders `hold`,
  `listByCustomer`, `listRecent`; privacy requests `list` / `get` / `setStatus` with a status log.
- Removed the dev stand-ins `/dev/orders` and `/api/dev/fulfilment` (the admin panel replaces them).

**Threat model (abuse case → layer)**
- Stolen staff password → mandatory TOTP, lockout, generic errors (prevent, tested).
- TOTP replay / ticket reuse → last-used step stored (tested), ticket single-use + 5 min (prevent; ticket reuse not yet
  covered by a test).
- Lower role calls a higher-role endpoint (BFLA) → `requireStaff(permission)` on every route; guard test fails if an
  admin route lacks it (prevent + enforce, tested).
- CSRF on admin writes → SameSite=Strict + same-origin check + JSON-only bodies (prevent, tested).
- Support refunds / credits a large amount → per-role money limits on the server (prevent, tested).
- Double payout / double QC settlement → idempotent references, order lock (prevent; QC settle-once tested in M6,
  payout-twice not yet covered by a test).
- Insider misuse → append-only audit log, masked customer data, role-limited screens (detect).
- Owner takeover via setup page after launch → refused once any staff exists (prevent, tested); production also needs
  the setup token (not yet covered by a test).
- CSV export opened in Excel runs formulas → cells starting `= + - @` escaped (prevent, tested).
- Disabled / demoted staff keeps a session → sessions revoked on change (recover, tested).

**Verification**
- `pnpm verify` ✓ (typecheck, lint, test 219/219, build) · `pnpm audit --prod`: no known vulnerabilities.
- **Not done:** browser walk-through at 1440/390/360 (not run, per the owner's earlier stop) and the High-tier second
  review (`/security-review`) of M5–M7.

## 2026-11-23 — M6 account, orders & returns (High-risk tier: refunds, auth, personal data, uploads)

**Scope:** PRD M6 — ACC-01/02, ORD-01…04, RET-01…04. Done-when: a customer can track, cancel and request an
exchange; refunds / store credit flow tested.

**Added**
- Account (`/account`, `/account/orders[/n[/return|/invoice]]`, `/account/addresses`, `/account/settings`, `/wishlist`):
  phone-OTP sign-in/up (ACC-01) with the Terms/Privacy notice; overview with store credit; orders list + detail;
  addresses; profile (name, email); notification preferences that ARE consents (each change → ledger row with user id);
  download my data (JSON); sign out / sign out on all devices; delete account (typed confirm, refused while an order or
  return is in progress; erases profile/addresses, withdraws consents, revokes sessions, keeps tax records).
- ORD-01 `lib/orders/lifecycle.ts`: state machine placed → confirmed → packed → shipped → out for delivery → delivered,
  plus cancelled / RTO / returned; timeline; courier AWB at dispatch; GST invoice with a gap-free number per Indian
  financial year (INV/2026-27/000001) issued at dispatch; printable invoice page.
- ORD-02 `lib/notify/outbox.ts`: transactional notifications queued per event (templates + refs only, no PII bodies).
- ORD-03 `/track-order`: order number + phone OTP; identical response whether or not the phone matches (also during the
  resend cooldown); verifying signs the owner in and opens the order.
- ORD-04 cancel before packing: stock restocked, prepaid refunded in full to source once (`cancel:<order>` reference).
- RET-01…04 `lib/returns/*`: rules (7-day window, 24 h + photos for damaged/wrong, hygiene categories, first return free
  then ₹99, never for faults); exchange-first (same product, new size held in stock), store credit +5% bonus, refund to
  source (prepaid) or UPI / store credit (COD); reverse pickup with date/slot; QC pass → restock + settle once (gateway
  refund, credit ledger or exchange commit); QC fail → nothing paid; customer can cancel before pickup.
- Store credit `lib/wallet/store-credit.ts`: append-only ledger, idempotent per reference, no negative balance.
- Private return photos: JPEG/PNG sniffed by magic bytes, ≤ 5 MB enforced while streaming, EXIF/GPS (JPEG APPn, PNG
  text/eXIf) stripped, random ids, owner-only reads with `nosniff` + `sandbox` CSP + `no-store`; 20/day per customer.
- Gateway `refund()` (never above captured, idempotent per reference); inventory `restock()`; shipping
  `createShipment` / `bookPickup`; `revokeSession` / `revokeAllSessions`; customers name / remove address / erase.
- `ACCOUNTS_ENABLED` kill switch (fail closed; on in `.env.development`); OTP sign-in runs when checkout or accounts is on.
- Dev tool `/dev/orders` + `/api/dev/fulfilment` (stands in for courier / warehouse until M7) — 404 unless dev pages AND
  mock data are allowed.
- `AlertDialog` primitive, used for every destructive action (cancel order / return, remove address, delete account).
- DPDP: Privacy Notice (EN + HI) lists the UPI ID for COD refunds and store credit with retention; Cookie Policy lists
  `ah_wishlist`; retention schedule updated.

**Threat model (abuse case → layer)**
- IDOR on orders, invoices, returns, photos, addresses → owner checks, 404 for others (prevent, tested).
- Refund more than paid / twice → capped at captured − refunded, unique references, order lock (prevent, tested incl.
  concurrent cancel).
- Return more units than bought / outside the window / hygiene items / fake damage → server rules, photos, 24 h (prevent, tested).
- Client-sent amounts or fees → unknown fields rejected; server computes value, fee, bonus (prevent, tested).
- Exchange into an out-of-stock size → stock hold or refusal (prevent, tested).
- Malicious upload (SVG/HTML/polyglot, huge file, GPS leak) → magic-byte sniff, streaming size cap, metadata strip,
  sandboxed private serving (prevent, tested).
- Order / phone enumeration via track-order → identical responses + decoy challenge id (prevent, tested).
- Stolen session → sign out everywhere; deletion revokes all sessions (recover, tested).
- Dev fulfilment tool on the live store → 404 unless dev + mock flags (prevent, tested).

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` 205/205 ✓ · `pnpm build` ✓.
- Fixed during review: track-order returned 429 for the real phone during the OTP cooldown (enumeration leak); the
  financial-year boundary test was wrong (23:30 IST on 31 March is still the old year).
- **Not done:** browser walk-through at 1440/390/360 (not run, per the owner's earlier stop) and the High-tier second
  review (`/security-review`) of M5 + M6.

## 2026-11-22 — M5 cart & checkout (High-risk tier: money, auth, personal data)

**Scope:** PRD M5 — CART-01/02/04/05, CHK-01…07, 09, 10, PROMO-01…04. Reference: `reference/04-checkout.png`,
`05-mobile.png` (bag). Payment gateway, SMS provider and database are still undecided, so all three run on
fail-closed demo implementations.

**Added — money (server only, integer paise)**
- `lib/pricing/price-cart.ts` — the one money function: catalogue price → automatic discount (PROMO-02) → combos
  (PROMO-04, proportional split per unit) → coupon (PROMO-01) → prepaid offer (PROMO-03) → shipping / express / COD
  fee; per-line GST with slab, CGST+SGST vs IGST (CHK-10, `lib/pricing/gst.ts` — DEMO rate table, CA to confirm).
- `lib/promotions/coupons.ts` eligibility (min cart, first order, per-customer limit, prepaid-only, categories,
  combo exclusion, expiry); `combos.ts`; `automatic.ts` (+ prepaid offer config).
- `lib/cart/service.ts` — one bag service: re-validates every line against catalogue + live stock (CART-05: price
  changes adopted and flagged, quantities clamped, sold-out flagged), prices it, lists offers.
- Commerce adapter: random 128-bit cart/line ids, `setCoupon`, `refreshLine`, `clear`, `getProductById`, and
  `inventory.*` with atomic all-or-nothing reservations (15 min hold), commit and release.

**Added — identity & checkout**
- Phone OTP (`lib/auth/otp.ts`): CSPRNG 6 digits, HMAC-hashed with `OTP_PEPPER` (required in production), single-use,
  5 min, 5 attempts then locked, 30 s cooldown, 5/hour and 10/day per phone, per-IP limits; codes never logged.
- Sessions (`lib/auth/session.ts`): random 256-bit token in an HttpOnly cookie, only its SHA-256 stored, new token per
  sign-in. Customers created at OTP verify record `terms_privacy` in the consent ledger (DPDP; notice next to button).
- `lib/checkout/service.ts`: `quote`, `placeOrder` (per-customer lock, Idempotency-Key, `expectedTotal` must equal the
  server total, address ownership, serviceability, COD rules, stock reservation), `handlePaymentEvent` (idempotent per
  event id and attempt; amount must match; late success re-reserves or goes to review), `retryPayment`,
  `reconcilePending` (missed webhooks, expiry + stock release).
- COD risk (`cod-risk.ts`, CHK-07): kill switch, pincode COD availability, max ₹5,000, customer RTO/blocked, high-RTO
  pincodes, address quality; risk score stored on the order.
- Payment gateway interface + signed demo gateway (`lib/payments/gateway.ts`): HMAC over timestamp + raw body,
  constant-time compare, ±5 min replay window. Demo gateway/SMS only in `next dev` or with `ALLOW_MOCK_PAYMENTS=true`.
- Kill switches `CHECKOUT_ENABLED`, `COD_ENABLED` (fail closed; on in the committed `.env.development` only).
- Routes: `/api/cart`, `/api/cart/lines[/id]`, `/api/cart/coupon`, `/api/otp/send|verify`,
  `/api/checkout/state|quote|addresses|place|retry`, `/api/orders/[number]` (owner only), `/api/payments/webhook`
  (signature, no same-origin check), `/api/payments/demo` (demo only, owner only).
- UI: server-backed `StoreUIProvider` + mini-cart; `/bag` (size/qty in place, delivery estimate, move to wishlist,
  coupon + "View all offers", breakdown, combo nudge, mobile fixed total); `/checkout` (distraction-free layout, OTP
  contact, pincode-first address with auto city/state, delivery speed, payment methods with UPI offer and COD
  eligibility, sticky summary / collapsible on mobile); demo payment page; confirmation with polling and retry.
  PDP BUY NOW now goes to checkout. Cookie Policy lists `ah_cart` and `ah_session`.

**Threat model (abuse case → layer that stops it)**
- Tampered price / quantity / coupon amount → server prices from catalogue, unknown fields rejected, quantity 1–5
  (prevent, tested). Stale or forged total → `expectedTotal` must match, else 409 (prevent, tested).
- Double click / retry creates two orders → Idempotency-Key + per-customer lock (prevent, tested concurrently).
- Overselling the last unit → atomic reservation (prevent, race-tested).
- IDOR: other cart lines, addresses, orders, payments → cookie-scoped cart, ownership checks, 404 (prevent, tested).
- Forged / replayed / tampered webhook → HMAC + timestamp window + event-id dedupe + amount check (prevent, tested);
  invalid signatures logged (detect).
- Paid but not confirmed → reconciliation job (recover, tested). Paid after stock gone → `needs_review` for refund.
- OTP brute force / SMS cost abuse → hashed codes, attempt lock, cooldown, hourly/daily caps per phone and IP (prevent, tested).
- Coupon guessing → 10 per 10 min + 40/day per IP, one generic message (prevent, tested).
- Session theft from storage → only hashes stored; HttpOnly + SameSite=Lax cookies (prevent).
- Demo payment / SMS reaching the live store → off unless `ALLOW_MOCK_PAYMENTS=true` (prevent, tested); abuse of a live
  flow → kill switches (recover).

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` 179/179 ✓ (incl. 300 random carts against the money invariants,
  concurrent last-unit orders, idempotent double submit, webhook forgery/replay/amount tampering, reconciliation,
  full HTTP flow OTP → address → quote → place → signed payment → owner-only order) · preview `pnpm build` ✓.
- Fixed during review: `useParams`/`usePathname` needed `<Suspense>` under Cache Components; coupon combo exclusion
  per unit (not per line); dead coupon ✕ button and an unconditional "Free shipping" claim in `OrderSummary`.
- **Not done:** the browser walk-through at 1440/390/360 (stopped at the owner's request) and a second security review
  (`/security-review`) required for the High tier.

## 2026-11-22 — PLP-08 "on the rail" gallery on collection pages

**Scope:** owner request — a showroom clothing-rail gallery at the top of every collection page (sale and all others),
above the product grid, one shared component fed with each collection's own products. Design inspired by 21st.dev
"product-rail-gallery" (DHxWhy, MIT); its source needs a 21st.dev API key, so it was rebuilt from the published
description for this store's tokens, `GarmentArt` and commerce types (no new dependencies).

**Added**
- `components/listing/product-rail-gallery.tsx` — `ProductRailGallery({ products, eyebrow?, title?, hint?,
  hangerStyle?: "wood" | "metal", onOpenChange?, className? })`. Hangers sit side-on; hover / focus / first tap turns
  one to face you (perspective rotateY) with a name + price tag; drag pushes neighbours along the rail and released
  garments swing and settle; click / Enter / second tap lifts it into a Radix dialog (front/back flip, price, colours,
  size picker, Add to bag, link to the PDP; Escape, focus trap, focus returns to the hanger). Arrow keys / Home / End
  (roving tabindex). 5 / 6 / 8 hangers at <640 / <1024 / ≥1024 px, centred cluster when the collection is small.
  `prefers-reduced-motion`: no physics or sway. One gentle sway when it scrolls into view (settles < 2 s).
- `lib/catalog/rail.ts` — `pickRailProducts` (in stock, one colour per style, most popular first, max 8) and
  `stepRail` (1-D spring + pendulum, hooks never cross, frame-gap clamp), with tests in `rail.test.ts` (9).
- `/collections/[handle]` renders the rail between the header and the filter bar when ≥ 3 products qualify; title
  "Steals on the rail" for `sale` / `price-drop`, "Top picks" elsewhere.

**Decisions**
- Rail products come from the same cached `getListing` call the page already makes — no extra fetch, cache entry or
  API. Animation runs in rAF only while something moves and writes `transform` only (no layout, INP/CLS-safe); stage
  height is fixed so nothing shifts.
- Hit area is the side-on garment's width (wrappers `pointer-events-none`) so on a packed mobile rail a tap hits the
  garment you see.

**Threat model**
- No new input, endpoint or personal data. Product text renders as React text; prices are display-only — Add to bag
  goes through the existing `useStoreUI().addToBag` and the cart re-prices on the server (M5). Colours pass the
  existing `GarmentArt` hex allow-list. No tracker, no consent change.

**Verification**
- `pnpm verify` ✓ (typecheck, lint, test 130/130, build).
- Headless Chrome (CDP device emulation) on `/collections/sale` and `/collections/winter-drop` at 1440/390/360:
  overflowX 0; 5 hangers inside the stage; hover turns a hanger; a 220 px drag pushes the neighbour 82 px and doesn't
  open the dialog; everything settles; click opens the dialog, Back flips, Escape closes and focus returns to the
  hanger; ArrowRight moves focus; touch: first tap turns, second tap opens; dialog fits 390 px. No new console errors.
- Not checked: real-device feel of the physics, VoiceOver/TalkBack pass, Lighthouse numbers.

## 2026-11-22 — M4 product page

**Scope:** PRD M4 — PDP-01…03, 05…08, 12. Reference: `reference/03-product-page.png`, `05-mobile.png` (PDP screen).

**Added**
- `/products/[handle]` (prerendered per colour variant, cached minutes): breadcrumbs, gallery, info column, reviews,
  JSON-LD. Root 404 for unknown handles.
- PDP-01 `components/pdp/gallery.tsx`: desktop large image + 2-column grid; mobile scroll-snap carousel (470 px) with
  dots, wishlist + share on the image; zoom lightbox (click/tap to zoom, pinch on touch, ←/→, counter).
- PDP-02: price, MRP strike + % off, "MRP inclusive of all taxes", rating chip linking to reviews, best coupon box
  (`lib/promotions/coupons.ts` — integer-paise coupon maths M5 will reuse; demo coupons).
- PDP-03: colour thumbnails are links to each colour's URL; size picker (sold-out strike, "2 left"); size guide modal
  (`lib/catalog/size-charts.ts`: tops/bottoms/shoes, cm ⇄ in, how to measure, model height/size); fit note from
  review fit votes + model info.
- PDP-05: `lib/shipping` adapter (Shiprocket/Delhivery pending) + `GET /api/delivery?pincode=` — date (Sundays and
  2 pm IST cut-off), COD availability + fee, express option; promise bar under sizes; pincode remembered on the device
  (`ah_pincode`, added to the Cookie Policy).
- PDP-06: ADD TO BAG + wishlist, BUY NOW (adds + opens the bag until checkout exists in M5), "Please select a size"
  guard, mobile fixed bar (tab bar hidden on PDP), desktop sticky bar after scrolling past the CTA.
- PDP-07 accordions: Delivery & returns, Description & fit (specs + SKU), Manufacturer details (Legal Metrology:
  marketed by, manufacturer, packer, country of origin, net quantity, MRP, customer care — placeholders, never invented).
- PDP-08 `lib/reviews` adapter (Judge.me/Okendo/own pending): summary, distribution, fit meter, filters (rating, with
  photos, size), sort, load more, verified badge, one-per-browser helpful votes (`POST /api/reviews/helpful`),
  category fallback when a style has none. "Write a review" is replaced by a verified-buyers note until orders exist (M6).
- PDP-12: share (native sheet / WhatsApp / copy link); `Product` + `Offer` + `AggregateRating` (own reviews only) +
  `BreadcrumbList` JSON-LD via `toJsonLd` (escapes `<`, `>`, `&`, U+2028/9).
- Catalogue: `Product` gains `styleId`, `sku`, `description`, `specs`, `sizeChart`, `model`, `legal`; 4 placeholder
  views per colour (front, on model, back, detail). Card ratings are now computed from the same demo reviews.

**Changed**
- `ColourPicker` link mode; `DeliveryCheck.initialPincode`; `ReviewSummary` optional `footer` (no dead button) and
  nullable fit; `GarmentArt` renders `view` variants; listing `Breadcrumbs` extracted; `SITE_URL` env for canonical data.

**Threat model**
- XSS via catalogue text in JSON-LD → escaped serialiser (prevent, tested).
- Helpful-vote stuffing → one vote per visitor per review, per-IP limit, unknown fields/ids rejected, no client-set
  counts (prevent, tested). Fake reviews in production → mock reviews refused outside dev/preview (prevent, tested).
- Pincode endpoint abuse/enumeration → 6-digit allow-list, 30/min per IP, not stored or logged server-side (prevent, tested).
- Price tampering → PDP price is display only; bag/checkout re-price on the server (M5).

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` 121/121 ✓ · `pnpm build` ✓ (see final run below).
- Preview build in headless Chrome at 1440/390/360: overflowX 0, no console errors; size-less add → "Please select a
  size"; add M → "Bag, 1 item"; size guide 7 rows, inches toggle; pincode 411045 → delivery Thu 26 Nov, COD ₹49,
  express, saved on device; lightbox 1/4; reviews filter 5★, helpful vote counted; desktop sticky bar; sold-out style
  shows "Sold out"; category fallback text; unknown handle → 404. Compared with reference/03.
- Fixed during review: SKU prefix hyphen ("T-S"), `new Date()`/`Date.now()` outside cache scope (build errors), mobile
  overflow from the review filter row (grid `min-w-0`), empty cell for an odd number of gallery images.

## 2026-11-22 — M3 category listing & search

**Scope:** PRD M3 — PLP-01…06, CARD-01/02, SRCH-01/02. Reference: `reference/02-category-listing.png`, `05-mobile.png`.

**Added**
- Catalogue model: `Product` gains `subcategory`, `attributes` (fit/fabric/sleeve/pattern/occasion), `colourFamily`,
  `createdAt`, `popularity`, `tags`; each colour is its own product with sibling swatch links (PDP-03 prep).
  `CommerceAdapter` gains `listCategoryTree`, `getCategory`, `listCollections`, `searchCatalog(scope, query)`,
  `suggest(q)`; `getCollection` now returns metadata only. Mock catalogue: 27 styles → 68 products, 14 categories with
  sub-categories, 18 rule-based collections (every header/menu/home collection link resolves).
- `lib/catalog`: URL state (`parseQuery`/`serializeQuery` — strict allow-list, canonical order, page cap 20),
  listing engine (disjunctive facet counts, OR within / AND across filters, 7 sorts, sold-out always last, cumulative
  pages of 24), attribute/colour-family labels, `parseScope`.
- `lib/search/engine.ts`: normalisation (t-shirt = tshirt = t shirt = tee), synonyms + Hinglish (pant, lower, chashma,
  joota…), typo tolerance (1 edit ≥ 4 letters, 2 edits ≥ 8, incl. typos of synonyms), AND across words, weighted fields.
- Routes: `/men`, `/men/[category]`, `/men/[category]/[sub]`, `/collections/[handle]`, `/search?q=`. Static shell
  (breadcrumbs, Anton H1 + style count, sub-category rail) + streamed results (`Suspense`, skeleton).
- `components/listing`: filter bar (FILTERS (n) toggles the 264 px sidebar, quick-filter popovers, sort, 3/4-column
  toggle), sidebar (applied chips + Clear all, size grid, checkbox lists with counts, colour circles, price slider
  committing on release, discount, availability), grid with CMS merch tile (PLP-05), progress "Showing x of y" + Load
  more (a real link) and mobile infinite scroll via `?page=n` so back/forward restores position, empty states (PLP-06)
  with removable filters + bestsellers, mobile sticky SORT | FILTER bar with bottom sheets (left categories, right values,
  Clear / Apply (n) with a live server count). URL updates run in a transition with optimistic filter state.
- Search overlay from the header (SRCH-01): recent searches (this device only), trending searches (CMS), instant
  products + categories (150 ms debounce, stale requests aborted), Enter → results page. `GET /api/search`,
  `GET /api/catalog` (count for Apply).
- `X-Robots-Tag: noindex, follow` for any filter/sort/page param and `/search` (headers in `next.config.ts`, pages
  stay static); canonical = clean URL.
- `components/ui/popover.tsx`; `components/store/holding.tsx`; CMS `getListingTile`, `getTrendingSearches`.

**Changed**
- `components/store/filters.tsx`: value-based controlled props, disabled zero-count options, `PriceFilter.onCommit`.
- Header search icon opens the overlay (was a link). Home rail item "Oversized Tees" links to `/men/t-shirts/oversized`.
- Cookie Policy inventory lists `ah_recent_searches` (local storage, device only).

**Decisions**
- Every filtered/sorted URL is `noindex` (stricter than PRD's "multi-filter combos") — simplest SEO-safe rule; revisit
  in M8 if single-filter landing pages should rank.
- Reference/02 shows an Alpha Club tile (P1); the grid tile is CMS content and currently a combo offer to a live page.
- Search runs in-process on mock data; the hosted engine (Algolia/Typesense/Meilisearch or platform) is pending (PRD §9)
  and plugs in behind `searchCatalog`/`suggest`. `SYNONYM_GROUPS` is the seed synonym list for it.

**Threat model**
- Crafted listing URLs (huge value lists, injection strings, page=999) → allow-list parse, 20 values/key, 30-char
  slugs, page ≤ 20 (prevent, tested). Unknown scope/handles → 400/404 (prevent, tested).
- Search/count endpoint scraping or DoS → per-IP limits 120/min and 90/min, query capped at 80 chars, results capped
  (prevent, tested). Search terms are not logged; recent searches never leave the device.
- Cache-key blow-up → canonical serialisation so equivalent URLs share one cache entry.

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` 99/99 ✓ · `pnpm build` ✓ (see final run below).
- Preview build in headless Chrome at 1440/390/360: overflowX 0, no console errors. Desktop: sidebar "Slim fit" →
  `?fit=slim`, 15 → 3 styles, chip shown; colour popover; price low→high; Load more 48 → 68 + `?page=2`; empty
  category and no-match states. Mobile: Filter sheet Apply (15) → Apply (7) live → `?fit=regular`; sort sheet;
  infinite scroll → `?page=2`. Search overlay: "hodie" → hoodies + category; Enter → `/search?q=hodie`; "chashma" →
  sunglasses. `x-robots-tag: noindex, follow` on `?fit=slim`, none on the clean URL. Compared with reference/02.
- Fixed during review: native search "×" duplicated the close button.

## 2026-11-22 — DPDP legal & consent foundation + M2 homepage/CMS

**Scope:** Global DPDP rule (before any personal-data feature), then PRD M2: GLB-01…07, HOME-01…06, 08, 11, 12,
CMS-01/02. Platform and CMS decisions still pending, so both run on fail-closed mocks.

**Added — legal & consent (DPDP)**
- `lib/legal`: one versioned source for every notice — Privacy Notice (EN + **Hindi**), Terms of Service, Refund &
  Cancellation Policy, Cookie Policy (table generated from `COOKIE_INVENTORY`). Contact facts come from env
  (`lib/legal/config.ts`) and render as `[TO BE PROVIDED: …]` until set; a "Draft" banner shows while any are missing.
- `GET /api/legal`, `GET /api/legal/{slug}?lang=` (same text for web and future apps).
- Pages: `/legal`, `/legal/[slug]`, `/legal/privacy/hi`, `/grievance`, `/privacy` (Privacy & Legal hub, no sign-in),
  `/privacy/consents` (current state + timestamped history + switches), `/privacy/request` (rights/grievance form).
- Consent ledger (`lib/consent/ledger.ts`): append-only `ConsentRecord` with user/visitor/subscriber id, purpose,
  status (granted/denied/withdrawn), method, source, `notice_version` (`cookies@…;privacy@…`), IP, UA, time.
  One service (`lib/consent/service.ts`) writes it.
- Cookie banner + preferences (`components/consent`): fixed overlay, Reject all = Accept all, Customise, ✕ = reject;
  shown only when an optional tracker is configured; footer "Cookie preferences" on every page; withdrawal deletes
  tracker cookies and reloads. `ConsentScript` is the only way a tracker may load (after consent).
- `POST /api/consent`, `POST /api/newsletter` (+ `/withdraw`), `POST /api/privacy-requests` — all through
  `guardPublicWrite` (same-origin, per-IP rate limit, JSON-only, size cap) and strict allow-list validation.
- `docs/legal/retention-schedule.md`, `docs/legal/breach-runbook.md`.

**Added — M2**
- `lib/cms`: `CmsAdapter` + typed homepage blocks with scheduling (start/end) and device targeting (CSS, cacheable);
  mock adapter with demo content, refused in production like mock commerce.
- Store shell `app/(store)/layout.tsx`: announcement bar, header, menu drawer, mini-cart, footer (GLB-05: columns,
  newsletter with unticked consent, https-only social links from env, payment chips, legal row), mobile tab bar,
  skip link. Degrades to a minimal shell (logo + legal footer) without a backend so legal pages always work.
- Homepage `app/(store)/page.tsx` + `components/home`: hero carousel (HOME-01: 6 s autoplay, pause on hover/focus,
  pause button, no autoplay on reduced motion, arrows, dashes, swipe, ←/→, art-directed `getImageProps` with
  `fetchPriority=high` on slide 1), category rail, promo band, collection tiles, offer tiles, trending tabs (all tabs
  server-rendered, instant switch), new arrivals, trust strip from `STORE_CONFIG`, SEO block (collapsible on mobile).
  Production without a real backend shows the holding page, never demo data.
- `lib/storefront.ts` loaders with `use cache` + `cacheLife("minutes")`. Commerce `ListOptions.sort` (`newest`).
- Root `not-found.tsx`.

**Changed**
- `ALLOW_MOCK_COMMERCE` → `ALLOW_MOCK_DATA` (`lib/mock-guard.ts`), now also gating mock CMS and the in-memory
  ledger / newsletter / grievance stores. `STORE_CONFIG`: `damageReportHours`, `refundInitiateDays`, `minimumAge`.

**Threat model**
- Assets: consent proof, contacts (newsletter/requests), grievance inbox, catalogue. Actors: guest, bot, cross-site attacker.
- Cross-site POST forging consent/subscriptions → Origin/Sec-Fetch-Site check, 403 (prevent, tested).
- Bot floods (newsletter, requests, consent) → per-IP limits + per-contact daily cap on requests, 429/422 (prevent, tested).
- Pre-ticked / implied newsletter consent → server requires literal `consent === true` (prevent, tested).
- Tampered consent cookie → strict parse, unknown/old version = no consent = trackers off (prevent, tested).
- Mass-assignment (`user_id`, `role`) → unknown fields rejected (prevent, tested).
- Header/log injection via contact fields → strict email/mobile normalisation, control chars stripped (prevent, tested).
- Contact enumeration via newsletter → identical response for new/existing (prevent).
- Silent loss of consent/requests in production → stores refuse (503) without a DB (prevent, tested); visitor sees
  fallback. Trackers before consent → no script rendered until `allowed()` (prevent; verified 0 tracker requests).
- Open redirect / injected social links → https-only allow-list (prevent, tested). Guard test fails if any POST route
  skips `guardPublicWrite` (enforce).

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` 71/71 ✓ · `pnpm build` ✓.
- Preview build (`ALLOW_MOCK_DATA=true`, test GA ID) in headless Chrome at 1440/390/360: overflowX 0 on every page,
  no console errors; banner shown, 0 tracker requests, Reject all → `ah_consent=…a0.d0` and banner gone; newsletter
  refuses an unticked box then succeeds; `/privacy/consents` shows the history; request form → `PR-…` reference;
  hero next slide; Hindi notice renders. Homepage compared with reference/01 (desktop) and 05 (mobile).
- Fixed during review: footer link columns stacked one per row on mobile → 2-up grid.
- Not measured: Lighthouse/CWV (placeholder art; Lighthouse CI still a gap).

## 2026-11-22 — M0 setup + M1 design system

**Scope:** PRD §12 milestones M0 and M1 only. DESIGN.md §2 tokens, §3 components, `/dev/components`.

**Added**
- Tokens in `app/globals.css` (`@theme`): all DESIGN.md §2.1 colours, shadcn mapping, radius 0, type utilities
  (`type-section`, `type-label`, …), shimmer, focus rings, reduced-motion. Anton + Inter via `next/font` (self-hosted, swap).
- `lib/commerce`: platform-neutral `CommerceAdapter` (product, collection, categories, cart.*), in-memory mock adapter
  with demo catalogue, `resolveCommerce` (fails closed in production). `lib/format.ts` paise helpers.
- `components/ui`: Button (primary/outline/on-dark/volt/ghost/link, sm/md/lg, loading), Sheet, Accordion, Tabs,
  DropdownMenu, Slider, Checkbox, Switch, RadioGroup/RadioCard, Input, Skeleton, Toaster, Icon (Hugeicons).
- `components/store`: AnnouncementBar (GLB-01), SiteHeader (GLB-02), MenuDrawer (GLB-03), MobileTabBar (GLB-04),
  MiniCart + FreeShippingBar (GLB-06), toasts (GLB-07), ProductCard + quick-add sheet (CARD-01/02), Badges, Price,
  Swatches, SizePicker, ColourPicker, CouponBox, DeliveryCheck, Accordion, SectionHeader, CategoryRail item,
  CollectionTile, OfferTile, PromoBand, Tabs, FilterSidebar parts, SortMenu, ReviewSummary/ReviewCard,
  Checkout blocks, OrderSummary, placeholder garment art (ported from the prototype).
- `/dev/components` (noindex, 404 in production unless `ENABLE_DEV_PAGES=true`). Holding homepage.
- Vitest (27 tests), CI workflow (typecheck, lint, test, build, `pnpm audit`, gitleaks), security headers, `.env.example`.

**Decisions**
- Icons are Hugeicons, not lucide-react as DESIGN.md §0 suggests (owner's standing rule).
- Platform (Shopify vs Medusa, PRD §4) still open → only the mock adapter exists.
- Bag/wishlist in `StoreUIProvider` are client display state for M1; M5 replaces them with the server cart.

**Threat model (M0/M1)**
- Assets: catalogue/prices; later carts. Actors: guest, tampered client.
- Abuse cases + layer that stops it: tampered price in add-to-cart → adapter ignores client price, uses catalogue
  (prevent, tested); qty > 5 / negative / fractional → `CommerceError` (prevent, tested); path-like handles/ids →
  regex reject (prevent, tested); mock data or dev page reachable in prod → fail-closed checks (prevent, tested; 404 verified on `next start`);
  secret leak → gitleaks in CI (enforce).

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` 27/27 ✓ · `pnpm build` ✓ · `pnpm audit --prod` no known vulnerabilities.
- Headless Chrome (CDP) at 1440, 390, 360 px: no horizontal overflow, no console errors, fonts loaded; menu drawer,
  mini-cart, toast and quick-add sheet open. Compared against reference 02 (header, cards) and 05 (header, menu, bag).
- Fixed during review: mobile announcement clipped at 390 px (added `mobileText`); toast covered the open mini-cart.
- Not measured: Lighthouse / Core Web Vitals (no real pages yet — M2).
