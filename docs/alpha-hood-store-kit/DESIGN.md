# The Alpha Hood — Design Recipe (UI spec)

> **For Claude Code:** this file defines how the store **looks and behaves visually**. `PRD.md` defines **what** to build and the milestones. Read both, plus the references:
> - `reference/01-homepage.png` · `02-category-listing.png` · `03-product-page.png` · `04-checkout.png` · `05-mobile.png`
> - `reference/prototype/*.html` (+ `store.css`, `products.js`, `garments.js`): static prototypes with exact spacing, sizes and copy. The garment drawings and figure illustrations are **placeholders for real product/model photography**. **Reference only**: rebuild with React + Tailwind + shadcn/ui.
> Build **mobile-first**: the same components serve 360 px phones and 1920 px desktops.
>
> **Brand rule:** the layout follows the common bold-streetwear store pattern (like snitch.com) but every brand element (name, logo, colours, photos, copy, programme names) is The Alpha Hood's own. Never use another brand's assets or text.

---

## 0. Quick-start prompt (paste into Claude Code)
```
Read PRD.md, DESIGN.md and everything in ./reference first.
Set up the Next.js (App Router) + TypeScript + Tailwind + shadcn/ui storefront from PRD.md §8 with a mock
commerce adapter, then implement milestones M0 and M1 only: design tokens from DESIGN.md §2, fonts, and every
component in §3 on a /dev/components page, including header, menu drawer, product card, size picker and mini-cart.
Compare with the reference PNGs at 1440px and 390px. Use lucide-react icons. Then stop and summarise.
```

## 1. Brand & personality
- **Name:** The Alpha Hood. **Tagline:** *Built for the ones who lead.*
- **Personality:** bold, confident, urban, a little loud, never cheap. Monochrome with punchy accents, big condensed headlines, and lots of photography.
- **Logo (proposal):** the wordmark **THE ALPHA HOOD** in a condensed heavy typeface (Anton), all caps, letter-spacing +0.2em, plus a **mark**: a black "hood" pentagon (a house/hood shape: a square with a pointed top) with a white **A** inside. Use the mark alone for the favicon, app icon and small spaces, the wordmark + mark in the header, and the wordmark only on tags/packaging. Replace with the final logo when ready (keep the same slot sizes: header height 64 px, mark 28 px).

## 2. Design tokens

### 2.1 Colour
| Token | Hex | Use |
|---|---|---|
| `black` | `#0A0A0A` | announcement bar, primary buttons, footer, dark tiles |
| `ink` | `#111111` | text |
| `ink-2` | `#4A4A4A` | secondary text |
| `muted` | `#8A8A8A` | meta, strike-through MRP |
| `line` | `#E6E6E6` | borders, dividers |
| `line-2` | `#F0F0F0` | inner dividers |
| `white` | `#FFFFFF` | background |
| `soft` | `#F4F4F2` | product image wells, filter chips, info boxes |
| `soft-2` | `#ECECEA` | alternate wells, promo band |
| `accent` (Alpha Red) | `#E4002B` | discount %, sale, badges, section underline, coupon codes, "only 2 left" |
| `accent-tint` | `#FDE8EC` | soft highlights |
| `coupon` | `#FBEDEA` | coupon boxes |
| `volt` (Hood Yellow) | `#F4E04D` | campaign headlines on dark, Alpha Club, gift cards |
| `green` | `#1F8A4C` | delivery dates, savings, success |
| `green-tint` | `#EDF7F0` | "you save" boxes |

**Rules:** the UI is 90% black/white/grey and the photos bring the colour. Red is only for price/discount/sale/urgency and the section underline. Yellow is only on dark backgrounds (campaign headlines, Alpha Club) or as a tile background. Do not use gradients in the UI (photos may have them). Corners are **square** (radius 0) for buttons, inputs, cards, chips and images, except avatars, the toggle, UPI app icons and the phone-style elements.

### 2.2 Typography
- **Display:** **Anton** (Google Fonts), uppercase, letter-spacing +0.5 px. Used for the hero, section titles, tile titles and big prices in promos. A thin-over-bold pairing for section titles: a first line in **Inter 300 uppercase** ("SHOP BY") over a second line in **Anton** ("CATEGORY"), followed by a 3 px red underline 200 px wide.
- **UI/body:** **Inter** 400/500/600/700. Labels and buttons are uppercase with letter-spacing 0.12–0.16em.
- Load via `next/font/google` with `display: swap`; subset Latin.

| Style | Desktop | Mobile | Spec |
|---|---|---|---|
| `hero` | 148/0.86 | 62/0.86 | Anton, uppercase, volt or white |
| `section` | 40/1 | 26/1 | Anton uppercase (with an optional Inter 300 lead line at 34/26) |
| `tile-title` | 54/0.88 | 30/0.9 | Anton, white over photo |
| `promo` | 76–78/0.88 | 40/0.9 | Anton |
| `pdp-title` | 21/1.3 | 16/1.35 | Inter 400 |
| `price` | 24 (PDP), 13.5 (card) | 19 / 12.5 | Inter 700; MRP Inter 400 muted strike; off % Inter 700 red |
| `body` | 14/1.7 | 13.5/1.6 | Inter 400 ink-2 |
| `label` | 12–13 | 11–12 | Inter 600–700 uppercase, letter-spacing 0.12em |
| `button` | 13–14 | 12–13 | Inter 700 uppercase, letter-spacing 0.12em |
| `announcement` | 11.5 | 10 | Inter 500 uppercase, letter-spacing 0.12em |

### 2.3 Spacing & layout
- 4 px base. Page gutter: 40 px (desktop), 16 px (mobile), 10 px for mobile product grids.
- Max content width: full-bleed for heroes/tiles; 1360 px for grids at 1440 px screens (40 px gutters); checkout 1280 px.
- Grid gaps: product grid 18 px horizontal / 26–30 px vertical (desktop), 8 px / 16 px (mobile). Collection tiles 4 px gap (edge-to-edge feel).
- Section spacing: 64–72 px (desktop), 32–40 px (mobile).
- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`.
- Motion: 200–300 ms ease-out; image hover zoom 1.04 over 400 ms; drawers slide 280 ms; respect `prefers-reduced-motion`.

### 2.4 Tailwind tokens
Add the colours above as `black, ink, ink-2, muted, line, line-2, soft, soft-2, accent, accent-tint, coupon, volt, green, green-tint`; `fontFamily.display = Anton`, `fontFamily.sans = Inter`; `borderRadius.DEFAULT = 0`. Map shadcn: `--primary: black`, `--primary-foreground: white`, `--destructive: accent`, `--border: line`, `--radius: 0`.

## 3. Components
| Component | Spec |
|---|---|
| **AnnouncementBar** | 34 px black bar, centred messages separated by grey dots (desktop shows all; mobile rotates one at a time every 4 s, with a fade). Bold part in white 700. |
| **Header** | 64 px, white, bottom border line. Grid `1fr auto 1fr`: left = menu icon + MENU / NEW IN / BESTSELLERS / SALE (red) links in label style (desktop; mobile = only the menu icon); centre = logo; right = search, store locator (P2), wishlist, account, bag with a black count bubble. Sticky; on scroll down it hides the announcement bar. |
| **MenuDrawer** | Mobile full screen / desktop left drawer 420 px (or a mega menu on hover of MENU): tabs SHOP / COLLECTIONS (active underline 2 px), two image promo tiles (Anton title over the photo), a 2-column uppercase category list with thin dividers, badges (red `NEW`, red price badge `₹999`, black `3XL–5XL`), SALE in red, and bottom tiles (Gift cards on yellow, Alpha Club on black). |
| **Button** | Square; 48 px (lg 54, sm 36); primary = black bg + white text; outline = white bg + 1.5 px black border; on-dark = white bg + black text; volt variant for Alpha Club. Uppercase label 700. Full width on mobile in forms. Loading and disabled states. |
| **ProductCard** | See PRD CARD-01. Image well `soft` 3:4 (square corners); top-left badge (white bg / red bg for BESTSELLER & discounts) in 9.5 px 700 uppercase; top-right heart (no bg); bottom-left rating chip (white, "4.6 ★") when ≥ 3 reviews; under the image: name 13 px (1 line), price row (price 700, MRP strike muted, % off red), swatches (11 px squares) and a "+" quick add at the bottom-right. Hover (desktop): swap to the 2nd image and show "Quick add" sizes on the image bottom. |
| **CategoryRail item** | Label on top (uppercase 600, 14 px), cut-out product image below on white (no box). |
| **CollectionTile** | Full-height photo, bottom gradient to 55% black, big Anton title bottom-left, small uppercase tagline bottom-right. |
| **OfferTile** | Grey `soft-2` (or black) tile 300 px tall, product cut-out left, Anton text right-aligned at the bottom with the price in red. |
| **PromoBand** | Grey full-width band: Anton text left (right-aligned) · model image centre · Anton offer right with the % in red. |
| **SectionHeader** | Optional Inter 300 lead line + Anton title + optional red underline; right side "VIEW ALL" underlined link. |
| **Tabs (category)** | Uppercase 13 px; active = black 700 with a 2 px black underline; bottom border line. Horizontally scrollable on mobile. |
| **FilterSidebar** | Sections with an uppercase 700 header and a +/− toggle; size grid (4 cols, square buttons, selected = black fill); checkbox list with counts; colour circles with labels (selected ring); price range slider (black track, white knobs); applied chips with ✕ and "Clear all". Mobile: bottom sheet with a left category list and a right values pane, sticky "Clear / Apply (n results)". |
| **SortMenu** | Dropdown 240 px with options and a check on the active one. Mobile: bottom sheet. |
| **SizePicker** | Square buttons min 56×46; selected = 2 px black border + bold; out of stock = grey with a diagonal strike; low stock = a red "2 left" caption under the button. "SIZE GUIDE" link with a ruler icon. |
| **ColourPicker** | Image thumbnails 62×80; selected = 2 px black outline offset 2. Label "COLOUR · Slate Grey". |
| **CouponBox** | `coupon` bg; dashed red code chip with a ticket icon; description; "COPY" link in red. |
| **DeliveryCheck** | Pincode input with a "CHANGE/CHECK" red text button; result lines with check icons (date in green). |
| **Accordion** | Uppercase 700 13 px title rows with +/−, line dividers; content 14 px/1.7. |
| **ReviewSummary** | Big Anton rating, bars (black on light grey), fit meter (a dot on a track: runs small / true to size / runs large), "WRITE A REVIEW" outline button; review cards with a black rating chip, title, a "Verified buyer" green badge, text, photos (64×80), and the size/fit/date meta. |
| **MiniCart drawer** | Right drawer 420 px: header "YOUR BAG (n)", free-shipping progress (green), line items, an upsell row, subtotal, and VIEW BAG (outline) + CHECKOUT (black) buttons. |
| **Checkout blocks** | White boxes with a 1 px line border on `#F7F7F5` page bg; numbered black circles; selectable cards (address, delivery speed) with a 2 px black border when selected; payment = a left method list (active has a 3 px black left border, UPI shows "EXTRA 5% OFF" in green) + a right panel (UPI app tiles, UPI ID input with VERIFY, savings note in green, black "PAY ₹X SECURELY" button with a lock icon). |
| **OrderSummary** | Sticky card: items (72×92 thumb), coupon applied chip (dashed red), Hood Coins toggle, breakdown rows (discounts in green), "To pay" total with a 1 px black rule, green "You're saving ₹X" box, trust row. |
| **Toast** | Black bar bottom-centre (mobile: above the tab bar), white text, product thumb + "Added to bag · VIEW BAG". |
| **Badges** | `NEW` (white or black), `BESTSELLER` (red), `-30%` (red), `ONLY 2 LEFT` (red text), `SOLD OUT` (grey). |
| **MobileTabBar** | 78 px incl. safe area: Home, Shop, New, Wishlist, Account; uppercase 9.5 px labels; active black, inactive muted. |
| **Skeletons** | `soft` blocks with a subtle shimmer at 1.2 s, square corners. |

## 4. Screens

### 4.1 Homepage — `reference/01-homepage.png`
Order and behaviour as in PRD §6.2:
- **Hero** 640 px desktop / 330 px mobile (actual image ratio 16:7 desktop, 4:5 mobile); dark campaign photo, a small uppercase kicker ("WINTER DROP · 2026"), the giant Anton headline in volt, a subline, a white CTA with an arrow, round translucent arrows at the sides, and progress dashes at the bottom centre.
- **Shop by category** (6 visible on desktop, scroll on mobile with circular image crops 72 px).
- **Promo band** 300 px.
- **Collection tiles** 3 × 620 px, 4 px gaps, edge to edge.
- **Offer tiles** 4 × 300 px with 18 px gaps.
- **Trending** with tabs and a 4-col grid (2-col mobile).
- **Shop the look** (grey panel: model image with numbered white hotspots + item list with ADD buttons + a black full-width "ADD FULL LOOK · ₹X · SAVE 10%").
- **New arrivals**, **Alpha Club** black band (yellow accent, 4 perk boxes with yellow icons), **#WearTheHood** 6-up square UGC grid, **trust strip** (4 cells, icons 28 px), **SEO block** (pipe-separated links), **footer** (black).

### 4.2 Category listing — `reference/02-category-listing.png`
Breadcrumb → Anton H1 + muted count → sub-category image rail (92×104, selected outlined) → filter bar (black "FILTERS (n)" chip + quick filter chips + "Sort by" + grid density toggle) → left FilterSidebar 264 px + a 3-col grid (or 4-col without the sidebar) → merchandising tile in the grid (black Alpha Club tile) → progress + "LOAD MORE". Mobile: sticky bottom bar "SORT | FILTER (3)", 2-col grid.

### 4.3 Product page — `reference/03-product-page.png`
Desktop: gallery (left, about 60%: one tall image then a 2-col grid incl. the video tile) + sticky info column 520 px (right). Info order: title → price row → tax note → rating → coupon box → colour → size + size guide → fit note → delivery promise bar (`soft`) → ADD TO BAG + wishlist square → BUY NOW outline → Ask Alpha card + suggestion pills → accordions. Below: Complete the look (4 cards, price only), Ratings & reviews, You may also like, and a sticky bottom add-to-bag bar on scroll. Mobile: full-width swipe gallery (470 px) with heart/share buttons, info stacked, and a fixed bottom bar (wishlist square + ADD TO BAG).

### 4.4 Checkout — `reference/04-checkout.png`
Distraction-free header (logo, step indicator "✓ BAG — ADDRESS & PAYMENT — CONFIRMATION", "100% secure checkout"). Two columns: left blocks (1 Contact – done state with green check; 2 Delivery address cards + add new + delivery speed; 3 Payment) and the right sticky order summary 440 px. Mobile: single column; the summary collapses to a "Show order summary ₹X ▾" bar at the top; the pay button is fixed at the bottom.

### 4.5 Mobile — `reference/05-mobile.png`
Screens: Home (rotating announcement, compact header, hero, round category rail, trending 2-col, tab bar) · Menu drawer · PDP (gallery, info, sizes, coupon line, fixed bottom bar) · Bag (free-shipping progress, line items with Size/Qty selectors and delivery date, "add for ₹X more" upsell row, a fixed bottom total + CHECKOUT).

## 5. Photography & imagery rules (critical for the final look)
- **Product (PLP/cards):** on-model 3:4 photos on a light grey seamless background (#EFEFED), consistent framing (head cropped at the eyes or full body, same scale per category), plus flat-lay/ghost-mannequin shots for the 2nd image. Minimum 1600×2133 px, WebP/AVIF via the CDN.
- **PDP:** 6–8 images per colour: front, back, side, detail (fabric, buttons, label), a full look, and a 10–15 s on-model video.
- **Campaign/hero:** urban street locations, strong light, editorial poses, space on the left for the headline (desktop) and on top (mobile). Provide separate desktop (16:7) and mobile (4:5) crops.
- **Category cut-outs:** products on transparent/white backgrounds, centred and the same scale.
- Use only photos you own or have licensed. AI-generated images may be used for mood/backgrounds and are **never** passed off as real product photos (see GRAPHICS_PROMPTS.md).

## 6. Content & formatting
- Prices: `₹1,299` (Indian grouping), MRP strike `₹1,799`, `28% OFF` (rounded down). Show "MRP inclusive of all taxes".
- Product naming: `[Fit/feature] [Product] — [Colour]` ("Washed Baggy Jeans — Ice Blue").
- Tone: short, bold, confident, a little cheeky ("Own the cold", "The weekend uniform"); avoid fake urgency (only real stock counts and real sale end times).
- Sizes: XS–3XL for tops; 28–40 waist for bottoms; UK 6–11 for shoes.

## 7. Accessibility
Square-corner buttons still need a visible focus (2 px black outline + 2 px offset on white; white outline on dark). Text on photos needs a gradient or overlay for ≥ 4.5:1 contrast. Carousels have pause/next controls and are swipe- and keyboard-accessible. Colour swatches have text labels/tooltips. Sizes are buttons with `aria-pressed`; out-of-stock sizes have `aria-disabled` and "Sold out" in their label.

## 8. Design acceptance
- [ ] `/dev/components` shows every §3 component.
- [ ] Home, PLP, PDP and Checkout match the references at 1440 px; mobile screens match at 390 px; no horizontal scroll at 360 px.
- [ ] Square corners, monochrome UI, red only for price/sale/urgency, yellow only on dark/club tiles.
- [ ] Anton headlines + Inter UI everywhere; tabular price alignment in the cart/summary.
- [ ] Placeholders replaced by real photography before launch.
