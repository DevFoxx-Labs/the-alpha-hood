# Change log

## 2026-11-29 — Limited-edition finale: product cards under the CTA removed

**Asked for:** remove the two product cards under "Shop the drop". The giant "EDITION." line covered them, so they
added nothing.

- Removed the desktop card list from `components/home/limited-finale.tsx`. The picked products still feed the
  pieces-left count and the drop tape (`editionLeft`). The ambassador band still uses `SignaturePiece`.
- Closes the known gap logged earlier today (cards hidden behind "EDITION." at 1440×900).
- **Verification:** below.

## 2026-11-29 — Limited-edition finale: brand motion in place of the sparkle burst

**Asked for:** the firecracker sparkles over the mascot in the limited-edition section didn't fit the brand. Replace
them with motion that matches The Alpha Hood's energy, and add the other proposed ideas too (all of them).

- **Sparkles removed** from the finale. `components/home/sparkles.tsx` + `.burst-*` CSS are kept for celebration
  moments (e.g. order confirmed); nothing uses them right now.
- **ALPHA drops in from above** with weight (ease-in, scrubbed; was a sideways swing). **On touchdown** (cue `land`):
  three tapered **claw slashes** rip in behind him, his **shadow squashes**, he squashes/settles, **shock lines** kick
  out at his feet, and an **"Authentic · Only 100" stamp** slams onto the art (tilted −8°, ink look).
- **Line 1 "LIMITED"** sweeps in as an outline, then **fills with ink** as you scroll (transform-only wipe).
- **Line 2 lands → the stage shakes once** (cue `slam`, 240 ms).
- **Drop tape:** a black hazard tape (`Tape` from the hero marquee) straddles the section's top edge: "Limited edition ·
  37 left · Only 100 made · When it's gone, it's gone", with the stock chip rules (`frontWords`). Placed in the flow, outside
  the pinned stage, so the stage layout and the fixed header are untouched.
- **Pieces left tally:** counts down from the edition size to the **real** stock when the CTA comes in (cue `tally`).
  The server HTML and screen readers get the real number. Sold out never counts.
- **Real signature write-on:** new optional `signatureImage` on the block, plus an Admin → Homepage → Limited edition
  picker (upload only). If set, it wipes on under the CTA and the stamp/tape say "Signed"/"Hand-signed". If empty,
  neither claim appears. A signature is never made up.
- **CTA:** the arrow nudges and a volt bar sweeps under the button on hover and keyboard focus.
- **How it runs:** entrances are CSS scroll timelines. Impacts are short time-based animations, started by 1 px
  IntersectionObserver markers at fixed depths in the 260vh section (`components/home/limited-cues.tsx` →
  `data-land/slam/tally` on the section). Only transform and opacity animate. With reduced motion, without scroll
  timelines, or without JS: everything is static in its final place (the waiting states only apply under `data-cues`).
- **Threat model:** the only new input is `signatureImage`, an admin-only field. It goes through the same `imagePath`
  allow-list as the other images (own `/api/media/` uploads or built-ins; other hosts / `javascript:` / `//` refused,
  unknown fields refused). The rest is display only. Stock is read-only, and claims come from the stored block.
- **Tests:** `components/home/limited-finale.test.ts` (no sparkles; claims only from block data; signature only when
  uploaded; real stock in SSR + sr-only; tally bounds; cue order; motion guards; keyframes transform/opacity only) and
  signature validation cases in `lib/cms/homepage.test.ts`.
- **Verification:** `pnpm typecheck` ✔ · `pnpm lint` ✔ · `pnpm test` 50 files / 674 tests ✔ · `pnpm build` ✔ (204 pages,
  throwaway `SECRET_BOX_KEY` / `OTP_PEPPER` in the shell). Headless Chrome against the dev server at 1440×900, 390×844
  and 360×740, plus reduced motion at 1440. The cues fired in order (land → slam → tally). The signature write-on was
  only checked by tests, because there is no real signature file yet.

## 2026-11-29 — Hero marquee → two crossed "caution tapes" (more engaging, same performance budget)

**Asked for:** two crossing marquees, made more engaging and on-brand. Build all seven ideas and keep the page fast.

- **Crossed tapes** (`components/home/brand-marquee.tsx`): volt tape in front (runs left, 38 s), black tape behind
  (runs right, 46 s, `--animate-marquee-back`). The X tilt is 5° on phones, 3° from 768 px and 2° from 1280 px; at a
  fixed 2° the tapes overlapped on narrow screens. Tape look: sheen + grain, and volt/black hazard edges on the black tape.
- **Solid / outline words** alternate (the brand-video outline look).
- **Logo-mark separators**, drawn by CSS (`.mq-word::after`) from new 72 px WebP copies of the kit's own PNG masters
  (`scripts/build-logo-mark-small.py`: resize only, 2.9 KB / 2.3 KB). The SVG masters are ~20 KB gzipped each.
- **Scroll push:** each tape slides further its own way as the section crosses the screen (CSS view timeline `--mq`,
  no JS, no scroll listener).
- **Clickable words, pause on hover:** store layout links the live categories (`commerce.listCategories`); drop
  layout links the spotlight pieces actually on the page (`spotlightLinks`, so ids/titles follow Admin → Homepage). No
  prefetch. `tabIndex=-1` + `aria-hidden`: mouse/touch shortcuts to pages the menu and category rail already offer.
- **Drop: pieces left** from real stock after the first word, red chip at ≤ 10, "Sold out" at 0. One rule for the tape
  and the finale: `editionLeft` (`components/home/signature-pieces.tsx`). It hides the count when stock exceeds the
  edition size.
- **ALPHA (#4 pointing, transparent cut-out) rises between the tapes** on desktop as the section scrolls in (half up on
  load, fully up after a short scroll). `<picture>` with a ≥ 1024 px source: phones download nothing.
- **Block shape:** `marquee { front, back, below, links: "categories" | "drop" | "none" }`; resolved with `links`.
  Built-in words for both layouts in `lib/cms/mock-home.ts` (only claims the store already makes).
- **Performance:** server-rendered, fixed height per breakpoint (no CLS), transform-only animations, static under
  reduced motion and without scroll timelines. The first version put a wrapper + `<img>` around every word (162
  elements; home page 983). Separators are now CSS, so it's 66 elements / 14 KB HTML (home page 851, budget ~1,000).
- **Threat model:** no input. Links come from our own catalogue or the page's own section ids. Stock is read-only
  and shows counts only. Nothing new reaches the client beyond what the page already shows.
- **Tests:** `components/home/brand-marquee.test.ts` (crossing/directions/halves, aria-hidden + tabindex −1, outline
  alternation, CSS separators ≤ 4 KB, desktop-only mascot, stock chip rules, loop width, reduced-motion / scroll-timeline
  guards, fixed heights, both layouts) + `spotlightLinks` / `editionLeft`.
- **Verification:** `pnpm typecheck` ✔ · eslint on changed files ✔ · `pnpm test` 50 files / 674 tests ✔ ·
  `pnpm build` ✔ (clean `.next/cache`). Screenshots at 1440 / 1024 / 500 px (drop layout). The screenshots used a fallback
  font, because fonts from another port are blocked on a file:// page; the live store layout wasn't viewed (the running
  dev server serves stale CSS, so restart it).
- Another session was changing the limited-edition finale at the same time (it now reuses `Tape` and
  `editionLeft`). Nothing of theirs was changed here.

## 2026-11-29 — GymYardHQ-style word marquee under the hero (full store + drop layouts)

**Asked for:** the marquee from the GymYardHQ landing page, the same, on The Alpha Hood landing page, in both the
full-store and the "Exclusive drop" layout.

- **Same build as GymYardHQ** (`gymyardhq-web/app/page.tsx` "MARQUEE"): a band tilted −1° with ink rules top and bottom,
  uppercase words with a small rotated-square diamond between them, two identical halves scrolling left
  (translateX 0 → −50%, 38 s, `--animate-marquee` in `app/globals.css`). Brand swaps: lime → **volt**, Archivo wide →
  **Anton**. `components/home/brand-marquee.tsx`, server-rendered, CSS only, `motion-safe:` (holds still under reduced
  motion), `aria-hidden` (words repeat the page).
- **New CMS block `marquee`** (`words`, `below`) placed right after the hero in both built-in layouts (`lib/cms/mock-home.ts`):
  full store, with categories and store promises, `below: "light"` (category rail); drop, with the drop's own points,
  `below: "dark"` (ambassador band). `below` paints the gaps around the tilted strip (black on top, the next section's
  colour underneath), so no stray band shows. The words use only claims the pages already make, with no ₹ (Anton is latin-only).
- Not editable in Admin → Homepage yet (built-in words; see known gaps if wanted).
- **Threat model:** decorative, built-in data only, no input or network. Nothing to defend.
- **Tests:** `components/home/brand-marquee.test.ts` (halves, aria-hidden, motion-safe, gap colours, block right after the
  hero in both layouts, ≥ 8 words, Anton-safe characters); block-order tests in `lib/cms/cms.test.ts` /
  `lib/cms/homepage.test.ts` updated.
- **Verification:** `pnpm typecheck` ✔ · eslint ✔ · `vitest run components/home lib/cms` 38 ✔ · `pnpm build` ✔. The full suite
  was not re-run for this change. Screenshot at 1440 px (drop layout, strip over dark and white next sections) and 500 px.
  A stale Turbopack cache (`.next/cache`) first built CSS without the new class; a clean build fixed it.

## 2026-11-28 — Brand-video outline-text background (`OutlineMarquee`)

**Asked for:** the moving outlined "ALPHA HOOD" rows from the brand videos as a reusable section background, used
where it fits, with the owner's sample kept as a separate, unused copy.

- **Component:** `components/brand/outline-marquee.tsx` + `.olm*` CSS in `app/globals.css`. Props: `text`, `rows` (1–8),
  `theme` (`dark` | `light`), `speed`, `accentRow` (volt, dark only), `opacity`, `grain`. Rows are server-rendered empty
  spans, and the word comes from `content: attr(data-text)`, so there is no JS build step, no layout shift, and the word isn't
  repeated in the page text. Two identical halves with translateX 0 → -50% (seamless), alternate directions, 58–72 s
  loops (about 70 px/s). Transform only. Static under reduced motion, paused off-screen (IntersectionObserver).
  Uses the self-hosted Anton (no Google Fonts request) and the volt token in place of the sample's `#F2C714`.
- **Used on:** home Exclusive points (dark, accent row) · home Alpha Club band (`ALPHA CLUB`, 3 rows) · About hero ·
  Coming-soon holding page · 404 (light theme). Not used on the hero carousel, Ambassador band or Limited finale,
  which already have photo-led LCPs or their own giant moving type. It would clash there.
- **Reference copy (unused):** `docs/samples/outline-text-background/` holds the owner's `sample.html` (unchanged, opens
  in a browser) and the brief. Dev demo: `/dev/outline-marquee` (dark hero, light, soft, props; `devPagesEnabled`).
- **Threat model:** decorative only, with no input, data or network. `text` is a prop set in code, rendered as an attribute
  (escaped by React). No new dependency.
- **Tests:** `components/brand/outline-marquee.test.ts`: aria-hidden, no DOM text, rows/directions/halves, speed
  scaling, single accent row, clamping, CSS reduced-motion / pause / transform-only.
- **Verification:** `pnpm typecheck` ✔ · eslint on changed files ✔ · `pnpm test` 48 files / 657 tests ✔ · `pnpm build` ✔
  (throwaway `SECRET_BOX_KEY`). Headless Chromium screenshots of the production build: 404 (light, 1440) and About
  (dark, 390) show the rows. The running `next dev` kept serving the old CSS (restart it). The demo page and the
  home sections weren't screenshotted, and a real 360 px check was not done (headless Chrome's minimum window width).

## 2026-12-04 — "Show as sold out" switch: demand test for products and drop spotlights

**Asked for:** a switch on products, and on the drop's spotlight products, that shows a piece as out of stock while it
is really in stock, so customers can only sign up to be told — and the owner can see how many want it before selling.
Must work in both the drop and the full-store layout.

- **Where:** Admin → Products → (a product) → **Demand test** card, and Admin → Homepage → Product spotlights → each
  spotlight's stock panel. One switch for every colour, plus one per colour. Products list shows **Shown sold out**.
  The switch saves at once (`POST /api/admin/styles/[styleId]/sold-out`, `catalog.write`, audited
  `catalog.style.sold_out_on/off`); on the product editor it is locked while there are unsaved edits.
- **On:** the store shows every size as sold out everywhere (cards, product page, spotlight, filters, search, feeds,
  structured data) — it's a product-level flag, so drop and full-store layouts both follow it. Customers see the
  existing **Sold out · Notify me** (per size; guests sign in with OTP first). Real stock is untouched.
- **Demand:** each colour shows **N waiting** with the split per size, and **already notified** — counts only, no
  customer details (`demandFor`, new `AlertStore.forProducts` on memory / MySQL / PostgreSQL / MongoDB).
- **Off (asks first):** the real stock is on sale again and waiting customers get their "back in stock" message at
  once for sizes that are in stock (alert sweep; the cron sweep catches anything missed).
- **How:** `ProductRecord.soldOutHold` (admin-only, inside the product document — no migration). The own catalogue
  builds two views from one read: the store view (held = 0 per size) and the raw view the inventory seeds from and
  Admin → Inventory lists. `holdInventory` makes the store's inventory answer 0 and refuse reservations for a held
  product. Product saves / CSV imports keep the switch; the style editor can't send it.
- **Privacy Notice** (EN + HI) → version `2026-12-04`: product alerts are also counted (numbers only) to plan stock.

**Threat model**
- Shopper buys a held piece with a crafted request → inventory answers 0, add-to-bag 409, reserve `out_of_stock`
  (prevent, tested on MySQL end to end). A checkout already holding units when it's switched on is left alone.
- Hold silently wipes real stock (SKU seeded from a 0) → the inventory reads the raw view (prevent, tested).
- Switching another style's colour / unknown style / malformed body / unknown field → 422 / 404 (prevent, tested).
- Stale editor or a race → versions checked in one transaction, 409, nothing written (prevent, tested).
- Unauthenticated / no rights → 401 / 403, same-origin + rate limit, audited (prevent + detect, tested).
- Leaking who is waiting → admin gets counts only (prevent, tested). The flag never reaches page props (tested).

**Verification**
- `pnpm typecheck` ✔ · `pnpm lint` ✔ · `pnpm test` 46 files / 647 tests ✔ (new: `lib/catalog/hold.test.ts`, the
  `forProducts` contract, and an end-to-end route test on MySQL). First full run had 4 MySQL contract failures
  ("table doesn't exist" in `alpha_hood_test` while other files ran); the DB suite alone and the full re-run passed.
- `pnpm build` ✔ with a throwaway `SECRET_BOX_KEY` (`.env.local` has none, and a production build requires it).
- Not verified: PostgreSQL / MongoDB (no `TEST_POSTGRES_URL` / `TEST_MONGODB_URL` locally); the admin screens were
  not viewed in a browser (admin sign-in needs the owner's password + authenticator) — smoke: store / admin pages 200,
  the new endpoint 401 without a session.

## 2026-12-03 — Real pincode check: Shiprocket (Admin → Shipping) + town / state names

**Asked for:** make "Check your pincode" fully functional through Shiprocket (option B), show the town and state;
everything built so the owner only adds the Shiprocket details.

### Admin → Shipping (new, owner only — `settings.manage`)
- Shiprocket **API user email + password**, **pickup pincode**, **parcel weight**. Save → **Test** (signs in and checks a
  real pincode; shows couriers, town, dates, COD) → **Make live** (authenticator code). Changing the live account is
  tested before it is saved (needs a code too); switching off needs a code. Owners are emailed on every live change,
  and every save / test / switch is audited (`shipping_provider.*`). A how-to card explains the Shiprocket setup.
- Password sealed in the database (`providers`, kind `shipping`) and write-only; email shown masked.
- Files: `lib/shipping/{shiprocket,service,runtime,common,fee}.ts`, `app/api/admin/shipping/{route,test,active}`,
  `components/admin/shipping.tsx`, nav item, boot in `instrumentation.ts`.

### Delivery checks
- `lib/shipping/shiprocket.ts`: `POST /v1/external/auth/login` → token (cached in memory, renewed before the 240 h
  expiry, re-signed once on a 401), `GET /v1/external/courier/serviceability/` with pickup / delivery pincode,
  weight, `cod=0`. Mapping: serviceable if any courier; date from the recommended courier (else the fastest) in
  business days with the 2 pm cut-off; express when a courier is ≥ 1 day faster and ≤ 2 days; COD if any courier
  collects cash; town / state from the courier. Defensive parsing (odd values ignored, text cleaned).
- `shipping` is resolved at call time (going live applies at once) and cached per pincode for 6 h and per IST day.
  Without Shiprocket: the demo rules in development, "couldn't check delivery" in production (fail closed). Checkout
  uses the same adapter, so its delivery date and COD follow too. Shipment / pickup booking through Shiprocket is
  **not** built yet (fails closed with a clear error).
- **Town / state:** from Shiprocket, else from the India Post directory — `pnpm geo:import-pincodes <csv>` builds
  `data/pincodes.json` from the official "All India Pincode Directory" CSV (data.gov.in blocks automated downloads,
  so the owner downloads it in a browser). PDP shows "Delivering to Pune, Maharashtra" and "Delivery by … to Pune
  (411045)".

### Security
- Fixed host `https://apiv2.shiprocket.in` (no URL field → no SSRF), redirects refused, 8 s timeout, 1 MB cap,
  password never logged / returned / in URLs, token in memory only, Shiprocket's text never shown to shoppers.
  Public `/api/delivery` keeps its 30/min/IP limit; the cache keeps Shiprocket calls low.
- Privacy Notice **2026-12-03** (EN + HI): the courier row now says only the pincode (+ our pickup pincode and a
  weight) goes to Shiprocket for a check — never name, phone or address. Shiprocket's legal entity name: to confirm.

### Verified
- `pnpm typecheck` ✔, `pnpm lint` ✔, `pnpm test` 46 files / 647 tests ✔ (new `lib/shipping/shipping.test.ts`: fixed
  host, no redirects, token reuse + re-sign on 401, mapping, no courier, odd fields, wrong credentials, outage, bad
  pincode before any call, write-only password, can't go live untested, failing live change keeps the old settings;
  directory CSV parsing; admin routes owner-only + cross-origin refused).
- Dev server: `/api/delivery` 411045 → Pune, Maharashtra; 744101 → not serviceable; 12345 → 422; `/admin/shipping`
  200; its API 401 without a session.
- **Not verified:** a real Shiprocket account (none yet). Shiprocket's JSON field names come from common integrations,
  not their (JavaScript-only) reference — the admin Test will show any mismatch before going live.

## 2026-12-02 — Drop products: live stock in Admin → Homepage, up to 6 pieces

**Asked for:** manage the drop's products, their stock and quantity from the admin, and add more products later.

- Already there (unchanged): create / edit products with colours, sizes, photos and price in **Admin → Products**;
  change stock per size (audited, never below zero, low-stock filter) in **Admin → Inventory**; choose the drop's
  pieces in **Admin → Homepage → Product spotlights**.
- New: each spotlight shows the **live stock of every colour × size** of its style (red = sold out, orange ≤ 3, total
  on sale), with **Edit product ↗** (`/admin/catalog/style/<id>`) and **Manage stock ↗** (`/admin/inventory?q=<SKU>`,
  every colour) links; the card has **New product ↗**. Links open a new tab so unsaved homepage edits aren't lost.
  `homepageView()` returns `stock` (admin-only, `catalog.read`).
- Spotlight limit raised from 4 to **6** pieces.
- Verified: `pnpm typecheck` ✔, ESLint ✔, `pnpm test` 44 files / 628 tests ✔ (the switch test now also checks the
  stock view: one row per colour of the style, whole non-negative numbers).
- Not built (needs a decision — see the session report): a working pincode check on the live store.

## 2026-12-02 — Drop layout: product page without cross-selling rails

**Asked for:** in the drop view, the hoodie's product page must not show Complete the look, You may also like or
Recently viewed — the store only has the limited pieces.

- `getProductPage()` (`lib/storefront.ts`) returns `drop: true` and no rails in the drop layout (and skips computing
  them); the PDP (`app/(store)/products/[handle]/page.tsx`) then renders no Complete the look / You may also like /
  Shop the look and no Recently viewed, and its breadcrumb is Home › piece (no Men / category links into the full
  catalogue — also in the product's structured data). Full-store layout: unchanged.
- Verified live (the store is on drop): `/products/heavyweight-oversized-hoodie-black` → 0 × "Complete the look",
  "You may also like", "Recently viewed", "Shop the look", `href="/men"`; reviews still shown. `pnpm typecheck` ✔,
  ESLint ✔, `pnpm test` 44 files / 628 tests ✔.

## 2026-12-02 — Alpha Mascot Tee (real photos, 5 colours) + drop-layout header, menu and footer

**Asked for:** put the owner's five "Alpha Mascot Tee" images in the project and show them; make the drop store
buildable from the admin. Then: in the drop layout the header (New in / Bestsellers / Sale) and the menu drawer must
match the drop, not the full store.

### The tee
- Sources: `assets/products/alpha-mascot-tee/{black,olive,navy,teal,bone}.png` (1254² posters) + README. Cropped once
  into `photos/<colour>-{front,back}.jpg` (700 × 875, 4:5 — the store's photo shape) and `<colour>-poster.jpg` (the
  full poster). The posters' detail tiles are under the 600 px photo minimum, so they stay inside the poster photo.
- `pnpm catalog:add-mascot-tee [--apply] [--production]` (`scripts/catalog-add-mascot-tee.ts`): creates the style with
  5 colours through the **same services as Admin → Products** (`prepareProductPhoto` → media store, `saveStyle`), front /
  back photos tagged as hanger views, alt text per photo. Dry run by default, prints the target, non-local needs
  `--production`, idempotent (skips when `AH-AMT-*` SKUs exist), audited `system:catalog-add-mascot-tee`.
- Applied on local `alpha_hood_dev`: style `style_489eda2c2529`, 15 photos. From now on it is edited in
  **Admin → Products** like any product (photos, colours, price, stock, text).
- **Placeholders to replace in the admin:** price ₹2,499 (no MRP / discount), 20 per size (S–XXL), manufacturer
  "to be confirmed", HSN 6109, 300 g.
- Local dev drop spotlights now point at the real hoodie (black) and this tee (black) — "The Mascot Tee".

### Drop layout navigation (`lib/cms/drop-nav.ts`, used by `getShell()`)
- Built from the drop's own spotlights, so it follows Admin → Homepage → Product spotlights automatically:
  - header: each piece's title → its product page, + Alpha Club (no New in / Bestsellers / Sale);
  - menu drawer: one "The drop" tab — the pieces, Size guide, Alpha Club, Track order, and two promo tiles of the
    pieces (the Shop / Collections tabs with 27 categories are gone); gift card / club tiles stay;
  - footer: the Shop column lists the pieces + Size guide; Help and Company stay;
  - mini-cart add-ons: only the drop's other pieces.
- Full-store layout: unchanged.

### Verified
- `lib/cms` 34/34 ✔ (new `drop-nav.test.ts`: header, drawer, footer, fewer than two pieces). Live (local dev, layout
  switched to drop briefly and back to "Follow the environment"): drop page shows "The Mascot Tee" with 15 real photos
  (served `image/jpeg`), all 5 colour swatches; on a product page the header / menu carry "The Hoodie", "The Mascot
  Tee", "The drop", "Size guide" and **no** "New in", "Bestsellers", "Winter drop", `/collections/sale`; PDP
  `/products/alpha-mascot-tee-black` 200.
- Not verified: visually in a browser (extension not connected).

## 2026-12-02 — `LANDING_LAYOUT` environment variable for the landing page

**Asked for:** switch the landing page from an env variable too — a choice made in the admin gets priority,
otherwise the env variable's.

- `LANDING_LAYOUT=drop | store` (in `.env.example`, empty = not set; case / spaces ignored; anything else = not set).
- **Priority** (`landingLayout()` in `lib/cms/homepage.ts`): 1) Admin → Homepage → Landing page layout, if chosen;
  2) `LANDING_LAYOUT`; 3) the full store.
- The admin card now has three choices: **Full store**, **Exclusive drop**, and **Follow the environment** (clears the
  admin's choice, `layout: null`), shows what `LANDING_LAYOUT` is set to and which layout is live now.
- The local dev database's admin choice (set to "store" while testing the switch earlier) was cleared back to
  "Follow the environment", as it was before the test.
- Verified: `pnpm typecheck` ✔, ESLint ✔, `lib/cms` 30/30 ✔ (new priority test: admin beats env both ways, env
  decides without an admin choice, unknown / empty → full store, `null` clears).
- Note: env files are read when the server starts — after changing `LANDING_LAYOUT`, restart / redeploy.

## 2026-12-02 — Landing page layout switch: "Full store" ↔ "Exclusive drop"

**Asked for:** an admin option to show either landing page — the new one for just two exclusive articles (a black
hoodie and a tee in 4–5 colours) when switched on, the old full-store one when switched off.

### Admin → Homepage
- New card **"Landing page layout"**: *Full store* (the page as before) or *Exclusive drop*. Shows which one is
  "Live now" and which goes "Live after save". Saved with the page (one revision, audited `layoutDrop`).
- **"Edit the hero and SEO block of: Full store | Exclusive drop"** — each layout keeps its own hero and SEO block, so
  you can prepare the drop page while the full store is live, and switch back without losing anything. The
  ambassador, limited-edition and campaign sections are shared by both.
- Drop-only cards: **Product spotlights** (1–4: small line, big title, product picker, up to 5 detail lines, hand-
  signed by, edition size, photos left/right) and **Why it's exclusive** (title + up to 4 points).

### The "Exclusive drop" page (`MOCK_DROP_HOMEPAGE`)
Hero (1 slide) → brand ambassador band → **spotlight: The Hoodie** → **spotlight: The Tee** → **Why it's exclusive**
(Hand-signed · Numbered · Certified · Boxed) → limited-edition finale → Alpha Club → #WearTheHood → trust strip → a
short SEO block. No discount promo, combo offers, collection tiles, category rail, trending tabs or new-arrivals grid.
- `components/home/product-spotlight.tsx`: big photos of the chosen colour, price **without MRP / % off**, "Hand-signed
  by …", "Edition of N", "N left" (real stock), colour swatches (every colour of the style) that switch the photos,
  sizes and **Add to bag on the homepage** (the bag / checkout re-check stock and price on the server), "Sold out ·
  Notify me" when nothing is left, link to the full PDP.
- `components/home/exclusive-points.tsx`: numbered tiles on black.
- Demo: with no product picked, a spotlight shows the style with the most colours in its category (hoodie black first)
  — development only, the built-in content is the mock CMS.

### Security
- `layout` must be `store` or `drop`; spotlights: 1–4, one product each (must exist in the catalogue), no repeats,
  details ≤ 5 × 80 chars, edition 1–100,000, plain text; points 1–4; unknown fields (e.g. `price`) refused; same
  `catalog.write` + audit + revision as the rest. Prices always come from the product.

### Verified
- `pnpm typecheck` ✔, ESLint ✔, `lib/cms` 29/29 ✔ (6 new tests: layout values, own hero / SEO per layout, shared
  sections, spotlights replace the demo in place, validation, switching keeps both layouts' content).
- Live on the dev server (local `alpha_hood_dev`, switched through the same service): **drop** → 2 spotlights, "Why
  it's exclusive", colour swatches, 2 Add to bag, ambassador + limited sections, and no 40% promo / Trending /
  category slider; switched back to **store** → category slider and Trending return, no spotlights.
- Not verified: the editor and the drop page visually in a browser (extension not connected).

## 2026-12-02 — Homepage: brand-ambassador signed exclusives + limited-edition drop (GymYardHQ designs)

**Asked for:** two admin-customisable homepage sections only for the brand ambassador's exclusive, autographed,
high-priced pieces and for limited editions — with the design, animation and appeal of the GymYardHQ home page's
hero and the section above its footer.

### Sections (built-in DEMO in development; Admin → Homepage replaces them)
- **Brand ambassador — signed exclusives** (`components/home/ambassador-band.tsx`, below Shop by category): the
  GymYardHQ hero, as a mid-page band. Full-bleed photo (16:7 desktop, subject right; 4:5 mobile, subject low), black
  blends, small line with a volt dot, two giant Anton lines that sweep in from opposite sides as the band enters
  and split apart as it leaves, line 1 turning to "glass" (fill fades, outline takes over) over the subject on desktop,
  the copy + "✍ Hand-signed by …" + volt CTA rising on the dark side, two signed pieces floating between copy and
  subject, the scene zooming slowest, and a row of every signed piece under it.
- **Limited edition drop** (`components/home/limited-finale.tsx`, above the trust strip / SEO block, i.e. just above
  the footer as in GymYardHQ): the download finale — volt, pinned, full height (260 vh, sticky stage). Line 1 sweeps in
  behind the art, the scene slides in from the right, the cut-out swings in from the left with the firecracker
  sparkles, line 2 sweeps in front, then the CTA with "Edition of N" and "N left" (real stock of the picked products).
- Product cards (`signature-pieces.tsx`): photo, name, price (from the product), "✍ Signed by …", "Only N left" /
  "Sold out" from real stock.
- Motion (`app/globals.css`, `.amb-*` / `.ltd-*` / sparkles): CSS scroll timelines, transform / opacity only, static
  without scroll-timeline support or with reduced motion.

### Admin → Homepage
- Two new cards (Customise / Use built-in / show on–off): ambassador's name, small line, two headline lines (≤ 16
  characters each), text, button, desktop + mobile photo (upload or built-in), alt text, up to 4 signed pieces
  (product picker); limited edition: small line, two lines, text, edition size, button, cut-out PNG, scene, up to
  3 pieces. Stored in `homepage.ambassador` / `homepage.limited` (catalogue documents — no migration).

### Differences from GymYardHQ (deliberate)
- **No animated blur** on the giant lines: the project performance rule forbids animating `filter: blur()` on big
  display text. Everything else (directions, ranges, depth, ghost line, pinning, sparkles) is the same.
- **Brand type and colours:** Anton + volt / black instead of GymYardHQ's wide font + lime / ink.
- **Scroll-triggered instead of load-triggered entrance** for the ambassador band (it is mid-page, so a load-in would
  finish before anyone sees it); its exit uses the band's own timeline instead of the page top.
- **No looping video** (GymYardHQ's `SceneVideo`): admins can upload photos only; a video upload pipeline is a gap.

### Security
- Same server rules as the rest of the homepage content: same-site links only, images from our media store (must
  exist) or built-ins, plain text with caps, unknown fields refused, picked products must exist in the catalogue,
  ≤ 4 / ≤ 3 products, edition size 1–100,000, prices never taken from here (they come from the product), `catalog.write`
  + audit + optimistic revision.

### Verified
- `pnpm typecheck` ✔, ESLint ✔, `pnpm test` 43 files / 617 tests ✔ (4 new tests; the block-order test updated for
  the two new blocks). Dev server: home 200 with both sections, "Hand-signed by Alpha", six "Signed by" cards,
  "Edition of 100".
- Not verified: the animations in a browser (extension not connected).

### Fix (same day): "the GymYardHQ animation effect doesn't show"
- The dev server kept serving a stylesheet compiled before the animation CSS existed (Turbopack didn't rebuild
  `globals.css`); Tailwind compiles the block correctly (checked with Tailwind's API).
- Two real bugs too: (1) the rules sat in `@layer components`, so Tailwind's `relative` utility beat
  `.ltd-stage { position: sticky }` — the limited section could never pin. Moved the block out of the layer, as in
  GymYardHQ (unlayered CSS beats every layer); checked in the served stylesheet. (2) The floating signed pieces had
  two animations on one element (`amb-rise` + `amb-float`); the shorthand cancelled the scroll timeline. Split onto
  two elements.

## 2026-12-02 — Admin → Homepage (hero, campaign band, SEO block), Shop all categories, category slider, Alpha Club sign-in

**Asked for:** admin can customise the hero carousel; choose which categories show on the homepage and which on
"Shop all"; Shop by category as a left/right slider; campaign band customisable if possible; the full Alpha Club
join flow; how the SEO block's categories / popular searches are set.

### Admin → Homepage (new, `/admin/homepage`, Catalogue section)
- **Hero carousel:** "Customise" copies today's built-in slides into the editor; then add (up to 6), edit, reorder,
  switch on/off, remove. Per slide: small line, 1–3 headline lines, text, button text + link, headline colour,
  background colour, desktop image (≈16:7) and mobile image (≈4:5) — upload a JPEG/PNG or pick a built-in brand
  image — alt text, mobile/desktop/both, optional start and end time. "Use built-in" goes back.
- **Campaign band:** on/off, small line, headline, text, button, image (upload or built-in), alt text, panel colour.
- **SEO block:** heading, up to 3 link groups (one link per row: `Text | /link`, up to 24 each — e.g. "Top
  categories" and "Popular searches", where a search link is `/search?q=…`), up to 3 paragraphs.
- Stored as `homepage` in the catalogue documents (one versioned JSON document, MySQL / PostgreSQL / MongoDB — **no
  migration**); a part never customised keeps the built-in content. Saves refresh the store via the catalogue cache
  tag (seconds). Files: `lib/cms/homepage.ts` (types, validation, merge), `lib/cms/homepage-admin.ts` (service),
  `app/api/admin/homepage/route.ts`, `components/admin/homepage-editor.tsx`, `lib/cms/stored.ts`, `lib/storefront.ts`.

### Categories
- Homepage: unchanged — Admin → Categories → "Homepage category rail" already chooses the homepage tiles (up to 12).
- **New card "Shop all page"** (Admin → Categories): which top-level categories the /men page (where "Shop all"
  goes) shows, in which order; hidden categories keep their own pages. Default = all (new categories appear
  automatically). `shopAll` in the catalogue documents; `getShopAllCategories()` in `lib/storefront.ts`.
- **Shop by category is a slider** (`components/home/category-slider.tsx`): swipe / scroll on every screen, snap,
  and ← → buttons on desktop that show only when there are more tiles than fit. Server-rendered tiles; no layout shift.

### Alpha Club
- The join flow already existed end to end: homepage band / `/alpha-club` → "Join" → `/account/club` → sign in or
  sign up → the explicit consent box → "Join for free" (consent recorded in the ledger) → dashboard with coins, tier
  and referral link `/r/<code>`; "Leave" withdraws. Fixed the gap: a guest landing on `/account/club` saw a generic
  "Sign in". It now says **"Join the Alpha Club"** with the benefits and what happens next. Joining stays a separate,
  ticked choice after sign-in (DPDP: never bundled with sign-up).

### Fixed while here
- Saving categories / collections / an import used to rebuild the catalogue document from a fixed field list, so any
  other field would have been dropped. `write()` now merges (`{ ...current, ...next }`) and the import keeps
  `homepage` / `shopAll` — tested.

### Threat model
| Abuse case | Defence | Test |
|---|---|---|
| Script / phishing link in a button or SEO link (`javascript:`, other host, `//`, `/\`) | Same-site path allow-list `INTERNAL_HREF_RE` on the server | `links: same-site paths only` |
| Image from another host / path tricks / data: URLs (tracking, SSRF, mixed content) | Only `/api/media/med_<32 hex>` that exists in our media store, or a shipped built-in image | `images: …`, `must exist` |
| Stored XSS via text | `cleanText` (control chars stripped, lengths capped) + React escaping; no HTML rendered | `plain text` |
| Mass assignment / extra props | `rejectUnknownFields` at every level | `unknown fields refused` |
| Lost update (two admins) | Optimistic revision under a row lock → 409 | `stale save is refused` |
| One screen wiping another's content | Merge-on-write | `never wipes` |
| Unauthorised edit | `catalog.read` to view, `catalog.write` to save, same-origin, rate-limited, size-capped (64 KB), audited `content.homepage` | admin-api `homepage editor` |

### Verified
- `pnpm typecheck` ✔, `pnpm lint` ✔, `pnpm test` 43 files / 613 tests ✔ (new `lib/cms/homepage.test.ts`, homepage
  editor authorization in `admin-api.test.ts`). Dev server: home 200 with the slider buttons, hero, campaign and SEO; `/men` 200;
  `/account/club` (guest) shows "Join the Alpha Club" + benefits; `/admin/homepage` 200.
- Not verified: the admin editor and slider visually (browser extension not connected); a live save through the
  admin API (needs a staff session with MFA).

## 2026-12-02 — Fix: /account showed the account screen for a few seconds before the sign-in form

**Reported:** opening /account while signed out first showed the account (dashboard) shell, then after 3–4 seconds
the sign-in form.
**Cause:** `AccountFrame` started in a "loading" state that drew the account navigation + skeletons, and only after
`GET /api/account/me` answered 401 did it switch to the sign-in form. The session cookie is HttpOnly, so the browser
can't tell on its own.

### Now
- New `app/(store)/account/layout.tsx`: the server checks the session (same check as `requireAccount`:
  cookie → hashed token → expiry → customer) before any account screen is drawn — `lib/account/server.ts`
  (`currentAccount`, same pattern as the admin's `lib/admin/server.ts`). The first HTML is already the right
  screen: **sign-in form for a guest**, the account with its data for a customer. No extra request.
- The decision is shared through `components/account/account-session.tsx`, which lives in the layout: moving between
  account pages keeps it, and sign-in / sign-out / profile reloads update it (no stale "signed out" on the next page).
- The browser only asks `/api/account/me` when the server couldn't decide (accounts switched off, backend down) —
  the old behaviour, with its error handling.
- `lib/account/me.ts` (`accountView`) builds the account data for both `GET /api/account/me` and the server render,
  so they can't drift.

### Security
- The server render uses the same session check; a forged / expired cookie gets the sign-in form and no data
  (checked). The account HTML is `Cache-Control: no-store` (checked) and the pages stay `noindex`. Only what the API
  already returned (masked phone, name, email, addresses, store credit) is in the page. Every account API still
  checks the session on each call.

### Verified
- `pnpm typecheck` ✔ (after `next typegen` for the new layout's route types), `pnpm lint` ✔, `pnpm test`
  42 files / 601 tests ✔.
- Dev server, first HTML, 12/12 ✔: guest /account, /account/orders, /account/settings → sign-in form and no
  account menu; signed in → account menu + own email, no sign-in form; `no-store`; forged cookie → sign-in form.
- Not verified: visually in a browser (extension not connected).

## 2026-12-02 — OTP entry as separate digit boxes, with visual feedback

**Asked for:** the code field should be separate boxes, one per digit (4 or 6), with visual graphics and actions.

- New `components/ui/otp-input.tsx` (`OtpInput`, `length` 4 | 6, default 6), used by every customer code field:
  mobile sign-in (`otp-sign-in.tsx`, also order tracking), email sign-in / sign-up / forgot password
  (`email-sign-in.tsx`), checkout contact (`contact-step.tsx`), Settings email verification (`email-verify.tsx`).
- Visual actions: the next box is active (2 px black border + blinking caret); each digit pops in; a wrong code
  shakes the row and turns it red, and typing again starts a fresh code; success turns it green with a small
  staggered bounce. Animations use only `transform` / `opacity` (no layout shift) and stop under
  `prefers-reduced-motion` (`app/globals.css`).
- **Auto-verify**: entering / pasting the last digit submits it (the button still works). Sign-up waits until its
  password is filled.
- One real `<input>` lies over the boxes, so SMS / email autofill (`autocomplete="one-time-code"`), pasting the whole
  code (spaces / dashes dropped), backspace and screen readers work as with a normal field; the boxes are
  `aria-hidden`. 16 px font (no iOS zoom), boxes shrink to fit 320 px. The field stays enabled while verifying, so
  focus isn't lost after a wrong code.
- Not changed: the admin panel's authenticator / provider code fields (admin design system).
- Tests: `components/ui/otp-input.test.ts` 6/6 (box count 4 / 6, one input with OTP hints, error / success states,
  digits only, paste, auto-verify fires once, fresh code after an error). No DOM test library in the repo, so typing
  is tested through the pure `nextOtpValue`, the markup through React's server renderer. Full run: `pnpm typecheck`
  ✔, `pnpm lint` ✔, `pnpm test` 42 files / 601 tests ✔.
- Not verified: the look and animations in a browser at 1440 / 390 / 360 px (browser extension not connected).

## 2026-12-02 — Fix: "Forgot password" asks for the code first, then the new password

**Reported:** Email sign-in → "Forgot password?" asked for the new password straight away, before any code was sent.
**Cause:** the reset form showed the "New password" field on the first screen and sent code + password together at
the end. Not a security hole — the server only saved the password after checking the emailed code (tested) — but the
order was wrong, and a wrong code was only reported after typing a new password.

### Now (3 steps)
1. Email → "Email me a code".
2. Code → **"Verify code"**: checked on the server and used up (`POST /api/auth/email/verify`, `intent: "reset"`,
   no password). Nobody is signed in yet. The browser gets a reset ticket in the `ah_reset` cookie.
3. "✓ Code verified" → new password → "Save new password" (`POST /api/auth/password/reset`): saved, every other
   session signed out, this browser signed in fresh.
- Same flow for Account → Settings → "Set a password".
- The old one-call `reset` (code + password together) still works for API clients.

### The ticket
- Sealed with `SECRET_BOX_KEY` (AES-GCM), bound to the customer + the sign-in email the code went to, 10 minutes,
  HttpOnly, `SameSite=Strict`, sent only to `/api/auth/password`.
- **Single use** without storage: it is bound to the password version in force, so it is void the moment any
  password is saved. A weak password is refused and the ticket stays usable for the retry.

| Abuse case | Defence | Test |
|---|---|---|
| Set the password without the code | No ticket → 410; the ticket is only issued after a valid code | `without a valid ticket` |
| Forged / tampered ticket | AES-GCM seal; anything unreadable → 410 | `forged, tampered` |
| Replay the ticket | Bound to the password version → 410 after use | `Single use` |
| Ticket for an email no longer on the account | The email must still be the account's sign-in email | — (code path) |
| Code brute force at step 2 | Same 5 tries / lock as sign-in codes | existing lock test |
| CSRF on step 3 | Same-origin check + `SameSite=Strict` cookie | existing cross-site test |

- Cookie Policy **2026-12-02**: `ah_reset` listed (strictly necessary, 10 minutes); `ah_session` text now covers
  email / password / Google sign-in.

### Verified
- `pnpm typecheck` ✔, `pnpm lint` ✔, `pnpm test` 41 files / 595 tests ✔ (2 new reset tests). Live on the dev server
  (local `alpha_hood_dev`): 8/8 ✔ — code sent, code verified → asks for new password, not signed in yet, ticket set,
  new password saved + signed in, old password refused, new password works, ticket can't be reused.
- Not verified: the screens visually (browser extension not connected).

## 2026-12-02 — PDP-10 "Notify me" for guests (mobile number or email)

**Asked for:** when a product is out of stock, the customer can give a mobile number or email on the product page and
subscribe to a notification for that article.

### What changed
- PDP: "Notify me" (sold-out size) and "Price drop alert" now work without an account. A guest gets an inline form
  right there — **Mobile (SMS)** or **Email** tab → a 6-digit code to that number / address → verified → the alert is
  set. The code signs them in (a free account is created on first use; the Terms / Privacy notice sits next to the
  button and the consent row is recorded), so they can see and remove the alert in Account → Alerts.
- When every size is sold out, the main, mobile-bar and sticky-bar buttons read **"Sold out · Notify me"** and start
  the same flow (was a disabled "Sold out").
- With one sold-out size the button names it ("Notify me when M is back"); with several, a size select stays.
- Signed-in customers: unchanged — one tap.
- No new server route, table or migration: the form reuses `/api/otp/*`, `/api/auth/email/*` and
  `POST /api/account/alerts`; delivery reuses the outbox (back-in-stock is SMS + email, price drop email only).
  `EmailSignIn` got a `compact` mode (code only) for this form. Files: `components/pdp/pdp-extras.tsx`,
  `components/pdp/purchase-panel.tsx`, `components/account/email-sign-in.tsx`.

### Threat model
| Abuse case | Defence (layer) | Test |
|---|---|---|
| Subscribing someone else's number / email to messages (spam, SMS cost, no consent) | The contact must be confirmed with a code sent to it; a code for another address fails (prevent) | `guest by EMAIL`, `guest by MOBILE` |
| SMS / email bombing through the form | Same send limits as sign-in: per-contact cooldown + hourly / daily caps, per-IP caps, Turnstile when on (prevent) | sign-in tests |
| Alert spam per account | 40 alerts / day / account, 30 open max, duplicates collapse to one (prevent) | `same alert twice` |
| Tampered stock / price | Stock and price checked on the server; an in-stock size is refused (409) (prevent) | existing PDP-10 test |
| Repeated messages | An alert fires once (atomic `fire`) (prevent) | `fires once` |
| Contact data leaking into the outbox | Outbox holds template + references only (prevent) | `never the contact` |
| Someone else removing my alert | Owner-scoped delete → 404 (prevent) | existing PDP-10 test |

### Legal
- No new personal data or purpose beyond what the Privacy Notice already lists (account mobile / email, "Product
  alerts" retention row). The notice text needs no change; the account the form creates records `terms_privacy`.

### Verified
- `pnpm typecheck` ✔, `pnpm lint` ✔, `pnpm test` 41 files / 593 tests ✔ (2 new guest-flow tests in `m9-api.test.ts`).
- Dev server: PDPs with sold-out sizes render "Notify me" + "Price drop alert"; fully in-stock PDPs render only the
  price alert.
- Not verified: the form visually at 1440 / 390 / 360 px (browser extension not connected); the all-sizes-sold-out
  button (no fully sold-out product in the local catalogue).

## 2026-12-02 — ACC-01 complete: email + password, email code, Google sign-up, mobile OTP (all three ways in)

**Asked for:** email/password login, Gmail (Google) login and mobile-number login/sign-up, production grade (rate
limits, no auth/authz holes, each user sees only their own data). The owner should only have to set the SMS and
email providers.

### What a customer can do now (`/account`, signed out)
- **Mobile number** tab: SMS code → signs in, or creates the account (unchanged flow, now through the shared sign-in).
- **Email** tab: sign in with **password**; **create an account** (name optional, email, password, an unticked Terms +
  Privacy checkbox → a 6-digit code to the email); **email me a sign-in code** (passwordless; creates the account on
  first use with the one-tap notice); **forgot password** (code + new password).
- **Continue with Google**: a Google-verified email now creates the account directly (before: a mobile had to be
  verified first). Google without a verified email, and Facebook, still finish by verifying the mobile.
- **Account → Settings → Sign-in & security**: add a mobile number (SMS code, attached to this account), set a
  password (code to the sign-in email), change password (current one required), link / unlink Google / Facebook.
- **Checkout**: an account started by email or Google adds its mobile in the Contact step; placing an order without
  a verified mobile is refused on the server (`phone_required`, CHK-02 / CHK-07).

### How it is built
- `lib/auth/email-auth.ts` — the one service for email code / password / reset / change (`AuthError`).
- `lib/auth/passwords.ts` — scrypt hashes (reuses `lib/admin/crypto.ts`), NIST 800-63B policy (8–128, no composition
  rules, common / own-email refused), breached-password check via Pwned Passwords k-anonymity (production only,
  `PASSWORD_BREACH_CHECK=on|off`, fails open after 2.5 s), constant-time dummy compare for unknown accounts.
- `lib/auth/sign-in.ts` — `completeSignIn()`: every path (phone, email code, password, Google, Facebook) gets the same
  fresh session, device cookie, new-device alert, consent row on account creation, and optional "sign out others".
- Customers: `phone` may now be null (accounts started by email / Google), new verified `loginEmail` (UNIQUE), new
  store methods `findOrCreateByEmail`, `findByLoginEmail`, `attachPhone`; `setEmail(…, verified)` moves the sign-in
  email only when the new address is verified, and throws `EmailInUseError` if another account signs in with it.
- Passwords live in their own store (`customer_credentials`), never on the customer record; erased on account deletion.
- Routes: `POST /api/auth/email/send`, `POST /api/auth/email/verify`, `POST /api/auth/password`,
  `POST /api/account/password`; changed: `/api/otp/verify` (attach mobile), social callback (Google sign-up),
  `/api/account/social` (methods + last-method guard), `/api/account/me` (last-method guard).
- UI: `components/account/sign-in-panel.tsx`, `email-sign-in.tsx`, `sign-in-methods.tsx` (Hugeicons only).
- Migration `2026_12_01_016_customer_login` (SQL + MongoDB): nullable UNIQUE `customers.login_email` +
  `customer_credentials`; batched, resumable backfill of already-verified emails (a duplicate address keeps the first
  verified owner and is skipped). Phoneless accounts hold `none:<id>` in the NOT NULL UNIQUE phone column (read as null).

### Threat model (High tier: authentication)
- Assets: customer accounts (orders, addresses, store credit, Hood Coins), personal data, email / SMS credits.
- Actors: guest, another customer, credential stuffer, email bomber, someone who knows a victim's email, a tampered
  client.

| Abuse case | Defence (layer) | Test |
|---|---|---|
| Account enumeration via send / login / reset | Same response for every address; one 401 message; dummy scrypt compare (prevent) | `no enumeration`, `same 401` |
| Password brute force / credential stuffing | 10/10 min per IP, 8/15 min per address (also for unknown addresses), 300/10 min global, Turnstile when on, breach list (prevent) + `login_failed` / `login_limited` events (detect) | `brute force` |
| 6-digit code guessing | 5 tries then locked, 5 min, single use (prevent) | `lock the challenge` |
| Code for address A used on address B | HMAC covers `email-auth:<address key>` → wrong code, not consumed (prevent) | `bound to its address` |
| Email bombing a victim | 30 s cooldown, 5/h, 10/day per address, 5/10 min + 20/day per IP, Turnstile (prevent) | `email bombing` |
| Takeover by typing a victim's email into a profile | Only verified `loginEmail` signs in; UNIQUE; owner can still sign up (prevent) | `UNVERIFIED email`, contract test |
| Takeover via a Google account with the victim's email | Social sign-in never matches an existing account by email → `email_in_use` (prevent) | `account takeover` |
| Stolen session changes the password | Current password required, 5/15 min per account (prevent) | `change password` |
| Old sessions after a reset / change | All other sessions revoked, fresh token (recover) | `forgot password`, `change password` |
| Mass assignment (`customerId`, `role`, `verified`) | `rejectUnknownFields` on every route (prevent) | `unknown fields` |
| CSRF / login CSRF | Same-origin check on every POST; OAuth `state` + PKCE + nonce (prevent) | `cross-site`, social tests |
| Reading another customer's data | Every account route derives the customer from the session; no client IDs (prevent) | `each session sees only its own` |
| Locking yourself out | Last-way-in guard on unlink and email removal (prevent) | `last way in`, Google unlink |
| Race: two sign-ups for one email | UNIQUE `login_email`, insert-then-read-back (prevent) | contract test (memory + MySQL) |
| Order without verified mobile (COD fraud) | `phone_required` in `placeOrder` (prevent) | `checkout refuses` |
| Password hash leak | scrypt + random salt, separate table, never in any response / export (prevent) | `credentials` contract, `scrypt` checks |
| Feature abused | `signInEnabled()` fail-closed flag → 503 on every route (recover) | `sign-in switched off` |

### Legal (DPDP)
- Privacy Notice **2026-12-02** (EN + HI): sign-in email + password hash (purpose, basis), Google sign-in now creates
  accounts, the breached-password check as a processor (only 5 hash characters leave), retention of the hash.
- Sign-up by email records `terms_privacy` with method **checkbox** (server-validated, must be exactly `true`);
  email-code and Google sign-up record **signup_notice** (one-tap notice next to the button).
- No new cookies.

### Verified
- `pnpm typecheck` ✔, `pnpm lint` ✔, `pnpm test` **41 files / 591 tests ✔** (was 560; +31 new, no regressions),
  contract tests on **memory + local MySQL** (`alpha_hood_test`) incl. the new migration down/up ✔.
- `pnpm build` ✔ (196 pages + the 4 new routes) — with `SECRET_BOX_KEY` / `OTP_PEPPER` set in the shell. Without
  them, a build against `.env.local`'s database fails closed on `/products/[handle]/opengraph-image` (sealed
  settings need the key) — pre-existing, by design; add `SECRET_BOX_KEY` to `.env.local` for local production builds.
- Migration `2026_12_01_016` applied to local `alpha_hood_dev`; live smoke on the dev server: sign-up (A, B),
  Terms required, password sign-in, HttpOnly + SameSite=Lax cookie, A/B see only their own data, no hash in
  responses, identical 401 for wrong password / unknown email, logout revokes — 12/12 ✔.
- Not verified: the visual check at 1440 / 390 / 360 px (the browser extension was not connected); PostgreSQL /
  MongoDB contract runs (no `TEST_POSTGRES_URL` / `TEST_MONGODB_URL` locally); real Google, SMS and email providers
  (need the owner's keys).

## 2026-12-01 — Review photos, store replies to reviews, customer emails for reviews and feedback

**Asked for:** feedback stays answered by the admin team; add store replies to reviews, photos in reviews, and tell
the customer when their review or feedback gets an answer.

### Review photos
- My reviews → write / edit: **up to 3 photos** (JPEG / PNG, ≤ 5 MB), with preview and remove. They upload through the
  existing private photo pipeline (`POST /api/returns/photos`: signed in, 20 a day, type sniffed, EXIF / text chunks
  removed, server-chosen id). A photo is attached to one review or return only, and only the owner's photos can be
  attached; if any photo is refused, the review isn't saved (no half-saved rows).
- Moderators see the private photos in Admin → Reviews (`GET /api/admin/reviews/{id}/photos/{photoId}`, `ugc.moderate`,
  only photos listed on that review, `no-store`, `nosniff`, sandbox CSP).
- On **approve**, public copies go to the media store (`/api/media/<id>`, local / S3 / R2 as set in Admin → Storage)
  and show on the product page. The private originals stay private.
- **Edit or delete** takes the public copy, its photos and any store reply off the site immediately (new
  `MediaStore.remove` on memory, MySQL, PostgreSQL, MongoDB and object storage).

### Store replies
- Admin → Reviews → Published: "Public reply from the store" box (publish, update, remove).
  `POST /api/admin/reviews/{id}/reply` (`ugc.moderate`, rate-limited, audited `review.reply` / `review.reply_removed`).
- Shown under the review on the product page ("Reply from The Alpha Hood") and in the customer's My reviews.
  New `ReviewStore.setReply` on all engines (SQL: in a transaction with the row locked; helpful votes untouched).

### Customer emails (Admin → Settings → Notifications → "Reviews & help", all on by default, email only)
- Review published (links to the product), review not published (links to My reviews, where the reason is), store
  replied (sent for the first reply only, not for edits), help & feedback answered (links to `/account/help`; the
  reply text itself is not put in the email).

### Threat model
- Assets: customers' photos (personal data), the product page (public content), the moderator's power.
- Abuse → defence: attaching someone else's or a return's photo → owner-scoped `attach`, refused (422, test);
  path tricks in photo ids → id allow-list (test); viewing another review's photos from admin → photo must be
  listed on that review; un-moderated photos reaching the public → public copies are made only on approve (test);
  photos lingering after withdrawal → removed on edit / delete (test); staff ids leaking to customers → stripped from
  `publicReview` (test); reply spam / XSS → `cleanText` (2–1,000 chars, no markup), React escaping, rate limit;
  email flood → one email per decision / first reply (test); a reply on an unpublished review → 409 (test).

### Legal
- Privacy Notice **2026-12-01** (EN + HI): review photos (private until approved, metadata removed), store replies,
  review / feedback emails, removal on edit / delete. Needs the lawyer's review.

### Verified
- See the commands at the end of this task (lint, typecheck, full tests on memory + local MySQL, build).

## 2026-11-30 — Customer dashboard: address book with a map, reviews, help & feedback, every section linked

**Asked for:** start with addresses — professional e-commerce fields, several addresses (own or someone else's),
location from a map with a "current location" button, no latitude / longitude fields — then every dashboard option
working, including writing reviews and giving feedback.

### Address book (`/account/addresses`, and the same form at checkout)
- Fields: this address is for **me / someone else**, receiver's name, mobile, **alternate mobile**, pincode,
  flat / house / building, area / street / sector / village, landmark, town / city, state, country (India),
  home / work / other, **delivery instructions**, **make default**.
- **Map** (Leaflet): tap the map or drag the pin; **"Use my current location"** asks the browser only when tapped.
  The pin fills in area, city, state and pincode (editable). No latitude / longitude fields anywhere; the pin is
  saved with the address for the courier.
- Add, **edit**, **make default**, remove. Up to 10 addresses. Checkout uses the same form and pre-selects the
  default address.
- "For me" with the mobile left empty uses the customer's own verified number on the server — the browser never
  receives the full number (it stays masked).
- New: `components/address/address-form.tsx`, `address-map.tsx`; `lib/geo/geocode.ts`; routes
  `POST /api/account/addresses`, `PATCH /api/account/addresses/[id]`, `POST …/[id]/default`,
  `GET /api/geo/reverse`, `GET /api/geo/pincode`, `GET /api/geo/tiles`. Migration `014_address_details`.
- **Maps** settings group: OpenStreetMap by default (no key); optional MapTiler key (tiles) and Google Geocoding
  key. Geocoding runs on our server, so the customer's IP isn't sent to the geocoder.
- `Permissions-Policy` now allows `geolocation=(self)` (it was blocked for the whole site).
- New package: **leaflet 1.9.4** (+ `@types/leaflet`) — ~42 KB gzip, no dependencies, loaded only when the address
  form opens (dynamic import), so no other page carries it.

### Reviews (`/account/reviews`, admin `/admin/reviews`)
- "Waiting for your review": products from delivered orders. Write: stars, fit (small / true / large), title, text.
  One review per product per customer (UNIQUE key). Edit or delete any time.
- Checked by staff (`ugc.moderate`) before it shows on the product page with a "Verified buyer" badge and
  "First name L." — reject needs a reason the customer sees. Edit = back to the check, off the page meanwhile.
- "Write a review" on delivered orders; the review-request email now opens the form.

### Help & feedback (`/account/help`, admin `/admin/feedback`)
- Topic, optional order (own orders only), optional 1–5 experience rating, message. Staff (`feedback.manage`:
  owner, store manager, support, marketing) reply; the reply shows in the customer's account. "Get help" on orders.
- Storage: one new table `customer_submissions` (reviews + feedback), migration `015`. Erased with the account.

### Dashboard
- Overview: shortcut tiles to every section (orders, reviews, addresses, wishlist, alerts, Alpha Club,
  #WearTheHood, help, settings), default address, "confirm your email" and "items waiting for your review"
  prompts. Navigation gains My reviews and Help & feedback.

### Privacy Notice (EN + HI, version 2026-11-30)
Delivery address details (incl. someone else's and the map pin), location (only on tap), reviews, feedback,
and processors OpenStreetMap / MapTiler / Nominatim / Google Geocoding.

### Threat model
- Another customer's address, review or order touched → owner-scoped stores and routes, 404 (prevent, tested).
- Review fraud: reviewing something not bought, reviewing twice, publishing unchecked → delivered-order check,
  UNIQUE key (raced on MySQL), moderation; parallel staff decisions decide once (prevent, tested).
- Location misuse: geolocation only on tap; pin bounded to India and rounded; geocoding server-side, signed-in,
  rate-limited (30/min/IP, 200/day/customer) so it can't be used as a free proxy (prevent, tested).
- SSRF via map settings → fixed hosts only (Nominatim, Google, OSM / MapTiler tiles) (prevent).
- Full phone number exposed to the browser → "for me" phone filled on the server (prevent, tested).
- Feedback spam → 5 / 10 min per IP, 10 / day and 10 open per customer (prevent, tested).
- Stored XSS through review / feedback text → validated text, rendered as React text (no HTML) (prevent).

### Verification
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` **554/554** ✓ (memory + local MySQL). New: `lib/submissions/dashboard.test.ts` (10, incl. the route flows) and MySQL contract tests for the address book (parallel default changes) and submissions (parallel review submits and decisions).
- Local MySQL dev database (`mysql://127.0.0.1:3306/alpha_hood_dev`, environment: local): migrations 014 and 015
  applied. A first run of 014 failed on a column-type bug (`tinyint(1)` as a string) after adding two columns; the
  migration is idempotent, the fix re-ran it cleanly.
- `pnpm build` ✓, no warnings. Leaflet is one 42 KB (gzip) chunk that no page loads up front — only the address form fetches it. `pnpm audit --prod`: no known vulnerabilities.
- **Not seen in a browser:** the map, current-location button, address book, reviews, help and admin screens.
  OpenStreetMap / Nominatim were not called for real (tests use a fake HTTP layer).

## 2026-11-30 — Settings: Notifications and Security (from AstroGaon), with every flow wired end to end

**Asked for:** AstroGaon's Notification settings and Security settings, "the whole flow, not one part".

### How AstroGaon does it (read first)
- *Notifications:* `NotificationCatalog` (event → group, label, channel defaults) + `NotificationSettings::channels`
  saved from a switch matrix; `allows(event, channel)` is checked by every sender; an "always on" list.
- *Security:* four switches — email verification on sign-up, email OTP on login, phone OTP on login, 2FA — read by
  the auth middleware and OTP / 2FA services; plus a new-device sign-in alert in the notification catalogue.

### What was built here
**Notifications (Settings → Notifications tab)** — a switch matrix like AstroGaon's, grouped (Orders, Returns &
refunds, Alerts, Marketing, Account), SMS + Email per message, and an "Always sent" list.
- `lib/notify/catalog.ts` (events, groups, defaults, always-on), `lib/notify/switches.ts` (in force now),
  `lib/notify/switches-service.ts`, `PUT /api/admin/settings/notifications` (owner only, audited).
- Enforced twice: when a message is queued (`channelsFor` drops switched-off channels) and again when it is sent
  (the delivery worker re-checks), so switching off also stops what is already queued.
- **Email is now actually delivered** for customer messages: `lib/notify/email-templates.ts` (one fixed plain-text
  template per message) + the email channel in `lib/notify/delivery.ts`, through the provider live in
  Admin → Email providers. Before this, the email channel was recorded as `no_provider`.
- A switch can only take a channel away: customers' own choices (marketing consent, WhatsApp updates) still apply.

**Security (Settings → Security group)** — adapted to how this store signs people in:
- *Send emails only to verified addresses* (on by default) — AstroGaon's "email verification". Full flow:
  Account → Settings shows Verified / Not verified; "Send verification code" emails a 6-digit code
  (`POST /api/account/email/send`, `/confirm`); changing the address makes it unverified again; a Google-verified
  email from social sign-in counts as verified. New column `customers.email_verified_at` (migration 013).
- *New-device sign-in alert* to customers and to staff (both on by default) — AstroGaon's `new_device_sign_in`.
  A random device id in a strictly necessary HttpOnly cookie (`ah_device`); only a hash of (account, device) is
  kept, through the existing one-time markers. Runs on every sign-in path: mobile code, Google / Facebook, staff
  password + authenticator. Customers get the email through the outbox (switchable in Notifications); staff get
  a direct email. Never on sign-up, never blocks a sign-in.
- *Staff idle sign-out* (5–120 min, default 30), *staff session length* (1–24 h, default 12), *customer session
  length* (1–90 days, default 30) — previously constants; now read at sign-in / every request.
- **Not taken from AstroGaon, on purpose:** "email OTP on login", "phone OTP on login" and "2FA" switches. Here
  customers always sign in with a code to their mobile, and staff always use password + authenticator; making
  either optional would weaken sign-in (global rule: MFA mandatory for admins). The section says so.

**Cookie Policy** (version 2026-11-30 — visitors are asked again, as the policy requires when cookies change):
`ah_device`, plus `ah_oauth` and `ah_social_link` from the social sign-in change (they had been missed).

### Threat model
- Assets: customer contact channels, sign-in sessions, account takeover signals. Actors: guest, other customer,
  stolen session, someone who typed another person's email, non-owner staff.
- Settings changed by non-owners → `settings.manage` (owner only) on both settings routes (prevent, tested
  earlier for the settings API; the new route uses the same guard).
- Unknown events / channels / fields stored or a switch adding a channel → allow-listed and cleaned (prevent, tested).
- Order emails to an address the customer doesn't own → verified-only by default (prevent, tested).
- Verification code used for another customer or a changed address → code key bound to customer + address,
  own purpose, can't sign in (prevent, tested). Code guessing / email flooding → OTP rules (5 tries, cooldown,
  hourly/daily caps) + per-IP limits (prevent).
- Account takeover unnoticed → new-device alerts on every sign-in path (detect). Session lifetimes bounded with
  floors and ceilings; a bad value falls back to the default (prevent, tested).
- Email template injection → fixed templates, shape-checked references only (prevent, tested).
- Tracking via the device id → random per browser, HttpOnly, only hashed (account, device) stored, never used
  for analytics; listed as strictly necessary (DPDP / cookie rule).

### Verification
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` **540/540** ✓ (memory + local MySQL). New:
  `lib/notify/notifications-security.test.ts` (11 tests, incl. the full email-verification route flow).
- `pnpm build` ✓ (throwaway `SECRET_BOX_KEY`), no warnings.
- Local MySQL dev database (`mysql://127.0.0.1:3306/alpha_hood_dev`, environment: local): migration 013 applied.
- Bugs found by the tests and fixed: switching an on-by-default security switch off was not saved; the first
  settings load reported a change when nothing changed.
- **Not verified:** a real email (no live email provider on this machine); the two new admin screens and the
  account "verify email" step were not seen in a browser. PostgreSQL / MongoDB not run.

## 2026-11-29 — Admin → Email providers, Storage (database / server folder / S3 / R2), Google + Facebook sign-in

**Asked for:** nodemailer for email, storage on S3, R2 and the server's own disk "managed like AstroGaon", and
Google + Facebook sign-in. AI providers on hold.

### Email providers (`/admin/email-providers`, AstroGaon → Email Providers)
- SMTP through **nodemailer 10.6.1** (owner approved; `pnpm audit --prod`: no known vulnerabilities). Presets fill
  host / port / encryption: Zoho Mail, Zoho ZeptoMail, Google Workspace, Microsoft 365, Hostinger, Amazon SES
  (Mumbai SMTP), Brevo, SendGrid, Mailgun, Postmark, Resend, other.
- Same rules as SMS providers and AstroGaon: test email before live, one live, a live edit is tested before saving,
  live can't be deleted, password write-only, username masked, fresh authenticator code to switch.
- The warning about a change is sent through the provider that was live **before** the change (as AstroGaon does).
- Differences from AstroGaon: no Amazon SES API driver (SES works through its SMTP preset); fresh authenticator
  code instead of password re-confirmation.

### Storage (`/admin/storage`, AstroGaon → Storage)
- Where new **product photos** go: **Database** (default, unchanged), **Server folder** (`STORAGE_LOCAL_DIR`,
  default `.data/uploads`, git-ignored), **Amazon S3**, **Cloudflare R2**. Connection test = write, read back,
  delete. Switching needs a passed test and a fresh authenticator code.
- Old photos stay where they were written and keep working: each row records its backend (`storage_key`).
  Photo URLs (`/api/media/<id>`) and their `immutable` caching are unchanged.
- S3 / R2 without an SDK: AWS Signature V4 in `lib/storage/sigv4.ts`, **checked against the "GET Object" example
  in the Amazon S3 SigV4 documentation** (test passes with the published signature).
- Buckets stay **private** (no public ACL): photos are served through the store. Once a backend has held photos,
  its bucket / region / account are locked; keys can rotate with a passing test.
- Differences from AstroGaon: no public bucket URL, no file browser, no thumbnail presets, no SQL-files tab, no
  WebP conversion at upload (Next.js already serves AVIF/WebP). Return photos still stay in the database.

### Google + Facebook sign-in
- "Continue with Google / Facebook" on the account sign-in form, only for providers whose keys are saved in
  Settings → Social Sign-in (the "Not in use yet" badge is gone). Account → Settings → Sign-in methods: link, unlink.
- **Account rule:** the account stays phone-based. The first time from a signed-out browser, the person verifies
  their mobile number once; the social account is then linked and signs in with one tap after that. A social
  account never opens an account on its own, and is never matched to a customer by email (customer emails here
  are typed, not verified — matching on them would let one person take over another's account).
- Signed in → "Link" attaches the social account to the current customer. Linked to someone else → refused.
- Only Google's `email_verified` email is used (to fill an empty email field); Facebook's email is not requested.
- Removed on unlink and on account deletion (DPDP). Privacy Notice (EN + HI, 2026-11-29): Google and Facebook
  sign-in rows.

**Added (main files)**
- `lib/providers`: `email-catalog.ts`, `email-transport.ts`, `email-service.ts`, `email-runtime.ts`, `net-guard.ts`,
  `errors.ts`; routes `app/api/admin/email-providers/**`; `components/admin/email-providers.tsx`,
  `components/admin/provider-kit.tsx` (shared with the SMS screen).
- `lib/storage`: `sigv4.ts`, `backends.ts`, `runtime.ts`, `media.ts`, `service.ts`; routes `app/api/admin/storage/**`;
  `components/admin/storage.tsx`.
- `lib/auth/social.ts`, `lib/auth/social-identities.ts`, `lib/db/stores/social-identities.ts`; routes
  `app/api/auth/social/**`, `app/api/account/social`; `components/account/social-sign-in.tsx`.
- Migrations (additive, reversible): `2026_11_29_011_media_storage_key` (nullable column),
  `2026_11_29_012_customer_identities` (new table, primary key (provider, subject)). MySQL + PostgreSQL + MongoDB.

**Threat model (High tier: email route, file storage, authentication)**
- *Email — whoever controls the live provider reads staff reset codes.* Owner only + fresh TOTP to switch; test
  before live; previous route carries the warning (prevent + detect, tested).
- *Email — SMTP host aimed at the internal network (SSRF).* Host must be a DNS name; every resolved address must
  be public; the connection goes to the checked address with TLS verifying the host name, so DNS rebinding fails;
  checked on save and on every send (prevent, tested). Plain-text SMTP never offered; certificates checked; TLS 1.2+.
- *Email — header injection / file read through a message.* Messages checked before any connection; nodemailer
  file and URL access off (prevent, tested).
- *Storage — saved identifiers change the host (SSRF).* Hosts fixed in code; account, bucket, region, keys match
  strict patterns (prevent, tested).
- *Storage — path traversal / executable upload on the server folder.* Server-chosen keys only
  (`media/med_<32 hex>.(jpg|png)`), resolved path must stay inside the folder, folder outside `public/`, never
  overwrites, files 0600 (prevent, tested). Uploads are still sniffed JPEG/PNG with metadata stripped.
- *Storage — switching breaks old photos.* Per-photo backend key; locked bucket once used; a missing backend gives
  a clear 503, never wrong bytes; tampered storage key refused (prevent, tested).
- *Storage — keys leak.* Write-only, masked hint, scrubbed from errors, sealed at rest (prevent, tested).
- *Sign-in — login CSRF / code injection.* `state` in a sealed HttpOnly cookie bound to the browser, PKCE S256 and
  nonce for Google; foreign, missing, expired or tampered state refused before any provider call (prevent, tested).
- *Sign-in — forged or foreign ID token.* Token only from Google's token endpoint over TLS with our secret; issuer,
  audience, expiry and nonce checked (prevent, tested). Facebook calls carry `appsecret_proof`.
- *Sign-in — account takeover via email matching.* Never matched by email; linking needs a verified mobile or an
  existing session (prevent, tested). One social account → one customer (primary key; raced contract test).
- *Sign-in — open redirect via `next`.* Same-site relative paths only (prevent, tested).
- Not covered: the real providers. See verification.

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` **529/529** ✓ on memory + local MySQL (`alpha_hood_test`).
  New: `lib/providers/email.test.ts` (7), `lib/storage/storage.test.ts` (8), `lib/auth/social.test.ts` (10),
  contract tests for `storage_key` and social identities on MySQL.
- `pnpm build` ✓ (throwaway `SECRET_BOX_KEY` for that command only). A first build warned that the server-folder
  code made Turbopack trace the whole project into the deploy; fixed (`turbopackIgnore` on runtime paths), the
  rebuild has no warnings.
- Local MySQL dev database (`mysql://127.0.0.1:3306/alpha_hood_dev`, environment: local): migrations 011 and 012
  applied.
- **Bugs the tests caught and that are fixed:** SMTP error classes were inverted (5xx is permanent, 4xx temporary).
- **Not verified against the real services:** no real email was sent, no real S3 / R2 bucket was used, and no
  real Google / Facebook sign-in ran (no accounts or keys on this machine). The SigV4 maths is checked against
  AWS's published example; request shapes for Google and Facebook are from their documented endpoints, from
  memory, not checked against the live services.
- **Not seen in a browser:** the three admin screens, the sign-in buttons and the link notice.
- Not run: PostgreSQL and MongoDB. `/security-review` (High tier) not run yet.

## 2026-11-26 — Settings: Bot Protection, Error Tracking, Social Sign-in, Push, AI Providers

**Asked for:** Turnstile, Sentry, Google / Facebook sign-in, push notifications and AI providers in Admin → Settings.

**Five new sections in Admin → Settings** (`lib/settings/catalog.ts`; same rules as the others: owner only,
encrypted, secrets write-only, saved value wins over the environment):

| Section | Keys | Used by the store? |
| --- | --- | --- |
| Bot Protection | Turnstile site key, secret key | **Yes** — on as soon as both are saved |
| Error Tracking | Sentry DSN, environment name | **Yes** — on as soon as the DSN is saved |
| Social Sign-in | Google client ID + secret, Facebook app ID + secret | No — keys kept ready |
| Push Notifications | VAPID public + private key, contact | No — keys kept ready |
| AI Providers | preferred provider; Anthropic, OpenAI, Gemini keys | No — keys kept ready |

The three unused sections show a "Not in use yet" badge and say on the page what has to be built first, so a saved
key is never mistaken for a working feature (`notInUse` in the catalogue; remove it in the change that builds the
feature).

**Built with the settings**
- **Turnstile** (`lib/security/turnstile.ts`, `components/security/human-check.tsx`, `GET /api/human-check`):
  `POST /api/otp/send` and `POST /api/track/send` — the two routes that send a paid sign-in SMS — require a valid
  token when both keys are set. The account sign-in form, the checkout contact step and order tracking fetch a
  fresh token per request; Cloudflare's script loads only on those forms and only when Turnstile is on. Closes the
  known gap "no bot protection on OTP send" (coupon apply and place order are still rate-limit only).
- **Sentry** (`lib/ops/sentry.ts`, `onRequestError` in `instrumentation.ts`): server errors are posted to Sentry's
  envelope endpoint. No SDK, no new package. Server side only — browser errors are not reported.
- **Privacy Notice** (EN + HI, version 2026-11-29): the "Error monitoring" row now names Sentry and what is sent;
  new "Bot protection" row for Cloudflare Turnstile. Both "used once switched on".

**Decisions**
- Turnstile: a missing or rejected token is refused (403). If Cloudflare can't be reached the request is allowed,
  because sign-in must not go down with a third party; the per-IP and per-phone SMS limits still apply and the
  event is logged.
- Sentry events carry the error type, scrubbed message, stack, route and path without the query string. Never
  headers, cookies, IP addresses or bodies. At most 20 events a minute per server.
- Push uses standard Web Push (VAPID) keys, because this is a web store with a service worker. AstroGaon uses
  Firebase (FCM) for its mobile apps; FCM keys can be added when an app exists.
- No model name is stored for AI: a feature picks its model when it is built.

**Threat model**
- Assets: SMS spend and sign-in availability (Turnstile), error data (Sentry), OAuth secrets, push private key,
  paid AI keys. Actors: bot, guest, stolen owner session, someone who can save settings.
- Bot requests sign-in codes in bulk → Turnstile token required and verified on the server with the secret key
  (prevent, tested 403); rate limits stay behind it.
- Token forged, replayed or malformed → shape check, then Cloudflare's verdict; tokens are single use on their
  side (prevent, tested).
- Saved setting makes the server call an internal address (SSRF) → Turnstile verify address is fixed in code; the
  Sentry DSN must match Sentry's own ingest hosts, in the catalogue and again when read (prevent, tested).
- Personal data or secrets leak to Sentry → allow-listed fields, scrubbed message, no query string (prevent, tested).
- Error storm becomes a request storm → 20 a minute cap, 3 s timeout, never throws (prevent, tested).
- Wrong Turnstile keys lock everyone out of sign-in → warning on the form; removing either key switches it off at
  once (recover). Not prevented automatically.
- Secrets read back → never in the payload (prevent, tested).

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` 501/501 ✓ (memory + local MySQL). New:
  `lib/security/integrations.test.ts` (8 tests).
- A bug found by the tests and fixed: the Sentry scrubber cut a long key in two instead of removing it.
- **Not verified against the real services:** no Turnstile widget was rendered and no event reached Sentry (no
  accounts or keys on this machine). The Turnstile widget calls (`render` / `execute` / `reset`) are written from
  Cloudflare's documented API from memory, not checked against the live script.
- **Not seen in a browser:** the five sections and the two sign-in forms. `pnpm build` not re-run.
- Not run: PostgreSQL and MongoDB.

## 2026-11-26 — Admin → SMS providers (from the AstroGaon panel)

**Asked for:** the AstroGaon admin's Integrations, Providers and Storage settings in this admin. This entry is the
first part: SMS providers. Email providers and Storage are scoped in `docs/known-gaps.md` (they need decisions).

**What it does (same model as AstroGaon → SMS Providers)**
- Owner adds one or more providers (MSG91, Fast2SMS, 2Factor.in), sends a test SMS, then makes exactly one live.
- The live provider sends every sign-in code and order SMS from the next request on. No provider live = the
  environment's SMS settings, as before.
- Keys are encrypted and write-only: the page shows a masked hint (`abcD••••cd`), never the key.

**Differences from AstroGaon, on purpose**
- No free-text messages. AstroGaon sends one "message" variable through a generic template; this store keeps its
  rule of one DLT template per message type with fixed variables. The form has a template ID per message type and
  shows the variables each template must carry. A type left blank is not sent by SMS.
- Twilio is not offered: it would need fixed message texts registered for DLT, which this store doesn't have yet.
- Step-up is a fresh authenticator code (AstroGaon re-confirms the password).

**Added**
- `lib/providers`: `store.ts` (generic provider rows, one active per kind), `sms-catalog.ts` (drivers + field
  rules), `sms-gateway.ts` (fixed HTTPS hosts, timeouts, no redirects, keys scrubbed from errors),
  `sms-service.ts` (rules below), `sms-runtime.ts` (live provider in memory; boot + 60 s refresh), `http.ts`.
- `lib/db/stores/providers.ts` for MySQL / PostgreSQL / MongoDB; migration `2026_11_28_010_providers` (additive,
  reversible). The whole document is sealed (AES-256-GCM). One active per kind is a UNIQUE index.
- `GET/POST /api/admin/sms-providers`, `PATCH/DELETE /api/admin/sms-providers/[id]`,
  `POST /api/admin/sms-providers/[id]/(test|activate|deactivate)`; permission `settings.manage` (owner only).
- `/admin/sms-providers` + `components/admin/sms-providers.tsx`; sidebar item under Admin, before Settings.
- `resolveSms()` returns the live provider first. `pnpm ops:check` accepts a live provider for the SMS blocker.

**Changed**
- Step-up attempts: 10 per 10 minutes per staff member (was 5). Activating, deactivating and editing a live
  provider each use one; 5 blocked an ordinary session. Applies to Settings → Payments too.

**Request shapes** follow the working gateway in the owner's AstroGaon app (`app/Support/Sms/SmsGateway.php`).
They are covered by tests with a fake HTTP layer, not by a real send from this machine.

**Threat model (High tier: whoever controls the live SMS provider can read every sign-in code)**
- Assets: customer sign-in codes (account takeover), provider keys (paid API), SMS spend.
- Actors: guest, non-owner staff, stolen owner session, cross-site attacker, database dump, a tampered form.
- Non-owner or no session → 401 / 403 on every route (prevent, tested). Cross-site → 403 (prevent, tested).
- Stolen session switches the live provider to the attacker's account → activate, deactivate and editing the live
  provider need a fresh TOTP, single use, 10 tries per 10 minutes (prevent, tested); every owner is emailed when an
  email provider exists; audit log + security log always (detect).
- Broken keys saved on the live provider lock every customer out → a live edit must pass a test SMS before it is
  saved (prevent, tested). A provider can't go live untested (prevent, tested).
- Admin-typed URL makes the server call an internal address (SSRF) → no URL field exists; each driver has one
  fixed https host, redirects refused, 10 s timeout (prevent, tested).
- Key read back through the page, API, audit log or an error message → masked hint only; provider errors are
  scrubbed of keys (prevent, tested).
- Database dump → sealed document (prevent, tested on MySQL).
- Free text or extra variables smuggled into an SMS → only a template's allow-listed variables, short safe values
  (prevent, tested). Unknown fields, drivers and template names → 422 (prevent, tested).
- Test SMS used to burn credit or spam a number → Indian mobiles only, 5 per 10 minutes per staff (prevent, tested).
- Two owners activating at once → row locks + UNIQUE index, exactly one live (prevent, raced contract test).

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` 493/493 ✓ (memory + local MySQL). New: `lib/providers/sms.test.ts`
  (11), provider store contract (raced activation, sealed at rest), 3 API tests.
- Local MySQL dev database (`mysql://127.0.0.1:3306/alpha_hood_dev`, environment: local): migration `010` applied.
- Page compiles and answers on the owner's running dev server (MySQL): `/admin/sms-providers` 200,
  `/api/admin/sms-providers` 401 without a session. **Not seen in a browser**: that server was in use and a second
  dev server can't run beside it, so the screen has not been checked at 1440 / 390 / 360 or in dark mode.
- Not done: a real SMS through MSG91 / Fast2SMS / 2Factor (needs the owner's account and DLT templates).
- Not run: PostgreSQL and MongoDB (after MySQL, per the owner's order). `pnpm build` not re-run.

## 2026-11-26 — Local development moved to MySQL (primary database) + four bugs MySQL exposed

**Why:** MySQL is the primary database. Local dev and tests were pointed at MongoDB, which hid MySQL-only faults.

**Local setup (this machine only — env files are not in git)**
- `.env.local` → `DATABASE_DRIVER=mysql`, local `MySQL80` (`127.0.0.1:3306`, `alpha_hood_dev`). Owner made this edit.
- `.env.test.local` → `TEST_MYSQL_URL` (same local credentials, `alpha_hood_test`); the MongoDB test URL is commented out.
- Environment checked before each command: `pnpm db:status` → `mysql://127.0.0.1:3306/alpha_hood_dev · environment: local`.
- `alpha_hood_dev`: 9 migrations applied on an empty database (42 tables), then `pnpm db:seed` (69 demo products,
  686 reviews). `alpha_hood_test`: created empty; the contract tests migrate and wipe it themselves.
- The old MongoDB dev data (staff account, edited products) was not copied. Create the admin owner again at `/admin/setup`.

**Fixed (all found by running the contract tests on MySQL)**
- **Rate-limit counters returned wrong counts under parallel requests** (`lib/db/stores/admin.ts`). The counter
  was bumped in one statement and read in another, so two requests could both read "3" and none "2". Totals were
  right, but a request could be told it was under the limit when it was the one that crossed it. Now bump + read
  run in one transaction (row lock held until commit), with deadlock retry. Security-relevant: every rate limit.
- **Locks could throw "Deadlock found"** (`lib/db/primitives.ts`). InnoDB reports a deadlock when several sessions
  insert the same lock key at once. That now counts as "not acquired yet" and the existing retry loop tries again.
  New helper `isDeadlock` in `lib/db/sql.ts`.
- **Review size chips came out in database row order** (`lib/reviews/summary.ts`): now XS → 3XL order on every
  engine (also the order a shopper expects).
- **CSV import refused a new product without a `placeholder_art` cell** ("choose a valid placeholder drawing").
  New products now start with their category's usual drawing (`defaultArt`, `lib/catalog/product-options.ts`).
  This was the known gap logged as a MongoDB failure; it was engine-independent.

**Threat model:** no new endpoint, data or tracker. The rate-limit fix closes an under-count that let a parallel
burst slip one extra request past a limit (prevent, covered by the existing raced contract test, now green on MySQL).

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` 477/477 ✓, run twice in a row (memory + local MySQL).
  Before the fixes on MySQL: 3–4 failures, different ones per run (concurrency).
- Admin → Settings store (`app_settings`) passes its contract on MySQL (sealed at rest, atomic set + clear).
- Not run: PostgreSQL and MongoDB after these fixes (next step, after MySQL — owner's stated order).
- Not re-run: `pnpm build` and the browser check after these fixes.

## 2026-11-26 — Admin → Settings (from the AstroGaon panel) + faster, steadier admin shell

**Asked for:** bring the AstroGaon admin's settings to this admin, keep that panel's look, stop the layout moving
about, and make the admin load fast.

**What the AstroGaon panel manages, and what came across**

| AstroGaon (Platform Settings + Integrations) | Here |
| --- | --- |
| General: support email / phone | **General**: support email, phone, hours, footer social links |
| Legal & Grievance (DPDP contacts) | **Legal & Grievance**: company name, address, GSTIN, jurisdiction, privacy email, Grievance Officer |
| Security / Marketplace switches | **Checkout & Accounts**: checkout, cash on delivery, customer accounts (kill switches) |
| Integrations: Razorpay | **Payments**: gateway, key ID, key secret, webhook secret (authenticator code to save) |
| Integrations: Analytics | **Analytics & Ads**: GA4 ID + API secret, Meta Pixel + Conversions API token + test code, Google Ads ID + label |
| — | **Search Engines**: allow indexing |
| Encrypted at rest, secrets write-only, "Database / .env / Not set" badge, blank = keep, "remove" = back to .env | Same behaviour |

Not brought across because this store has no such feature to configure: video calls, chat transport, expert
community + WhatsApp QR, marketplace visibility, careers page, blog text-to-speech, vendor fees, AstroEngine, Nutan
feed, FCM, TURN, Jitsi, Anam, AdSense, Redis. Listed as gaps (`docs/known-gaps.md`): shipping / COD fees and return
windows, per-event notification channels, SMS / email / Turnstile / Sentry keys.

**Added**
- `lib/settings`: `catalog.ts` (the one place a setting is declared), `store.ts` (interface + memory),
  `runtime.ts` (saved values override their environment variable in this process), `service.ts` (payload,
  validation, atomic save), `version.ts` (`live()` config objects that re-read after a save).
- `lib/db/stores/settings.ts` for MySQL / PostgreSQL / MongoDB; migration `2026_11_28_009_app_settings` (additive,
  reversible); every value sealed with the secret box (AES-256-GCM). Contract test on all configured engines.
- `GET /api/admin/settings`, `PUT /api/admin/settings/[group]`; permission `settings.manage` (owner only).
- `/admin/settings` + `components/admin/settings.tsx`: section list on the left, one card on the right, one save
  per section — the AstroGaon layout. Sidebar item "Settings" (last) and a link in the user menu.
- `instrumentation.ts`: applies saved settings before the first request and refreshes every 60 s (other servers).
- `lib/admin/server.ts`: reads the signed-in staff member on the server for layouts and pages.
- `confirmTotp` (step-up): payment keys need a fresh authenticator code even inside a signed-in session.

**Changed — admin shell (look matched to the AstroGaon layout, no movement on load)**
- The shell is in the first HTML: the layout reads the session on the server and passes it down. Before, every
  full load showed a full-screen spinner while `/api/admin/me` loaded, then the panel appeared.
- Sidebar collapsed state is a cookie the server reads, so the sidebar renders at its final width. Before, it
  rendered expanded and jumped to collapsed after hydration.
- Sidebar counts are fetched after a mutation or at most once a minute, not on every navigation.
- Topbar like the reference: calendar icon + full date, bell with a count, avatar with initials + name + email +
  chevron, role chip in the menu, red "Log out". Sidebar footer keeps only the theme switch (centred).
  Mobile topbar: bell + avatar + log out.
- Mobile bottom bar: a role with more than five sections gets a "More" tab holding the rest. Before, the sixth
  section (Admin: Staff, Audit log) could not be reached on a phone.
- `LEGAL_CONFIG`, `TRACKING` and the Cookie Policy table are now live objects: they follow a saved setting
  without a restart. Their call sites are unchanged.

**Decisions**
- Saved settings are applied onto `process.env` for the catalogued keys only. Every reader already takes
  `env = process.env` at call time, so the kill switches, gateway, trackers and notices pick a change up with no
  second code path. Nothing saved = the environment value, exactly as before.
- Never settable from the admin: database URL, `SECRET_BOX_KEY`, `OTP_PEPPER`, `CRON_SECRET`,
  `ADMIN_SETUP_TOKEN`, `SITE_URL`, provider wiring, and the preview switches (`ALLOW_MOCK_DATA`,
  `ALLOW_MOCK_PAYMENTS`, `ENABLE_DEV_PAGES`). A test fails if one is added to the catalogue.
- Active section colour is the admin brand accent (red), where AstroGaon uses its amber.
- No new package.

**Threat model (High tier: admin powers + payment credentials)**
- Assets: payment keys and webhook secret (where the money goes), tracker tokens, kill switches, legal details
  shown to every shopper. Actors: guest, non-owner staff, stolen owner session, cross-site attacker, someone with a
  database dump.
- Non-owner staff reads or changes settings → `settings.manage` on both routes, owner only (prevent, tested 403).
- No session → 401 (prevent, tested). Cross-site PUT → same-origin check (prevent, tested 403).
- Stolen owner session swaps the Razorpay keys → fresh TOTP required, single use, 5 tries per 10 minutes per
  staff member (prevent, tested 401 / replay / 429); the change is in the audit log (detect).
- Admin turns on demo payments or dev pages, or repoints the database → those keys are not in the catalogue;
  unknown group 404, unknown field 422 (prevent, tested).
- Secret read back through the page or API → never in the payload, the save response or the audit log; only length
  + fingerprint (prevent, tested).
- Database dump → every value is ciphertext (prevent, tested on the real engine).
- Stored XSS / header injection through a setting → allow-list per field: https-only URLs without credentials,
  strict ID patterns, no control characters or line breaks (prevent, tested).
- Half-saved group → one transaction; one writer at a time (prevent, tested).
- Encryption key changed → unreadable rows fall back to the environment, are named on the page and logged once
  (detect + recover, tested).
- Settings pulled into the browser bundle → guard test on client imports (enforce).

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ (0 warnings) · `pnpm build` ✓ with a throwaway `SECRET_BOX_KEY` for that
  command only (the first attempt failed on a stale Turbopack cache from a keyless run; it passed on re-run).
- New tests: `lib/settings/settings.test.ts` (9), settings contract on memory + local MongoDB, 3 API tests in
  `app/api/admin-api.test.ts`, navigation test in `components/admin/ui.test.ts`.
- `pnpm test`: 476 of 477 pass. The one failure is the MongoDB catalogue test already in `docs/known-gaps.md`
  (`lib/db/contract.test.ts` › "style editor, CSV export -> import and bulk actions"; today's message: "Olive:
  Choose a valid placeholder drawing"). This change does not touch that code.
- Local dev database (`mongodb://127.0.0.1:27018/alpha_hood_dev`, environment: local): `pnpm db:migrate` applied
  `008_staff_password_reset` and `009_app_settings`.
- Headless Chrome on a memory-only dev server (throwaway owner), 1440 / 390 / 360, light + dark, sidebar expanded +
  collapsed: overflow-x 0, console clean, no spinner frame seen, sidebar 224 / 56 px from the first paint,
  `/admin/settings` makes no `/api/admin/me` or settings fetch. Shell visible 180–370 ms after navigation (dev mode).
  Save flow: bad email → field error + toast; valid save → 18 ms, badge "Saved here", value in the HTML after
  reload, the Instagram link appears in the storefront footer. Mobile "More" tab lists Reports, Staff, Audit log,
  View store, Settings.
- Not measured: Lighthouse / production timings (dev mode only).
- MySQL / PostgreSQL: the settings store is written and typed for both, but only memory and MongoDB ran here (no
  `TEST_MYSQL_URL` / `TEST_POSTGRES_URL` on this machine).

## 2026-11-25 — PLP-08 collection rail: design fixes from docs/rail.md + real Alpha Hood photos

Compared our rail with the reference component in `docs/rail.md` and fixed every design flaw found:

| Flaw in our rail | Fix |
| --- | --- |
| Photos and drawings at different sizes; each photo in its own frame, so the garment jumped as it turned | One hanger box for everything (1000 × 1250 canvas, hook tip at the top centre). Every photo is normalised to it |
| The turned garment covered its neighbours, badly on phones | Footprints: side-on garments take only their side width. The faced one takes its full width and the neighbours slide apart (`footprint`, `railTargets`, `stepRailSim`; tested: never overlap) |
| Phones squeezed 5 hangers on top of each other | Below ~580 px the rail is a carousel: one garment faces you in the middle; swipe or use the dots |
| The "turn" was a crossfade | A real 3D turn: rotateY −70° → 0° with perspective. The side photo hands over to the front photo half way, and light falls off as it turns away (`railLight`, masked shade) |
| A white price card covered the hem | A small price tag hangs from each hook on a string and lags the swing. The faced garment's name, price and discount show in a caption under the rail (`aria-live`) |
| A box drop-shadow | The shadow takes the garment's own shape and narrows as it turns side-on |
| A flat bar | A steel rod with wall brackets and a soft wall light |
| Hit areas were the boxes, which overlap | Hit-testing uses each garment's current footprint, so you grab the one you see |
| A drag could not push neighbours properly; the faced garment had no room | Drag shoves neighbours, releases coast then spring home, and the swing reacts to the hook's acceleration |
| Dialog: crossfade between photos | The garment lifts off the rail into the dialog (FLIP, transform only), then spins front ↔ back (drag or buttons, spring). The side view is a third button |

- Kept from our version: Radix Dialog (focus trap, Escape, focus back to the hanger), quick add, PDP link, square
  corners, brand tokens, Hugeicons, `next/image`, reduced motion (no physics, instant turn, no lift), keyboard
  (arrows / Home / End / Enter), lazy front photos (only side shots on first paint). Not taken: autoplay (moving
  content above the grid would need a pause control) and the reference's hot-linked 21st.dev images.
- **Photos.** The owner's four mock-ups of the black Alpha Hood hoodie (front, back, side, three-quarter back) were
  white-background PNGs at two sizes; the front had no hanger.
  - The background was cut out with an edge flood fill, so the white sleeve prints are kept, and edges were cleaned
    so no white fringe shows.
  - All views are at the same garment height on one 1000 × 1250 canvas, with the hook at the top centre. The front
    gets the back photo's hanger, mirrored.
  - Files: `public/demo/products/oversized-hoodie-black-{front,back,side,angle}.webp` (36–83 KB). They're on the demo
    colour "Heavyweight Oversized Hoodie — Black". The three-quarter shot is a gallery photo.
  - The Maestiq sample photos are removed; Grey Melange is back to a drawing.
- **Seed.** `pnpm db:seed` now refreshes the DEMO photos of demo products already in a local database. Products with
  a staff-uploaded photo are never touched (tested). The local dev DB was refreshed: 2 photo sets.

**Threat model:** no new endpoints, data or trackers. The seed still runs only behind the local-database guard
(tested). Photo URLs are still limited to our own media and `/demo/products/` (tested earlier).

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · unit tests 357/357 ✓ (new: footprints, layout fits every width, carousel
  centring, no overlap while turning / dragging, swing limits, frame-gap safety, photographed colour picked, seed refresh
  and its guard) · DB contract on memory 45/45 ✓.
- Headless Chrome, dev server, `/collections/combos` and `/collections/winter-drop` at 1440 / 768 / 390 / 360:
  - rest, mid-turn, faced and dialog front / back all render; overflow-x 0; no console errors;
  - a real mouse hover turns a garment and its neighbours make room;
  - a drag shoves the neighbours, they spring back after release, and no dialog opens;
  - Escape closes the dialog and focus goes back to the hanger;
  - reduced motion turns instantly.

## 2026-11-25 — Newsletter: "You're subscribed" alert + admin Subscribers screen (GLB-05)

- **Footer form** (`components/store/newsletter-form.tsx`), with email or mobile (WhatsApp) number:
  - After a successful sign-up a toast shows "You're subscribed" (`showSubscribedToast`, black bar, Hugeicons tick,
    5 s, `role="status"`).
  - The form turns into a confirmation with an "Add another email or number" button that resets the form, including
    the consent tick.
  - Placeholder now says "10-digit mobile number".
  - Unchanged: the unticked consent box validated on the server, a consent ledger row per sign-up, the same answer
    for repeats, 5 per 10 min per IP, one-click withdrawal.
  - Checked on the dev server (MongoDB): email and mobile sign-ups → 201.
- **Admin → People → Subscribers** (`/admin/subscribers`, new permission `subscribers.read` = owner + marketing):
  - Search (literal, debounced), channel and status filters in the URL, 50 per page, newest first, contacts masked.
  - **Export CSV**: full contacts for the current filter, unsubscribed left out unless filtered for, formula cells
    neutralised, 10 per hour per staff member, audited `subscribers.export_csv` with the count.
  - Routes: `GET /api/admin/subscribers`, `GET /api/admin/subscribers/export`.
  - Service: list / mask / CSV in `lib/newsletter/service.ts`.
- `NewsletterStore.list()` on memory, MySQL / PostgreSQL (LIKE with `%` / `_` / `\` escaped, bound) and MongoDB
  (escaped regex). No schema change.
- **Threat model.** Abuse cases and what stops each one:
  - a staff member without the permission reads the list → 401 / 403 on the server;
  - mass export of personal data → permission, rate limit, audit row;
  - CSV injection → `csvCell`;
  - search injection / ReDoS → escaped LIKE / regex;
  - sign-up spam → the existing per-IP limit.
- Tests:
  - `app/api/admin-api.test.ts`: footer sign-ups appear masked; 401 / 403 for other roles; CSV has the full contact
    with formulas neutralised; audit row.
  - `lib/db/aftersales-contract.ts`: order, filters, literal `_` / `.` / `%` search, paging. Passed on memory and
    local MongoDB.

## 2026-11-25 — Admin: "Forgot password?" by email code (self-service, owners included)

- `/admin/forgot` is now a real reset:
  1. Enter your work email.
  2. Get a 6-digit code by email.
  3. Enter the code and a new password (with show / hide).
  4. You're back at sign-in. The authenticator code is still needed.
  - Works for every role, including the owner, with no other owner needed.
- API (public, `app/api/admin/password/forgot` and `/reset`; allow-listed in the "every admin route is guarded" test):
  - Same-origin only.
  - Rate limits: 5 per 15 min and 20 per day per IP, plus a global cap. Per email, the OTP service adds a 30 s
    cooldown, 5 per hour and 10 per day.
  - Codes: random 6 digits, stored as an HMAC, single use, 5 minutes, 5 tries.
  - The answer is the same for unknown, disabled or limited emails (no staff enumeration).
  - Success: new password, lockout cleared, every session revoked, no session created, audit `staff.password_reset`
    (`via: email_code`), and a "your password was changed" email.
- Reuses the customer OTP service (`lib/auth/otp.ts`), with two new options:
  - `purpose` is mixed into the code hash, so an admin code never verifies on customer sign-in and the other way
    round. Customer hashes are unchanged.
  - `deliver` sends the code by another channel (email).
  - The OTP store key is a derived 16-char hash, so no email is stored in `otp_challenges`.
- New `lib/notify/email.ts` (same pattern as SMS):
  - `EmailAdapter`; plain-text fixed templates; header-injection check.
  - Demo mailer in dev (code shown on screen), refused in production.
  - Real providers via `EMAIL_PROVIDER`. None yet: the owner picks one, and until then the live store answers 503 there.
- One password setter (`applyNewPassword`) for all three paths: email code, owner link, CLI.
  - The owner-link path now also sends the "password changed" email.
- `pnpm admin:reset-link --reset-mfa` also clears two-step verification (lost mailbox and phone), audited.
- `.env.example`: `EMAIL_PROVIDER`.
- **Threat model.** Abuse cases and what stops each one:
  - email enumeration → same answer;
  - mailbox spam → IP / email / global caps;
  - code guessing → 5 tries, 1 M space, 5 min;
  - code replay or race → atomic consume;
  - a code from one flow used in another → purpose-scoped hash;
  - a code bound to email A used for email B → key check;
  - a weak password burning the code → checked first;
  - takeover through a compromised mailbox → TOTP still required, a notice email, an audit row, and the owner can
    disable the account.
- Tests (`app/api/admin-api.test.ts`):
  - an owner resets end-to-end with the email code;
  - an unknown email gets the same response and no mail is sent;
  - 422 / CSRF;
  - the admin code is refused by `/api/otp/verify`;
  - a weak password doesn't burn the code;
  - a code is bound to its email; wrong code; single use;
  - old session and old password dead, TOTP still required, notice sent, audit row;
  - fails closed in production without a provider;
  - per-IP rate limit.

## 2026-11-25 — Fix: hand (pointer) cursor on every button and clickable control

- **Cause:** Tailwind v4 no longer gives buttons `cursor: pointer`, so buttons across the store and the admin
  showed the arrow cursor.
- **Fix:**
  - one base rule in `app/globals.css` covers buttons, Radix controls (tabs, menu items, select options,
    checkbox / radio / switch, comboboxes), checkboxes, radios, colour and file pickers, `<summary>` and the
    labels that wrap file inputs;
  - disabled controls show the not-allowed cursor;
  - removed the explicit `cursor-default` from admin select options and the "Sign out" menu item;
  - the invisible full-screen menu backdrop keeps the arrow cursor.
- **Verified:** the dev server serves the new rule. Not checked by hovering in a browser.

## 2026-11-25 — Admin: sign-in screen polish + staff password reset

**Sign-in screens** (`/admin/login`, `/admin/setup`, `/admin/invite/[token]`; shared `AuthCard` in
`components/admin/auth-forms.tsx`):
- The owner's storefront photo (`public/admin/login-store.webp`, 1672×941, 166 KB WebP from a 2.3 MB PNG) fills the
  page (`next/image` `fill`, `preload`) under a dark gradient. Suspense fallbacks are `bg-neutral-950` (no white flash).
- The card is more see-through: `bg-white/45` (dark `bg-neutral-950/45`) + `backdrop-blur-md`. Secondary text uses
  `text-foreground/70–75` so it stays readable on the glass.
- Mascot cutouts next to the card were tried and removed (owner's call).
- Password fields have a show / hide button (Hugeicons `ViewIcon` / `ViewOffSlashIcon`, `aria-label`, `aria-pressed`).
- Submit buttons are right-aligned and sized to their label (no longer full width).

**Password reset for staff (High tier: auth)**
- New pages: "Forgot password?" on the login links to `/admin/forgot`, which explains the reset steps.
  Self-service email reset is deliberately not offered (no email provider yet, and email-only reset is the easiest
  takeover path).
- An owner chooses **Reset link** next to a staff member on `/admin/staff`
  → `POST /api/admin/staff/[id]/reset-link` (`staff.manage`, CSRF-checked, rate-limited, audited
  `staff.password_reset_link`).
  - The owner gets a one-time link `/admin/reset/<token>`: 1 hour, SHA-256 hash stored, shown once.
  - Refused for yourself (409), unknown (404) or disabled (409) accounts.
- The person opens the link and sets a new password (`POST /api/admin/invite/accept`, audited `staff.password_reset`).
  - Single use, also when two requests race (atomic consume).
  - Refused if the account was disabled or its email changed after the link was made.
  - The new password clears the lockout and revokes every session.
  - **Two-step verification is kept**, so a leaked link alone can't sign anyone in.
- Sole owner locked out: `pnpm admin:reset-link --email=… [--env-file=…]`. It needs server shell + database access,
  prints the target database, and is audited with actor `cli`.
- Storage: reset links reuse `staff_invites` with a new nullable `reset_for` column. Migration
  `2026_11_28_008_staff_password_reset` is additive and idempotent, with a `down()`; MongoDB gets the same-named
  no-op (optional field).
- Fix: the Staff screen's `act()` chose PATCH for any URL containing `/staff/stf_`; it now matches the exact
  `/staff/<id>` URL only.
- **Threat model.**
  - Abuse cases and what stops each one:
    - a stranger requests a reset → no public endpoint;
    - a non-owner issues one → 403;
    - an owner resets themselves to dodge oversight → 409;
    - the link leaks → 1 h expiry, single use, TOTP still required, audit;
    - the link is replayed or raced → atomic consume;
    - a disabled account is revived → refused;
    - CSRF → origin check.
  - Detect: audit entries.
  - Recover: Disable / Reset 2-step.
- Tests:
  - `app/api/admin-api.test.ts`: 401 / 403 / 409 / 404 / CSRF; link works once; short password 422; old session
    and old password dead; new password still needs TOTP; audit rows.
  - `lib/db/admin-contract.ts`: raced single use, MFA kept, sessions revoked, expired / disabled / changed-email
    links refused.

## 2026-11-25 — Admin: bulk actions and CSV import / export for products

- **Bulk actions (`/admin/catalog`):**
  - tick products (or "select all on this page", max 100) and use the bar at the bottom: Publish, Unpublish,
    Category (with sub-category), Tags (add / remove), Archive;
  - Unpublish and Archive ask for confirmation first;
  - every colour of each selected product changes in ONE transaction (`writeMany`, every version checked);
  - a product edited meanwhile → 409 and nothing changes.
  - Service: `lib/catalog/bulk.ts`. Route: `POST /api/admin/catalog/bulk` (`catalog.write`, audited as
    `catalog.bulk.<action>` with the style ids).
- **CSV export:** "Export CSV" button, `GET /api/admin/catalog/export`.
  - One row per size, with every product, colour and size field and the live stock.
  - `catalog.read`; the `cost_price_inr` column is included only for `catalog.write` roles.
  - Formula cells neutralised; 20 exports per hour per staff member; audited (`catalog.export_csv`).
- **CSV import:** `/admin/catalog/import`, `POST /api/admin/catalog/import` with `{ csv, apply }`.
  - The file is planned first (dry run): new / update / unchanged per product, plus row-level errors.
  - Apply is possible only when there are no errors, and asks for confirmation.
  - Every product goes through the editor's rules (`saveStyle`) and is written in one transaction.
  - Products are matched by `style_id`, else by a known `colour_sku`, so re-running a file is safe.
  - Columns left out keep their values. Photos are never changed by CSV. `stock` is only the opening stock of
    new sizes.
  - Codes and web addresses are checked for uniqueness across the whole file too.
  - Limits: 2.5 MB / 5000 rows; 60 runs per hour; applied imports audited (`catalog.import_csv`).
  - Service: `lib/catalog/csv.ts` (RFC 4180 parser, no new package).
- **Refactor:**
  - `csvCell` moved to `lib/security/csv-cell.ts` (`lib/admin/ops.ts` re-exports it), plus `uncsvCell` so guarded
    values round-trip.
  - The products list moved from `components/admin/screens.tsx` to `components/admin/catalog-list.tsx`.
  - `saveStyle` gained `dryRun` and reports which colours would change.
  - DataTable column headers accept elements.
- **Threat model:**
  - a CSV is untrusted input: size / row / cell caps, unknown columns refused, `style_id` must exist, colours are
    matched only inside their own product, every value is allow-listed;
  - formula injection is guarded both ways;
  - cost price is exported only to editors;
  - bulk and import need `catalog.write`; export needs `catalog.read`;
  - same-origin and rate limits; audit entries.
- **Tests:**
  - `lib/catalog/csv.test.ts` (11):
    - parser edge cases;
    - export (cost column, formula guard); export → import of the whole demo catalogue changes nothing;
    - plan writes nothing; create; re-run is a no-op;
    - partial-column update keeps the other values, photos, live stock and other colours;
    - row errors → nothing applied; unknown / missing columns, size cap, duplicate barcodes across products;
    - guard round-trip;
    - bulk publish / archive / category / tags; invalid input; all-or-nothing on a concurrent edit.
  - `admin-api.test.ts`: 401 / 403 (support can't export, marketing can't import or bulk) / cross-origin /
    read-only 409.
  - Contract (end to end on each database): export → import plan, CSV create, style editor PUT + stale 409,
    bulk archive, audit actions.

## 2026-11-25 — PLP-08 collection rail: real on-hanger photos (front / back / side) instead of drawings

- **Rail turn with photos.** A colour with on-hanger cutouts tagged **side** and **front** (`hangerShots`,
  `lib/catalog/rail.ts`) now hangs on the rail as its real side shot. Hover / focus / first tap turns it to the
  front shot: rotateY + crossfade around the hook, transforms and opacity only. The cutouts carry their own hanger,
  so the drawn hook and shoulders are skipped. Colours without the pair keep the drawing on a drawn hanger.
- **Dialog.** "Lifted off the rail" shows Front / Back / Side photos when they exist. Drawings keep the Front / Back flip.
- **Pick.** Within a style, the colour that has hanger photos is the one that hangs. Styles are still ranked by their
  most popular in-stock colour, one hanger per style.
- **Admin.** Style editor → each photo has a "Use" select: Gallery photo / Hanger · front / back / side. A view can
  be on only one photo, and picking it on another photo moves it. Help text gives the shot spec: transparent PNG,
  same frame for all three, hook at the top centre. The server allow-lists `view`, refuses a repeated view
  (`photos[].view`, `lib/catalog/admin.ts`), and the editor and CSV round-trip it (`photosFromImages`). Untagged
  photos no longer get an automatic `view: "front"`. A legacy record's automatic tag is dropped when it is read back.
- **Demo.** The owner's three sample cutouts (645 × 1000 WebP, transparent) are now
  `public/demo/products/oversized-hoodie-grey-melange-{front,back,side}.webp`, on a new DEMO colour **Grey Melange**
  of "Heavyweight Oversized Hoodie" (mock catalogue). They show up in the Hoodies rail. `GarmentArt` renders
  `/demo/products/*` like uploaded media. Demo photos survive an editor save or CSV re-import that sends no photos.
- **Performance.** Side shots load lazily via `next/image` (AVIF/WebP, `sizes` = 112/140/190 px hanger widths). Front
  shots mount only once the rail is "warm": first pointer, focus or touch on it, or browser idle (≤ 4 s). This halves
  the first-load image requests. Every shot sits in a fixed 645 / 1000 box → no CLS.

**Threat model**
- Assets: catalogue integrity, storefront rendering. Actors: staff with `catalog.write`, a tampered admin client.
- Arbitrary / remote image URL injected through a photo → `photos[]` accepts only `{id, alt, view}`. Any `url` is
  an unknown field (422). Rendering only accepts `/api/media/med_<32 hex>` or `/demo/products/<slug>.(webp|png|jpg)`
  (`lib/catalog/photo-url.ts`), otherwise the drawing is shown (prevent, tested incl. `..` traversal and `//host`).
- Made-up view or the same view twice → allow-list + uniqueness check, 422 (prevent, tested).
- No new endpoints, personal data or trackers → no DPDP change.

**Verification**
- `pnpm typecheck` ✓ · `pnpm lint` ✓ (0 warnings) · unit tests 346/346 ✓ (new: hanger shots, URL allow-list incl.
  traversal, pick prefers the photographed colour, tag round-trip, bad / duplicate views refused, export → import
  unchanged with demo photos) · DB contract on memory 44/44 ✓.
- DB contract on MongoDB: **not confirmed**. While it ran, another `pnpm test` process was using the same
  `alpha_hood_test` database, and failures moved between unrelated suites (MFA, invites, alerts) from run to run.
  Re-run `pnpm test` alone.
- `pnpm build` ✓ (162 pages) with a throwaway `SECRET_BOX_KEY` passed to that command only. Without a key, the build
  stops at the existing fail-closed check, because `.env.local` turns on the MongoDB stores (owner TODO: production key).
- Local dev DB: `pnpm db:seed` added the new demo colour (1 product, existing kept).
- Headless Chrome on `/collections/combos` at 1440 / 390 / 360: the side shot hangs on the rail and focus turns it
  to the front with its price tag. The dialog shows Front / Back / Side photos. Overflow-x 0, console clean.
  Fixed during review: the photo hanger had no floor shadow next to the drawings (added a drop shadow).

## 2026-11-25 — Brand: site logo shows ™ (top-right of the "D")

- Every horizontal lockup on the site now uses the ™ version with the ™ at the top-right of the "D" of HOOD
  (`logo-symbols/tm/*_tm-top.svg`, copied unchanged):
  - `public/brand/logo/primary-horizontal_color_tm.svg` and `primary-horizontal_color-on-dark_tm.svg`;
  - `assets/brand/primary-horizontal_color-on-dark_tm@600.png` for the per-product OG cards (`lib/seo/og.tsx`).
- **Where:** `components/store/logo.tsx` (`<Logo>`: header, footer, coming-soon header, 404, checkout, menu
  drawer), admin sidebar and mobile topbar (`admin-shell.tsx`) and the admin sign-in card (`auth-forms.tsx`).
- The ™ lockup is 1131 × 360 (was 1072 × 360), so every `width`/`height` was updated → no layout shift.
- **Not changed:** the mark-only logo (no wordmark, so no ™), favicons / app icons, the static site share image
  (`app/opengraph-image.png`), the trademark filing images (must stay symbol-free). The old non-™ files stay in
  `public/brand/logo/`.

## 2026-11-25 — Admin: product (style) editor with colour × size variants

- **One product = a style with colours.** Each colour has:
  - its own web address, photos, swatch, price / MRP, badge, status and SEO title / description;
  - its sizes, each with its own SKU, barcode (EAN / GTIN, check digit verified) and opening stock.
  Shared by the style and written to every colour: name, category, description, filters, specs, size chart, model
  note, legal declarations, GST class, HSN, packed weight and package size.
- **Screens:**
  - `/admin/catalog` now lists one row per product: colour swatches, price range, stock and live / draft status;
    search covers name, SKU, size SKU and barcode.
  - `/admin/catalog/style/[styleId]` is the editor. It has colour tabs, "Add colour" (copies the sizes and prices
    of the current colour), "Fill empty size SKUs", photos per colour, "Save and publish drafts" and a margin hint
    from the cost price.
  - `/admin/catalog/new?from=<styleId>` duplicates a product as a draft (new codes and web addresses).
  - Old `/admin/catalog/[id]` links open the colour's product. `components/admin/product-editor.tsx` was removed.
- **New fields:**
  - `gstClass` and `hsn` on products: the cart's GST rate uses the product's class. Each priced line, order line
    and tax invoice now carries the HSN; the invoice has a new HSN column.
  - `seo` is used by the product page metadata.
  - Admin-only: `costPrice`, `weightGrams`, `dimensionsCm`, size `sku` / `barcode`. `toProduct` removes them
    (`ADMIN_ONLY_FIELDS`), so they never reach the storefront, page props or feeds.
- **Store:** `CatalogStore.writeMany` writes all colours of a style in one transaction, with every version checked.
  - SQL: `sqlTx`.
  - MongoDB: `mongoTx`.
  - Memory: implemented too.
  - A stale version or a taken handle rolls back the inserts as well.
- **Service / routes:**
  - Business rules live in `lib/catalog/style.ts`.
  - `GET` / `PUT /api/admin/styles/[styleId]` and `POST /api/admin/styles`; `GET /api/admin/catalog?view=styles`.
- **Threat model:**
  - Colour ids must belong to the style being edited (no editing other products through it).
  - A colour can't be dropped (archive it instead).
  - A published colour's web address is locked (no redirects yet).
  - Size SKUs and barcodes are unique across the catalogue.
  - Every field is allow-listed (shared parser with single products and the import).
  - Stale or racing saves → 409 with nothing written.
  - Cost price is returned only to `catalog.write` roles, also on the old `GET /api/admin/catalog/[id]`.
  - `catalog.write` is needed to save; saves are audited (`catalog.style.create` / `catalog.style.save`).
- **Tests:**
  - `lib/catalog/style.test.ts` (13): create; no admin-only fields on the storefront; cost redaction;
    20 tampered-input cases; catalogue-wide SKU / barcode uniqueness; shared fields reach every colour; archive;
    live stock kept; ownership / drop / handle-lock refusals; race → one winner, the loser writes nothing; list
    search; GST class / HSN pricing; GS1 check digits.
  - Contract: `writeMany` rollback on memory + MongoDB.
  - Routes: 401 / 403 / cross-origin / read-only (`admin-api.test.ts`).
- **Verified:**
  - `pnpm typecheck` and `pnpm lint` clean;
  - `pnpm test`: 30 files / 423 tests passed;
  - catalogue contract + admin API on local MongoDB: 117 passed;
  - `pnpm build` compiled. Page-data collection passes with `COMMERCE_PROVIDER=mock`. With the own backend
    configured it stops (fail closed) for the missing `SECRET_BOX_KEY` in production mode (see the owner TODO);
  - dev server: the new pages return 200 and the APIs 401 without a session.
  - Not checked in a signed-in browser at 1440 / 390 / 360 px.
  - MySQL / PostgreSQL not run (no test servers).

## 2026-11-25 — Brand: ™ and ® versions of the logos

- **New:** `scripts/brand-marks.mjs` writes `docs/brand/logo-kit/logo-symbols/{tm,registered}/`:
  - 11 wordmark-bearing masters (horizontal ×4, stacked ×3, wordmark ×2, one-line ×2);
  - 2 positions at the "D" of HOOD: `-top` (top-right) and `-bottom` (bottom-right, on the baseline);
  - 44 SVGs + PNGs at 600 / 2000 px.
- **How it's made:** each master is copied unchanged, plus one path for the symbol. The viewBox gets wider only
  when the symbol wouldn't fit the original right margin; the stacked lockup grows on both sides so it stays
  centred. The symbol is Anton's ™/® glyph, outlined (no font needed), 30% of the D's height, in the
  wordmark's colour.
- **Not changed:** the original masters, `public/brand/`, the site header and the trademark filing images
  (those must stay symbol-free).
- **Not made:** PDF versions (the kit's PDFs came from a tool that isn't in the repo).
- **Legal:** use ® only after registration (Trade Marks Act 1999, s.107). Noted in the logo kit README.
- **Verified:** visual preview of all four variants on light and dark backgrounds. No app code changed, so
  `pnpm verify` wasn't run.

## 2026-11-25 — Admin: categories, homepage category rail and collections (own backend)

Owner decisions recorded in `docs/admin/gap-analysis.md` §7:
- CMS and everything else stay on the own backend and the own panel;
- products get colour × size variants managed in the panel;
- courier goes behind a Shiprocket-style aggregator adapter.

- **New screens:** `/admin/categories` and `/admin/collections`, listed in the Catalogue nav.
- **Categories (`/admin/categories`):**
  - add, rename, reorder and remove categories and sub-categories;
  - each one has an image: a placeholder drawing, or a photo uploaded to the own media store;
  - edit the homepage category rail: tiles, order, and a link to a category or a sub-category;
  - changes collect locally and go live with one "Save changes".
- **Collections (`/admin/collections`):**
  - rule builder with these conditions: category, sub-category, attribute, badge, size in stock, new in N days,
    % off, max price, popularity, hand-picked products;
  - each condition can include or exclude, and the rule matches all or any of them;
  - a live preview shows the count and a sample of matching products;
  - imported rules too deep for the builder are kept as they are;
  - removing a collection is refused while combos or storefront links use it.
- **Service:** `lib/catalog/taxonomy.ts` holds the business rules. The routes are:
  - `GET/PUT /api/admin/categories`;
  - `GET/PUT /api/admin/collections`;
  - `POST /api/admin/collections/preview`.
- **Store:** `CatalogStore.replaceDocs` is a compare-and-set on a new `revision`. SQL uses a row lock; MongoDB
  uses a filter on the revision. The memory store implements it too. A new `productIds` collection rule.
- **Threat model:** stolen staff session, low-privilege staff, tampered bodies, orphaned products, lost updates.
  - Server allow-lists every field; handles are slugs.
  - Images: only an own media id (no URLs, so no SSRF or `javascript:` links).
  - Category or sub-category still used by products → 422. Collection rules pointing at a removed category →
    refused.
  - Stale save → 409.
  - `catalog.read` to view, `catalog.write` to save; same-origin + rate limit; audited
    (`catalog.categories` / `catalog.collections`).
- **Tests:**
  - `lib/catalog/taxonomy.test.ts` (12): round-trip of every demo rule; add/reorder/rename; race → one winner;
    in-use refusals; 13 tampered-field cases; 14 tampered-rule cases; the store shows the new tree.
  - Contract: `replaceDocs` race on memory + MongoDB.
  - `admin-api.test.ts`: 401 / 403 (support, marketing) / cross-origin 403 / read-only provider 409.
- **Local setup:** `.env.local` now sets `COMMERCE_PROVIDER=own` (the product editor was hidden because the mock
  catalogue is read-only). Ran `db:status`, `db:migrate` (up to date) and `db:seed` (0 new) on local
  `alpha_hood_dev`.
- **Verified:**
  - `pnpm typecheck` and `pnpm lint` clean;
  - `pnpm test` 29 files / 407 tests passed, plus the 12 new taxonomy tests;
  - catalogue contract on local MongoDB 10/10;
  - `pnpm build` compiled;
  - dev server: `/admin/categories` and `/admin/collections` 200, API 401 without a session.
  - Not checked in a browser at 1440 / 390 / 360 px (no signed-in browser session here).
  - MySQL / PostgreSQL contract not run (no test servers).

## 2026-11-25 — Analysis: admin panel gaps (no code change)

- `docs/admin/gap-analysis.md`: what a store owner needs in `/admin`, what exists, what is missing, by module
  (products, categories/collections, CMS/homepage, promotions, orders/shipping, settings, customers, reports,
  inventory, admin UX), with P0/P1/P2, new permissions, threat-model notes, build order and owner decisions.
- Finding: the product editor is hidden locally because `.env.local` has no `COMMERCE_PROVIDER=own` (mock catalogue
  is read-only).
- Finding: storefront content, promotions, shipping/COD/GST settings live in code constants; the mock CMS is
  refused in production with no real adapter (🔴, added to `docs/known-gaps.md`).

## 2026-11-27 — Fix: admin sidebar clicks looked like they did nothing

- **Cause:**
  - Admin pages are dynamic and personal (`instant = false`), and the `(panel)` group had no `loading.tsx`. After a
    click, the router kept the old page on screen until the new one was rendered on the server. On a busy dev machine
    (Turbopack compiling each admin route on first visit) that took seconds, with no feedback, so it looked like the
    link didn't open.
  - A browser tab opened before this morning's layout change also kept the old JavaScript; it needs one hard refresh.
- **Fix:**
  - `app/admin/(panel)/loading.tsx`: the page area switches to a skeleton at once on every sidebar click, inside the
    persistent shell;
  - sidebar and mobile-menu links show a small spinner while their page loads (`useLinkStatus` from `next/link`, per
    the Next 16 docs).
- **Test:** the admin shell guard also requires the `(panel)` loading boundary.
- **Verified:**
  - typecheck and lint clean;
  - the admin pages return 200 on `next dev`;
  - no new errors in the dev log;
  - the guard test passes.
  - Not clicked in a browser (no browser tool here).

## 2026-11-27 — Fix: every admin sidebar click looked like a full page reload

- **Cause:** each admin page rendered its own `<AdminShell>`, and `app/admin/(panel)` had no shared layout. Every
  navigation therefore unmounted and rebuilt the whole shell (sidebar, topbar), re-fetched `/api/admin/me` and showed
  the full-screen spinner until it answered. The links were already `next/link`, so it was a client navigation, but
  it looked like a reload.
- **Fix:**
  - `app/admin/(panel)/layout.tsx` renders one persistent `AdminShell` around all panel pages;
  - the 20 panel pages now render only their screen;
  - the page title comes from the URL (`adminTitle` in `components/admin/admin-shell.tsx`);
  - only the page area shows a loading placeholder (`<Suspense>` inside `<main>`), while the sidebar and topbar stay.
- **Also related:** the Reports crash fixed earlier today made Fast Refresh do a real full reload; that is gone too.
- **Test:** a guard in `app/api/admin-api.test.ts` checks that the shell is in the layout and that no panel page
  renders `<AdminShell>` again.
- **Verified:**
  - typecheck and lint clean;
  - admin tests 19/19;
  - on `next dev` (port 3100), `/admin`, orders, an order, products, new product, reports, inventory and staff all
    return 200.
  - Not clicked through in a browser (no browser tool available here).

## 2026-11-27 — Fix: admin Reports page crashed ("Slot failed to slot onto its children")

- **Cause:** `AButton` with `asChild` (a link styled as a button) passed Radix `Slot` two children: the loading
  spinner's slot (`null`) and the link. `Slot` needs exactly one element, so `/admin/reports` crashed when it
  rendered the "Export orders CSV" link.
- **Affected:** the same pattern sits under "New product", "View in store" and the other link-buttons in the admin.
- **Fix:** `components/admin/ui.tsx` renders `asChild` as a bare `Slot` around the single child; the spinner only
  belongs to the real `<button>`.
- **Test:** `components/admin/ui.test.ts` checks that a link-button renders as an `<a>` with the button styles, and
  that a loading button is disabled and shows the spinner.
- **Verified:** the regression test passes (2/2); typecheck and lint are clean; `/admin/reports` on `next dev`
  returns 200 with no Slot error in the log.

## 2026-11-27 — SMS pipeline: DLT templates, outbox delivery worker, provider registry (High-risk tier: auth OTP, personal data)

**Not done:** the real provider adapter. I couldn't confirm MSG91's current v5 API from a first-party source (the
docs render with JavaScript; the public GitHub SDKs use legacy endpoints). I didn't ship a guessed request format,
which would pass fake-API tests and fail with real SMS. Everything around the adapter is built, so adding a provider
is one factory plus a test (docs/known-gaps.md → SMS).

**Threat model:**
- *Assets:* OTP codes, customers' phone numbers, the sender reputation and DLT compliance, provider credits.
- *Actors:* anyone triggering messages; a crashed or duplicated worker; a provider outage.
- *Abuse cases and the layer that stops each:*
  - free-text / phishing SMS from our sender → templates only, DLT ids from config, variable allow-list per
    template, values `[A-Za-z0-9 ._/-]{1,30}`;
  - leaking personal data in SMS → no names or addresses, only order / return numbers, product handle, OTP;
  - phone numbers stored in the queue → looked up at send time, so an erased account gets nothing;
  - marketing sent by SMS → never;
  - a message sent twice by parallel workers → atomic claim (conditional update / `findOneAndUpdate`);
  - a channel re-sent on retry → per-channel results, and sent channels are skipped;
  - provider outage → back-off 1 m / 5 m / 15 m / 1 h, at most 5 attempts, then failed;
  - crashed worker → stale claims are re-offered after 10 min;
  - an unknown or misconfigured provider silently falling back to the demo (which shows codes) → refused;
  - going live without SMS → `ops:check` blocker.

**Added**
- `lib/notify/sms.ts`: the `SmsAdapter` contract (`sendOtp`, `supports`, `send`), `SMS_VARIABLES`,
  `templateVars`, `readTemplateIds` (`SMS_TEMPLATES`), the `SMS_PROVIDERS` registry (empty), and a demo SMS that
  records instead of sending.
- `lib/notify/delivery.ts`: the delivery worker, run by `/api/cron/sweep`, which reports counts only.
- Outbox delivery state for all engines:
  - `claim` / `finish`;
  - SQL migration `2026_11_27_007_outbox_delivery` (additive columns with defaults + a due index);
  - Mongo migration (backfills existing rows + index).
- `ops:check` blocker `sms_provider`.
- `.env.example`: `SMS_PROVIDER`, `SMS_TEMPLATES`.
- `lib/notify/delivery.test.ts` (7 tests) and an outbox claim / back-off / stale-claim contract on every database.

**Changed**
- `OutboxMessage.status` is `queued` / `sending` / `done` / `failed`.
- The client-bundle guard test gets a 120 s timeout. It walks every source file and exceeded 5 s on a busy machine;
  no leak was found.

**Verified**
- `pnpm verify`: typecheck, lint, 389/389 tests (memory + local MongoDB), build.
- `pnpm audit --prod`: clean.
- `pnpm db:migrate` on local `alpha_hood_dev`: 7 migrations.

## 2026-11-27 — Payments: Razorpay gateway (Payment Links) + payment reconciliation in the cron (High-risk tier: payments)

**Threat model:**
- *Assets:* money, order state, stock held during payment, refunds.
- *Actors:* a shopper forging the return from Razorpay; anyone forging or replaying webhooks; a slow or failed
  gateway; an attacker trying to redirect shoppers to a fake payment page; double refunds on retries.
- *Abuse cases and the layer that stops each:*
  - forged "paid" return → the return route ignores the query and asks Razorpay's API (`fetchStatus`);
  - forged / tampered webhook → HMAC-SHA256 over the raw body with the webhook secret, constant-time compare;
  - replayed webhook → event id de-duplication (`markEvent`) and an age limit (3 days);
  - wrong amount or currency → INR only, and the amount must equal the attempt and the order total (existing
    handler);
  - open redirect / phishing → the client only gets `/api/payments/go/<order>`, which checks the session owns the
    order and redirects to the stored gateway URL (https on rzp.io / razorpay.com only);
  - double refund on a timeout retry → `X-Refund-Idempotency` + `receipt` from our reference, and existing refunds
    are looked up first;
  - a paid order left unconfirmed by a missed webhook → `reconcilePending` now runs in the cron sweep (it was never
    scheduled before);
  - personal data sent to the gateway → only the order number and amount (no phone / email);
  - SSRF → fixed API host, `redirect: "error"`, 10 s timeout;
  - test keys live → `ops:check` blocker.

**Added**
- `lib/payments/razorpay.ts`:
  - payment link create;
  - webhook verify (`payment_link.paid` → succeeded; expired / cancelled → failed; other events → `"ignored"`, 200);
  - status fetch;
  - idempotent refunds.
- Routes:
  - `app/api/payments/go/[order]` (owner-checked hop to the hosted page);
  - `app/api/payments/return` (API-verified return).
- `PaymentAttempt.payUrl`, plus `payRedirect` / `hostedPayUrl` / `syncAttempt` in the checkout service.
- `components/checkout/api.ts` `goToPayment`: a full page load for the hosted-gateway hop.
- Env:
  - `PAYMENT_GATEWAY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (`.env.example`);
  - `ops:check` requires live keys + a webhook secret when Razorpay is on.
- `lib/payments/razorpay.test.ts`, against a fake Razorpay API with real HMAC signatures:
  - config fails closed;
  - link body (INR, reference, expiry ≥ 15 min, no customer data);
  - webhook positive and negative cases (tampered, wrong secret, missing, stale, non-INR, forged reference, ignored
    events);
  - status;
  - refund idempotency;
  - API errors;
  - end to end through the real routes: place UPI → same-origin hop → Razorpay URL → forged return changes
    nothing → signed webhook confirms → replay is `duplicate` → a bad signature gets 401; and a late webhook covered by
    the return route.

**Changed**
- `PaymentGateway.verifyWebhook(rawBody, headers, now)`: each gateway reads its own signature headers. The demo
  gateway and tests were moved over (`lib/payments/test-helpers.ts`).
- `/api/cron/sweep` runs `reconcilePending` first.
- Privacy Notice (EN + HI) names Razorpay Software Private Limited as the payment processor. Version
  **2026-11-27**; needs lawyer review.
- `docs/backend/go-live.md`: Razorpay setup, secrets, a test-mode checklist (§11); the cron interval is now
  5–15 min.

**Verified**
- `pnpm verify`: typecheck, lint, 380/380 tests (memory + local MongoDB), build.
- `pnpm audit --prod`: clean.

**Not verified**
- Not run against Razorpay's real test environment (needs an account and test keys — owner TODO).
- No browser check of the redirect hop.

## 2026-11-27 — Own backend, phase 6: switch-over (readiness gate, catalogue import, product photos, retention clean-up) (High-risk tier: uploads, production data)

**Threat model:**
- *Assets:* the live catalogue and prices, the public image host, personal data kept past its purpose, production
  configuration.
- *Actors:* staff uploading files; an operator running an import against the wrong database; an attacker probing
  `/api/media`; a deploy with a missing secret or leftover demo data.
- *Abuse cases and the layer that stops each:*
  - script or SVG disguised as a photo → magic-byte sniffing (JPEG/PNG only), served with `nosniff` + `sandbox` CSP;
  - GPS leak → EXIF and text chunks stripped;
  - decompression bomb / thumbnail spam → 600–6000 px from the header, 8 MB cap, 60 uploads per hour per IP;
  - linking a product to a foreign / remote image → only ids of uploaded media are accepted, and there is no URL
    field at all (no SSRF);
  - path tricks on `/api/media` → id regex;
  - an unauthorised upload → staff with `catalog.write` only;
  - bad data through an import → the admin form's exact validation;
  - an import against production by accident → dry run by default, plus `--apply` and `--production` for remote
    databases;
  - demo data going live → `ops:check` blocker, and the import refuses demo SKUs on remote databases;
  - personal data kept too long → retention clean-up (cron);
  - going live with a missing secret, no TLS, mock data or payments, or placeholder legal details → `ops:check`
    blockers.

**Added**
- `lib/ops/readiness.ts` + `pnpm ops:check`: configuration and data checks, never printing secrets; exits 1 on a
  blocker.
- `lib/catalog/import.ts` + `pnpm catalog:import`:
  - plan / apply, upsert by SKU, version-checked;
  - strict category, homepage-rail and collection-rule validation;
  - only `/men/…` links;
  - every run audited;
  - example file `docs/backend/catalog-import.example.json`.
- Product photos:
  - `lib/catalog/media.ts`: intake rules plus a JPEG/PNG size reader;
  - `POST /api/admin/media` and public `GET /api/media/<id>` (immutable, `nosniff`, sandbox CSP);
  - `GarmentArt` renders a real photo through `next/image` when the image has a media URL, else the drawing;
  - product editor: upload, reorder, describe and remove photos (max 8).
- Retention:
  - `lib/db/retention.ts`: one written schedule;
  - `lib/db/stores/maintenance.ts`: SQL + Mongo purge, run by `/api/cron/sweep`, which returns counts only.
- Migrations `2026_11_27_006_switch_over`: `product_media`, plus expiry indexes for the clean-up scans.
- `docs/backend/go-live.md`: decisions, database users and TLS, secrets, deploy order, catalogue load, cron,
  retention table, backups and quarterly restore test, rollback, breach steps.
- `lib/db/switchover-contract.ts`: intake rules with a real PNG; readiness checks per blocker; TLS per engine;
  media round-trip; products referencing only uploaded photos; import dry run / apply / update / all-or-nothing;
  category validation against the new tree; retention purge (idempotent, consent proof kept); an end-to-end flow on
  each DB (staff MFA sign-in → upload (fake and tiny files refused) → product → public API shows the photo → served
  with safe headers → cron needs the secret and returns counts only).

**Changed**
- `ReviewStore.countByIdPrefix` (go-live check for demo reviews).
- The upload guard's size message follows its cap.
- The public-write guard test now also accepts staff-authenticated binary uploads under `/api/admin` (permission
  required).

**Verified**
- `pnpm verify`: typecheck, lint, 372/372 tests (memory + local MongoDB), build.
- `pnpm audit --prod`: clean.
- `pnpm db:migrate` on local `alpha_hood_dev`: 6 migrations.
- `pnpm ops:check` on the local dev environment: reports 14 blockers as expected (not production, demo data, no
  MFA owner, missing secrets and legal details).
- `pnpm catalog:import docs/backend/catalog-import.example.json`: dry run OK, nothing written.

**Not verified**
- MySQL / PostgreSQL (credentials pending).
- The product editor's photo section hasn't been viewed in a browser at 1440 / 390 / 360 px.
- Not done this phase: admin screen for categories and collections (import file instead); payment gateway adapter.

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
