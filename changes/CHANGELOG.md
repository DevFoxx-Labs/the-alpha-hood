# Change log

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
