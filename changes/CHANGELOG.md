# Change log

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
