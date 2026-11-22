# PRD — The Alpha Hood: D2C men's fashion e-commerce store

| | |
|---|---|
| **Product** | theAlphaHood online store: website (desktop + mobile web/PWA), admin, later native apps |
| **Document** | Product Requirements Document v1.0 · 21 Nov 2026 |
| **Companion docs** | `DESIGN.md` (UI spec) · `FEATURE_LIST.md` · `GRAPHICS_PROMPTS.md` · `reference/` (screens + HTML prototypes) |
| **Owner** | _[Your name]_ |

> **For Claude Code:** this PRD defines **what** to build and **in which order**; `DESIGN.md` defines **how it looks**. Visual questions → DESIGN.md wins; behaviour/scope/data → this PRD wins. Build milestone by milestone (§12). Requirement IDs (e.g. `PDP-07`) must be referenced in commits and tests.

---

## 0. Reference analysis: snitch.com (Nov 2026)

The store follows the **UX patterns** of snitch.com, a leading Indian D2C menswear brand: its layout, shopping flow and feature set. It does **not** copy Snitch's brand. We do not use their logo, name, photos, product names, marketing copy, the "SID" assistant name or the "SNITCH X" programme name. Every asset, word and photo is The Alpha Hood's own.

**What Snitch does (observed):**
- **Header:** hamburger "Menu" (full-screen category grid with NEW/price badges), centred spaced-out wordmark, and icons for search, bag, wishlist and account. Links to "New" and "Stores".
- **Homepage, in order:** full-bleed hero campaign carousel with bold condensed headline · "SHOP BY / CATEGORY" rail with cut-out product images and an accent underline · full-width promo band ("Last few bestsellers left / up to 30% off") · 3 tall collection tiles with overlay titles and taglines · 4 offer/combo tiles (e.g. "2 bottom wear ₹2899", "Sunglasses ₹999", "3 top wear ₹2699") · "TRENDING" product grid with category tabs · a long SEO block (top categories, popular searches, popular accessories, a brand story) · footer (company links, app download, stores).
- **Product card:** 3:4 image, wishlist heart, name, price only (₹1199), "+" quick add, small colour swatches/"+N" more colours.
- **Product page:** image gallery on the left; right side has name, price, "MRP inclusive of all taxes", rating & review count, a coupon box ("SHOP10 · 10% off above ₹5999"), selected colour + colour thumbnails, size buttons (XS–XXL) + size guide, "Free 1–2 day delivery on 5k+ pincodes", **ADD TO BAG**, a pincode delivery check, and accordions (Description & fit, Wash care, Specification, SKU, Reviews with product + category tabs, Returns policy). An **AI style assistant** offers suggested questions (material, fit, pairings, footwear, how to style).
- **Policies seen:** free first return, a small return fee after that, a 7-day window (30 days for members), exchanges subject to size availability, no returns on promo items/innerwear/accessories, COD refunds to wallet/UPI, and damaged items to be reported within 24h.
- **Other:** Android/iOS apps, stores + omnichannel (click & collect), gift cards, a creator programme, a membership programme, a plus-size line, a premium line, "price drop", and an online-only "NORETURN" coupon (cheaper price without returns).

**The Alpha Hood = this pattern + improvements:** UPI-first fast checkout, verified COD with RTO controls, exchange-first returns with instant store credit, a Shop-the-Look bundle discount, the Alpha Club loyalty programme, a fit-confidence engine ("fits true to size", size recommendation), complete the look and cart upsells, back-in-stock alerts, WhatsApp order updates, UGC #WearTheHood, gift cards, referrals, and an AI stylist ("Ask Alpha").

---

## 1. Summary
The Alpha Hood is a mobile-first D2C store for men's streetwear and everyday wear (tees, shirts, jeans, cargos, hoodies, jackets, sneakers, accessories), selling in India in INR. Goals: a premium, fast, bold-looking store; frictionless checkout (UPI, cards, COD); low returns/RTO; and repeat customers through loyalty.

## 2. Goals & metrics (first 12 months)
| Goal | Metric | Target |
|---|---|---|
| Conversion | Sessions → orders | ≥ 2.0% (mobile ≥ 1.6%) |
| Checkout | Checkout start → paid | ≥ 55% |
| Speed | Mobile LCP p75 / INP p75 | < 2.0 s / < 200 ms |
| AOV | Average order value | ≥ ₹1,800 (bundles, upsells) |
| Prepaid share | Prepaid / all orders | ≥ 60% |
| RTO | Return-to-origin rate on COD | ≤ 15% |
| Returns | Return rate (by units) | ≤ 12%; ≥ 40% of returns converted to exchange/store credit |
| Repeat | 90-day repeat purchase | ≥ 25% |
| CX | Ticket first response | < 2 h (business hours) |

**Non-goals for v1:** marketplace sellers, international shipping, offline POS integration, native apps (phase 3), custom tailoring.

## 3. Users & roles
- **Shoppers:** Gen-Z/millennial men aged 18–35 in metros and tier-2/3 cities, mostly on Android over 4G, price-conscious and trend-driven, shopping from Instagram ads.
- **Admin roles:** Owner, Store manager (catalog, orders, promotions), Catalog editor, Customer support (orders, returns, refunds up to a limit), Warehouse/fulfilment (pick/pack/ship), Marketing (CMS, banners, coupons, campaigns), Finance (payouts, GST reports). RBAC is enforced server-side, with an audit log.

## 4. Platform decision (choose before M0)
| Option | What | Pros | Cons |
|---|---|---|---|
| **A. Headless Shopify (recommended for launch)** | Next.js storefront (this design) + Shopify for products, inventory, checkout, orders and admin; Indian apps for COD/one-click checkout, shipping and reviews | Fastest to launch, reliable checkout, huge app ecosystem, staff-friendly admin | Monthly fees, checkout customisation limited to Shopify's APIs, app costs |
| **B. Open-source commerce (Medusa v2)** | Next.js storefront + Medusa backend (Postgres) + custom admin extensions | Full control and ownership, no per-order platform fee | More engineering: payments, tax, returns and admin need building and hosting |

Requirements below are platform-neutral. The storefront talks to commerce through `lib/commerce/*` adapters (`getProduct`, `getCollection`, `cart.*`, `checkout.*`, `customer.*`), so the backend can be swapped. Where an item is "provided by platform/app" under Option A, it must be built under Option B.

## 5. Scope by phase
| Phase | Includes |
|---|---|
| **P0 — Launch** | Storefront (home, menu, category/PLP with filters, search, PDP, bag, checkout, order confirmation), accounts (OTP login), wishlist, orders & tracking, returns/exchanges request, coupons & combos, COD + prepaid, pincode serviceability, GST invoice, CMS for homepage/banners, SEO, analytics, admin basics, legal pages |
| **P1 — Growth** | Alpha Club loyalty & Hood Coins, referrals, gift cards, store credit wallet, reviews with photos, back-in-stock & price-drop alerts, Shop the Look, complete-the-look & cart upsells, size recommendation, WhatsApp notifications, abandoned-cart flows, UGC gallery, PWA (installable, push), blog/lookbook |
| **P2 — Differentiation** | Ask Alpha AI stylist, visual search, personalised home feed, 360°/video on PDP, NORETURN-style "final sale" pricing, B2B/bulk orders, store locator + click & collect (if stores open), Android/iOS apps |

---

## 6. Functional requirements: storefront

### 6.1 Global — `GLB`
- **GLB-01 [P0]** Announcement bar (black): up to 4 rotating messages from the CMS (offer, free shipping threshold, returns, COD), each optionally linked; dismissible on mobile.
- **GLB-02 [P0]** Header: hamburger + "Menu", "New In", "Bestsellers" and "Sale" (desktop) on the left; centred logo; search, store locator [P2], wishlist, account and bag with count on the right. Sticky; shrinks on scroll. Mobile: hamburger, logo, search, bag.
- **GLB-03 [P0]** Menu drawer/mega menu (see `reference/05-mobile.png`, screen 02): tabs *Shop* and *Collections*; 2 promo tiles; a 2-column category list with badges (NEW, price badges like "₹999", "3XL–5XL", "SALE" in red); bottom tiles (Gift cards, Alpha Club). All of it is managed in the CMS.
- **GLB-04 [P0]** Mobile bottom tab bar: Home, Shop, New, Wishlist, Account.
- **GLB-05 [P0]** Footer: brand blurb, app links [P2], Shop/Help/Company link columns, newsletter (email or WhatsApp number with consent), social links, payment badges, legal links.
- **GLB-06 [P0]** Mini-cart drawer opens on add-to-bag: items, free-shipping progress bar, upsell row, subtotal, "View bag" and "Checkout".
- **GLB-07 [P0]** Toasts for add to bag/wishlist; skeleton loaders; graceful error and empty states.
- **GLB-08 [P1]** Floating "Ask Alpha" button (AI stylist) on PLP/PDP [P2 for AI; P1 shows a WhatsApp support button instead].

### 6.2 Homepage — `HOME` (see `reference/01-homepage.png`)
Every section is a CMS block (orderable, schedulable with start/end time, targetable by device). Default order:
1. **HOME-01** Hero carousel: 3–6 slides (desktop 16:7 and mobile 4:5 images, headline, subline, CTA, link, text colour), with autoplay 6 s, pause on hover, arrows, progress dots, swipe, and the first slide prioritised for LCP.
2. **HOME-02** "Shop by Category" rail: 6–12 categories with a cut-out product image and a label; horizontal scroll; "Shop all".
3. **HOME-03** Full-width promo band (left text, centre image, right offer).
4. **HOME-04** 3 collection tiles (tall image, big overlay title, small tagline).
5. **HOME-05** 4 offer/combo tiles (e.g. "Any 2 bottoms ₹2,999"), each linking to a combo-eligible collection (PROMO-04).
6. **HOME-06** "Trending" product grid with category tabs (All, Shirts, Jackets…), 8 products per tab, and "View all". Tabs load without a page reload.
7. **HOME-07 [P1]** Shop the Look: model image with numbered hotspots + item list + "Add full look · save 10%".
8. **HOME-08** New arrivals grid.
9. **HOME-09 [P1]** Alpha Club promo band.
10. **HOME-10 [P1]** #WearTheHood UGC grid (curated Instagram/customer photos with tagged products).
11. **HOME-11** Trust strip (free shipping threshold, COD, returns, secure payments; only claims that are true).
12. **HOME-12** SEO block: top categories, popular searches (from the CMS) and a short brand text (collapsible on mobile).

### 6.3 Category / listing pages (PLP) — `PLP` (see `reference/02-category-listing.png`)
- **PLP-01 [P0]** URL structure `/men/shirts`, `/men/jeans/baggy`, `/collections/winter-drop`; breadcrumbs; H1 + style count; sub-category image rail.
- **PLP-02 [P0]** Filters: size, fit, colour (swatches), price range slider, fabric, sleeve, pattern, occasion, discount %, and availability (hide out of stock). Shown as a left sidebar on desktop and a bottom-sheet filter on mobile, with counts per value. Applied filters appear as removable chips. "Clear all". Filters are kept in the URL (shareable, SEO-safe with `noindex` for multi-filter combos).
- **PLP-03 [P0]** Sort: popularity (default, weighted by sales and views), new arrivals, price low→high, price high→low, discount, rating.
- **PLP-04 [P0]** Grid: 3 columns with sidebar (desktop), 4 columns full width (toggle), 2 columns on mobile. Infinite scroll on mobile with "Load more" fallback and a progress indicator ("Showing 30 of 248"). Restore scroll position on back.
- **PLP-05 [P0]** Product card (§6.4) and merchandising tiles inserted into the grid from the CMS (e.g. Alpha Club tile).
- **PLP-06 [P0]** Empty results: suggest removing filters, plus bestsellers.
- **PLP-07 [P1]** Merchandising rules in admin: pin/bury products per collection, auto-collections by tag/price/stock.

### 6.4 Product card — `CARD`
- **CARD-01 [P0]** 3:4 image (second image shown on hover on desktop), badges (NEW, BESTSELLER, −30%, "Only 2 left"), wishlist heart, rating chip (when ≥ 3 reviews), name (1 line, ellipsis), price + MRP strike-through + % off, colour swatches (max 4 + "+N"), and a "+" quick-add that opens a size picker sheet.
- **CARD-02 [P0]** Out-of-stock cards show "Sold out" and "Notify me" [P1]; they are pushed to the end of the list by default.

### 6.5 Search — `SRCH`
- **SRCH-01 [P0]** Full-screen search overlay: recent searches, trending searches (CMS), and instant results (products with image/price + matching categories) as you type (debounced 150 ms).
- **SRCH-02 [P0]** Typo tolerance, synonyms ("tshirt" = "t-shirt" = "tee", "pant" = "trouser"), Hinglish terms ("kurta", "lower"), and filters on the results page. Engine: Algolia/Typesense/Meilisearch, or the platform search for Option A.
- **SRCH-03 [P2]** Visual search (upload a photo → similar products).

### 6.6 Product page (PDP) — `PDP` (see `reference/03-product-page.png`)
- **PDP-01 [P0]** Gallery: desktop shows 1 large + a 2-column grid of images and a video tile; click to open a zoom/lightbox. Mobile shows a swipe carousel with dots and pinch-zoom. 6–8 images per colour plus optional video [P1] and 360° [P2]. Images switch when the colour changes.
- **PDP-02 [P0]** Info: name, price, MRP (strike) + % off, "MRP inclusive of all taxes", rating summary (links to reviews), and the best coupon box with a copy button.
- **PDP-03 [P0]** Colour selector (thumbnails, each colour is a separate URL/variant group) and size selector (XS–3XL / waist 28–40). Sold-out sizes are struck through; low stock shows "2 left". Size guide modal with measurement tables (cm/in), a "how to measure" illustration, and model info.
- **PDP-04 [P1]** Fit confidence: "Fits true to size · Model is 6'0" wearing M · 78% say it fits as expected" (from reviews' fit votes); size recommendation from the customer's past purchases/returns or a quick height-weight-fit quiz.
- **PDP-05 [P0]** Delivery promise: auto-detect the pincode (saved/IP/geolocation with consent) or enter it. Shows the estimated delivery date, COD availability and fee, and express availability (from the shipping partner API, cached).
- **PDP-06 [P0]** CTAs: **ADD TO BAG** (primary, black) + wishlist; **BUY NOW** (goes straight to checkout). On mobile a sticky bottom bar with wishlist + Add to bag; on desktop a sticky bar appears after scrolling past the CTA.
- **PDP-07 [P0]** Accordions: Delivery & returns, Description & fit, Specifications (fit, fabric, collar, sleeve, pattern, wash care, SKU), and **Manufacturer details** (manufacturer/packer/importer name and address, country of origin, net quantity, MRP; required for legal compliance in India).
- **PDP-08 [P0]** Reviews section: average rating, distribution bars, fit meter, reviews with photos, filters (rating, with photos, size), "verified buyer" badge, helpful votes, and "Write a review" (verified purchasers only, after delivery). Category-level reviews fallback when a product has none.
- **PDP-09 [P1]** Complete the look (curated or rule-based outfit items with quick add), You may also like (similar), and Recently viewed.
- **PDP-10 [P1]** Back-in-stock / "notify me" per size (email/WhatsApp/push), and price-drop alerts for wishlisted items.
- **PDP-11 [P2]** **Ask Alpha** AI stylist: chat panel with suggested prompts (What fabric is this? Bottoms to pair? Shoes to match? How to style? Similar styles), grounded in the product data and catalogue, that returns product cards with add-to-bag. It never invents product facts; when unsure it says so.
- **PDP-12 [P0]** Share (native share / WhatsApp / copy link) and structured data (Product, Offer, AggregateRating, BreadcrumbList).

### 6.7 Bag (cart) — `CART` (see `reference/05-mobile.png`, screen 04)
- **CART-01 [P0]** Items with image, name, colour, size dropdown (change in place), qty (max 5 per SKU), price/MRP, delivery estimate, remove / move to wishlist.
- **CART-02 [P0]** Free-shipping progress bar ("Add ₹X more for free shipping"), the coupon field + "View all offers" (eligible coupons listed with savings), and a price breakdown (MRP, discount, coupon, shipping, COD fee if any, total, "You save ₹X").
- **CART-03 [P1]** Upsell row ("Add for ₹999 more & get 15% off" or accessories under ₹999), combo progress ("Add 1 more tee to get 3 for ₹1,999").
- **CART-04 [P0]** Cart persistence: a guest cart in a cookie (30 days), merged on login.
- **CART-05 [P0]** Stock and price re-validated on bag open and at checkout; changed items are flagged.

### 6.8 Checkout — `CHK` (see `reference/04-checkout.png`)
- **CHK-01 [P0]** One-page checkout with steps Contact → Address → Payment, then Confirmation. Mobile-first, autofill-friendly, no account required (OTP-verified phone required for COD).
- **CHK-02 [P0]** Contact: phone with OTP (saves a customer account) + optional email.
- **CHK-03 [P0]** Address: saved addresses (Home/Work); new address form with pincode-first entry (auto-fill city/state), validation, landmark, and a serviceability check. Delivery speed options (Standard free / Express paid where available).
- **CHK-04 [P0]** Payment: **UPI first** (GPay/PhonePe/Paytm intent on mobile, QR on desktop, UPI ID collect), cards, netbanking, wallets, EMI/BNPL [P1], and **COD** (with a fee, a max order value and eligibility rules, CHK-07). Prepaid incentives (e.g. extra 5% off on UPI) are configurable.
- **CHK-05 [P0]** Order summary (sticky on desktop): items, applied coupon, Hood Coins toggle [P1], gift card/store credit [P1], full breakdown, savings, and trust badges.
- **CHK-06 [P0]** Payment gateway: Razorpay/Cashfree/PayU (or the platform checkout). Webhooks are idempotent; failed payments get a retry and the cart is kept; reconciliation catches "paid but not confirmed" orders.
- **CHK-07 [P0]** **COD risk controls:** OTP-verified phone, an address quality score, pincode RTO history, a customer RTO history, max COD value (e.g. ₹5,000), and COD blocked for flagged customers. A WhatsApp/IVR confirmation for high-risk COD orders before shipping [P1]. Offer "Pay online & save ₹X" nudges.
- **CHK-08 [P1]** Optional one-click checkout provider (GoKwik / Razorpay Magic / Shiprocket checkout) behind a feature flag.
- **CHK-09 [P0]** Confirmation page: order number, items, delivery date, payment status, "Track order", an invite to create a password/download the app, and the purchase event fired once.
- **CHK-10 [P0]** GST: prices are tax-inclusive. The tax is computed per line by HSN and price slab (configurable rate table; apparel GST rates depend on the sale price per piece, so **confirm the current rates with your CA**). CGST/SGST vs IGST is decided by the warehouse state vs the ship-to state. The invoice is generated at dispatch (GLB invoice PDF).

### 6.9 Account — `ACC`
- **ACC-01 [P0]** Login/sign-up by phone OTP (primary), email OTP or Google; no passwords required.
- **ACC-02 [P0]** Profile, saved addresses, orders (list + detail with status timeline, invoice download, cancel before dispatch, return/exchange request), wishlist, notifications preferences, logout, delete account (DPDP).
- **ACC-03 [P1]** Alpha Club dashboard: tier, Hood Coins balance & history, perks, referral link, gift cards, store credit wallet.
- **ACC-04 [P1]** "My sizes" (saved size profile) used for recommendations.

### 6.10 Orders, tracking & notifications — `ORD`
- **ORD-01 [P0]** Order statuses: Placed → Confirmed → Packed → Shipped → Out for delivery → Delivered, plus Cancelled, RTO and Returned. Status timeline on the order page; tracking via the courier partner (Shiprocket/Delhivery/etc.) with AWB and link.
- **ORD-02 [P0]** Notifications by email + SMS; **WhatsApp** [P1] for order placed, shipped (with tracking), out for delivery, delivered (+ review request after 3 days), return/refund updates, and abandoned cart (with consent).
- **ORD-03 [P0]** Public "Track order" page (order number + phone OTP).
- **ORD-04 [P0]** Cancellation by the customer until the order is packed; prepaid refunds automatic to the source.

### 6.11 Returns & exchanges — `RET`
- **RET-01 [P0]** Self-serve return/exchange request within the window (default 7 days from delivery; Alpha Club 30 days [P1]): choose items, reason (size too small/large, didn't like, damaged, wrong item…), photos for damaged/wrong items (report within 24 h of delivery), and pickup address/slot.
- **RET-02 [P0]** **Exchange-first:** offer a size exchange (if in stock) or instant store credit (+ a small bonus, e.g. +5%) before a refund to the source.
- **RET-03 [P0]** Rules engine (configurable): non-returnable categories (innerwear, accessories, perfumes, sunglasses for hygiene), final-sale/BOGO items excluded, a return fee after the first free return, and COD refunds to a UPI ID or store credit.
- **RET-04 [P0]** Reverse pickup booking with the courier, quality-check status, and refund/store credit issued after QC (or instantly for trusted customers [P1]).
- **RET-05 [P1]** Return analytics by reason/product/size, fed back into size guidance.

### 6.12 Promotions & pricing — `PROMO`
- **PROMO-01 [P0]** Coupons: % or flat, minimum cart value, max discount, first order only, per-customer limits, validity dates, applicable collections/products, exclusions, prepaid-only, and auto-apply the best coupon option.
- **PROMO-02 [P0]** Automatic discounts: sale prices (MRP vs selling price), category sales, and a "price drop" collection.
- **PROMO-03 [P0]** Prepaid offers (extra % off on UPI/cards), with a limit.
- **PROMO-04 [P0]** **Combos/bundles:** "Any 2 bottoms ₹2,999", "3 tees ₹1,999", "2 hoodies ₹2,499" (mix & match within a collection, priced as a bundle, discount split across lines for GST/returns).
- **PROMO-05 [P1]** Shop the Look bundle discount (all items of a look −10%).
- **PROMO-06 [P1]** Gift cards (digital, ₹500–₹10,000, redeemable partially, with expiry per law) and store credit wallet.
- **PROMO-07 [P2]** Final-sale pricing (cheaper, no returns, exchanges for size only), clearly disclosed before purchase.

### 6.13 Loyalty, referral & engagement — `LOY` [P1]
- **LOY-01** **Alpha Club** (free to join): earn Hood Coins (e.g. 5% of the paid amount, credited after the return window), redeem up to X% of an order, early access to drops, a birthday reward, extended returns (30 days), and tiers by annual spend (Member / Elite / Legend) with increasing perks. Optionally a paid tier [P2].
- **LOY-02** Referral: the friend gets ₹200 off the first order and the referrer gets ₹200 Hood Coins after the friend's return window. Fraud checks (same device/phone/address).
- **LOY-03** Reviews with photos earn coins; UGC submissions (#WearTheHood) with moderation.
- **LOY-04** Back-in-stock, price-drop and wishlist reminders; abandoned cart (1 h, 24 h) and browse-abandonment flows via email/WhatsApp/push with frequency caps.

### 6.14 Content & SEO — `CMS`
- **CMS-01 [P0]** Headless CMS (Sanity/Contentful/Strapi, or Shopify metaobjects in Option A) for homepage blocks, banners, menus, announcement bar, collection banners, size guides, policies, FAQs, lookbooks/blog [P1], and SEO text blocks.
- **CMS-02 [P0]** Scheduling (start/end) and preview before publishing; device targeting (desktop/mobile images).
- **CMS-03 [P0]** SEO: clean URLs, unique titles/descriptions, canonical tags, XML sitemaps (products, collections, pages), robots, structured data (Product, Offer, AggregateRating, BreadcrumbList, Organization, WebSite SearchAction), Open Graph images, `noindex` for filtered/sorted URLs, 301 redirects manager, and fast pages.
- **CMS-04 [P0]** Legal & policy pages: About, Contact, Shipping, Returns & exchange, Cancellation, Privacy, Terms, Cookie, Grievance officer, FAQ.

### 6.15 Admin & operations — `ADM`
(Option A uses the Shopify admin + apps for most of this; Option B builds it.)
- **ADM-01 [P0]** Catalog: products with variants (colour × size), SKUs, barcodes, MRP, selling price, cost, HSN, GST slab, weight/dimensions, images per colour (with alt text), size chart assignment, attributes for filters (fit, fabric, sleeve, pattern, occasion), tags, collections, and SEO fields. Bulk CSV import/export.
- **ADM-02 [P0]** Inventory per warehouse, low-stock alerts, and stock reservation during checkout (15 min).
- **ADM-03 [P0]** Orders: search/filter, details, COD risk score, confirm/hold/cancel, invoice & label generation, courier assignment (Shiprocket/Delhivery API), manifest, NDR (non-delivery reports) handling, and RTO tracking.
- **ADM-04 [P0]** Returns/exchanges queue with QC, refunds/store credit, and reasons reporting.
- **ADM-05 [P0]** Promotions: coupons, combos, automatic discounts, prepaid offers.
- **ADM-06 [P0]** Customers: profile, orders, RTO/return history, notes, block COD, store credit adjustments (with reason, audited).
- **ADM-07 [P0]** Reports: sales by day/category/product/size, AOV, conversion funnel (from analytics), prepaid vs COD, RTO by pincode/courier, returns by reason, inventory ageing, GST summary (B2C/B2B, HSN-wise) exports.
- **ADM-08 [P0]** Staff roles & permissions (§3), audit log, and 2FA.

### 6.16 Analytics & marketing — `ANL`
- **ANL-01 [P0]** GA4 e-commerce events (view_item_list, select_item, view_item, add_to_wishlist, add_to_cart, view_cart, begin_checkout, add_shipping_info, add_payment_info, purchase, refund), Meta Pixel + **Conversions API** (server-side, deduplicated), and Google Ads conversions. Fire only after cookie consent where required.
- **ANL-02 [P0]** Product feeds: Google Merchant Center and Meta catalog (with variants, sale price, availability), auto-updated.
- **ANL-03 [P1]** Customer data / marketing automation (Klaviyo, MoEngage, WebEngage or similar) for email, WhatsApp and push journeys.
- **ANL-04 [P1]** A/B testing for hero, PDP layout and checkout nudges (feature flags).

---

## 7. Non-functional requirements
- **Performance:** mobile LCP < 2.0 s, CLS < 0.05, INP < 200 ms (p75 real-user data). Images via a CDN with AVIF/WebP, responsive `sizes`, blur placeholders; hero image preloaded; product grids server-rendered; JS budget for PLP/PDP ≤ 150 KB gzipped (excluding analytics). Lighthouse mobile ≥ 90.
- **Availability & scale:** 99.9%; handle 10× traffic during sales/drops (CDN caching of PLP/PDP with ISR/revalidation on stock/price change; a queue for order processing); load test before big sales.
- **Security:** PCI handled by the payment gateway (no card data on our servers), OWASP top-10 protections, rate limits on OTP/coupons/login, bot protection on checkout and coupons, admin 2FA, secrets in a vault, dependency scanning, and webhook signature checks.
- **Privacy & legal (India):** comply with the **Digital Personal Data Protection Act 2023** (consent, purpose, deletion requests, grievance contact), the **Consumer Protection (E-Commerce) Rules 2020** (seller details, grievance officer, return/refund/cancellation policies, no fake reviews or dark patterns, total price shown before purchase), **Legal Metrology** declarations on the PDP (MRP, manufacturer/importer, country of origin, net quantity, customer care), GST invoicing, and TRAI/DLT rules for SMS. WhatsApp only with opt-in. *Have a lawyer and CA review before launch.*
- **Accessibility:** WCAG 2.1 AA: alt text for all product images, keyboard-accessible menus/filters/carousels, visible focus, colour contrast (red prices stay ≥ 4.5:1), and the carousel pauses.
- **Browser support:** Chrome/Android 9+, Safari iOS 15+, Samsung Internet, and the latest 2 versions of desktop browsers. Works from 360 px width.
- **Localisation:** English UI at launch (Hinglish copy allowed); currency ₹ with Indian digit grouping; Hindi UI in P2.

## 8. Tech architecture (recommended)
```
apps/storefront   Next.js (App Router, RSC, TypeScript, Tailwind, shadcn/ui) — the design in DESIGN.md
                  ├─ lib/commerce/{shopify|medusa}  product, collection, cart, checkout, customer adapters
                  ├─ lib/cms (Sanity/Contentful or Shopify metaobjects)  homepage blocks, menus, banners
                  ├─ lib/search (Algolia/Typesense)  instant search + PLP filtering
                  ├─ lib/shipping (Shiprocket/Delhivery)  pincode serviceability, EDD, tracking
                  ├─ lib/reviews (Judge.me/Okendo API or own)  reviews, UGC
                  ├─ lib/notify (WhatsApp BSP, SMS DLT, email)  transactional messages
                  └─ lib/ai (LLM provider)  Ask Alpha [P2]
backend           Option A: Shopify (Plus optional) + apps (COD/1-click checkout, shipping, reviews, loyalty)
                  Option B: Medusa v2 + Postgres + Redis + S3/R2, admin extensions, workers
infra             Vercel (Mumbai edge) or AWS; image CDN; Sentry; GA4 + Meta CAPI; status page
```
**Core data model (Option B or our own extensions):** Product, Variant (colour, size, SKU, MRP, price, stock, HSN, gst_rate), ColourGroup, Collection, Category, SizeChart, Media, Attribute/FilterValue, Customer, Address, Cart, Order, OrderLine, Payment, Shipment, ReturnRequest, Exchange, Refund, StoreCredit, GiftCard, Coupon, Combo, LoyaltyAccount, CoinTransaction, Referral, Review, ReviewMedia, Wishlist, BackInStockSubscription, CMS blocks, AuditLog.

## 9. Integrations
| Need | Options | Phase |
|---|---|---|
| Commerce backend | Shopify (headless) / Medusa | P0 |
| Payments | Razorpay / Cashfree / PayU (UPI intent, cards, netbanking, wallets, EMI) | P0 |
| One-click / COD checkout | GoKwik / Razorpay Magic Checkout / Shiprocket Checkout | P1 |
| Shipping & returns | Shiprocket / Delhivery / Ekart / Xpressbees; reverse pickups; NDR | P0 |
| Search | Algolia / Typesense / Meilisearch | P0 |
| CMS | Sanity / Contentful / Strapi / Shopify metaobjects | P0 |
| Reviews & UGC | Judge.me / Okendo / own | P0–P1 |
| Loyalty & referrals | Own module or an app (e.g. Nector, Smile) | P1 |
| Messaging | WhatsApp Business API via a BSP (Interakt, Gupshup, AiSensy…); SMS with DLT; email (Resend/SES) | P0–P1 |
| Marketing automation | Klaviyo / MoEngage / WebEngage | P1 |
| Analytics | GA4, Meta Pixel + CAPI, Google Ads, Microsoft Clarity/Hotjar | P0 |
| Feeds | Google Merchant Center, Meta catalog | P0 |
| AI | LLM provider for Ask Alpha + product embeddings for similar/visual search | P2 |

## 10. Key flows
1. **Ad → PDP → buy:** an Instagram ad deep-links to the PDP → size selection with fit confidence → Add to bag → mini cart → checkout → OTP → saved/new address → UPI intent → paid → confirmation → WhatsApp "order confirmed".
2. **COD with risk check:** the COD-eligible order is placed → risk score → if high, a WhatsApp confirm/IVR → confirmed orders ship and unconfirmed ones are auto-cancelled after 24 h.
3. **Exchange:** the customer opens the order → "Exchange size" → picks the new size (stock reserved) → reverse pickup + forward shipment created → QC → done.
4. **Drop day:** Alpha Club members get early access 2 h before the public via a gated collection + push/WhatsApp; site autoscaling; inventory reservation.

## 11. Analytics events (minimum)
GA4 standard e-commerce events (ANL-01) plus custom: `size_guide_open`, `size_selected{size}`, `pincode_check{serviceable}`, `coupon_apply{code,success}`, `combo_progress`, `cod_selected`, `cod_risk{score}`, `upi_intent_open{app}`, `return_request{reason}`, `exchange_chosen`, `back_in_stock_subscribe`, `ask_alpha_query`, `search{query,results}`.

## 12. Delivery plan: milestones for Claude Code
| # | Milestone | Requirement IDs | Done when |
|---|---|---|---|
| **M0** | Setup & platform | §4 decision, Next.js + TS + Tailwind + shadcn, tokens from DESIGN.md, `lib/commerce` adapter with mock data, CI, Sentry, env | `pnpm dev` runs; `/dev/components` page |
| **M1** | Design system | DESIGN.md §3 components (header, menu drawer, buttons, product card, badges, swatches, size picker, chips, accordions, drawer, toasts, skeletons) | Matches reference crops at 1440/390 px |
| **M2** | Home + CMS | GLB-01…07, HOME-01…06, 08, 11, 12, CMS-01/02 | Homepage matches `reference/01` on desktop + mobile; blocks editable in CMS |
| **M3** | PLP & search | PLP-01…06, CARD-01/02, SRCH-01/02 | Filters/sort in URL; `reference/02` matched; search instant results |
| **M4** | PDP | PDP-01…03, 05…08, 12 | `reference/03` matched; pincode EDD works; reviews render |
| **M5** | Cart & checkout | CART-01/02/04/05, CHK-01…07, 09, 10, PROMO-01…04 | Test orders with UPI, card and COD succeed; coupon & combo maths unit-tested; `reference/04` matched |
| **M6** | Account, orders, returns | ACC-01/02, ORD-01…04, RET-01…04 | Customer can track, cancel and request an exchange; refunds/store credit flow tested |
| **M7** | Admin & ops | ADM-01…08 (or Shopify setup + apps for Option A) | Staff can add products, process orders, ship, handle returns |
| **M8** | SEO, analytics, legal, performance | CMS-03/04, ANL-01/02, §7 | Lighthouse ≥ 90 mobile; events validated in GA4 DebugView & Meta Events Manager; legal pages live → **Launch** |
| **M9** | Growth pack | LOY-01…04, PROMO-05/06, PDP-04/09/10, CART-03, HOME-07/09/10, ORD-02 WhatsApp, CHK-08, ANL-03/04, PWA | Each AC passes |
| **M10** | Differentiation | PDP-11 Ask Alpha, SRCH-03, PROMO-07, apps, personalisation | Each AC passes |

**Prompt for each milestone:**
```
Read PRD.md and DESIGN.md and the matching reference image(s). Implement milestone M<n> only.
List the requirement IDs you're covering, build them with tests (unit for pricing/coupon/combo/GST maths,
Playwright e2e for flows), run the site and compare with reference/ at 1440px and 390px, then summarise
what's done, what's left and any decisions. Don't start the next milestone.
```

## 13. Acceptance / launch checklist
- [ ] Desktop and mobile screens match `reference/` (spacing, type, colours, behaviour).
- [ ] e2e: browse → filter → PDP → size → add → coupon → checkout (UPI, card, COD) → confirmation → tracking → exchange request.
- [ ] Price maths unit tests: MRP/discount/coupon/combo/coins/prepaid offer/COD fee/GST split, all in paise.
- [ ] Pincode serviceability & EDD correct for 20 sample pincodes; COD rules enforced.
- [ ] Inventory can't oversell under concurrent checkouts (reservation test).
- [ ] Legal Metrology info on every PDP; policy pages live; grievance officer listed; cookie consent works.
- [ ] GA4 + Meta CAPI purchase events deduplicated and correct value; feeds approved.
- [ ] Lighthouse mobile ≥ 90 on home/PLP/PDP; CLS < 0.05.
- [ ] Real product photography uploaded (no placeholders), with alt text.
- [ ] Load test at 10× expected peak.

## 14. Risks & mitigations
| Risk | Mitigation |
|---|---|
| High RTO on COD | OTP, risk scoring, COD limits/fees, confirmation flows, prepaid nudges |
| High size-related returns | Size guides per product, fit meter from reviews, size recommendation, exchange-first returns |
| Slow site from heavy images/apps | Image CDN, strict JS budget, server rendering, few third-party scripts, performance CI |
| Sale-day traffic spikes | CDN/ISR, queueing, inventory reservation, load tests |
| Looking like a copy of another brand | Original brand identity, photography and copy; patterns only (see §0) |
| Fake/inflated social proof | Show only real ratings/reviews and true stock/claims (consumer law) |

## 15. Open questions
1. Platform: Option A (headless Shopify) or B (Medusa)?
2. Final domain, logo and brand colours (DESIGN.md proposes black/white + red + yellow accents).
3. Launch catalogue size, categories and size range (incl. plus sizes?).
4. Warehouse location(s) and courier partners; COD limits and fee.
5. Return window/fees policy and whether to launch Alpha Club at launch or in P1.
6. Payment gateway and one-click checkout provider.
7. Budget for apps/services (search, reviews, WhatsApp, marketing automation).
8. Photography plan (studio flat-lay + on-model + video) and timelines.
