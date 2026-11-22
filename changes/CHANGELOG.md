# Change log

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
