# Owner TODO

Items only the owner can do. Never ticked off without the owner's confirmation.

## 2026-11-22 (after M0/M1)
- [ ] Decide the commerce platform: headless Shopify (A) or Medusa (B) — PRD §4.
- [ ] Provide legal entity details: company name, registered address, GSTIN, support email/phone,
      **Grievance Officer** name/email/phone — needed for the DPDP legal foundation.
- [ ] Confirm the final logo, domain and brand colours (PRD §15 Q2); current mark is DESIGN.md's proposal.
- [ ] Confirm demo commercial values in `lib/config/store.ts`: free-shipping threshold ₹999, max 5 per SKU, 7-day returns.
- [ ] Create a Sentry project (MFA on the account) and share the DSN as a secret.
- [ ] Enable branch protection on `main` requiring the CI workflow.
- [ ] Book the photography shoot (DESIGN.md §5) — all product images are placeholders.

## 2026-11-22 (after legal foundation + M2)
- [ ] Fill the legal/contact env values (`.env.example` → hosting env): `LEGAL_*`, `SUPPORT_*`, `PRIVACY_EMAIL`,
      `GRIEVANCE_OFFICER_*`. Appoint the Grievance Officer.
- [ ] Have a lawyer review Privacy (EN + HI), Terms, Refund & Cancellation, Cookie Policy, the retention schedule
      (`docs/legal/retention-schedule.md`) and the breach runbook (`docs/legal/breach-runbook.md`); a CA to confirm the
      GST record-keeping period.
- [ ] Fill the breach runbook contacts (incident lead, on-call, legal counsel).
- [ ] Choose the CMS (Sanity / Contentful / Strapi, or Shopify metaobjects if Option A).
- [ ] Choose email + WhatsApp/SMS providers (needed for request acknowledgements, OTP identity checks, newsletter opt-in).
- [ ] Confirm the new demo values in `lib/config/store.ts`: refund start within 2 days, damage report within 24 h, 18+ only.
- [ ] Provide social profile URLs (`SOCIAL_*_URL`) and confirm which payment methods/claims may be shown.

## 2026-11-22 (after M4)
- [ ] Provide Legal Metrology data per product (manufacturer / packer / importer name + address, country of origin) —
      or confirm it comes from the commerce platform's product fields.
- [ ] Choose the shipping partner (Shiprocket / Delhivery / …) and confirm COD fee (demo ₹49), COD max (demo ₹5,000),
      express fee (demo ₹99) and dispatch cut-off (demo 2 pm IST).
- [ ] Choose the reviews provider (Judge.me / Okendo / own) and supply measured size charts per style.
- [ ] Confirm which coupons are live (demo: ALPHA10, HOOD200, HOOD500) and set `SITE_URL` on the host.

## 2026-11-22 (after M5)
- [ ] Choose the payment gateway (Razorpay / Cashfree / PayU) and SMS provider (DLT-registered OTP template). Put the
      gateway webhook secret and API keys in the host's secret store (never in the repo).
- [ ] Set `OTP_PEPPER` (≥ 32 random characters) as a secret on the host; set `CHECKOUT_ENABLED` / `COD_ENABLED` only when
      the real gateway, SMS and database are live. Never set `ALLOW_MOCK_PAYMENTS` on the live store.
- [ ] CA to confirm the GST rate table (HSN classes, ₹2,500 slab) and the warehouse state; confirm shipping fee ₹79,
      COD fee ₹49 / max ₹5,000, UPI offer 5% (max ₹150), coupons and combos.
- [ ] Turn on MFA on the gateway and SMS provider accounts.

## 2026-11-23 (after M6)
- [ ] Confirm return rules: 7-day window, ₹99 fee after the first free return, 5% store-credit bonus, non-returnable
      categories (sunglasses, accessories, innerwear, perfumes), 24 h for damaged/wrong. Keep the Refund policy in sync.
- [ ] Lawyer: confirm what account deletion keeps (order and invoice records with the delivery address) and the
      store-credit forfeiture wording.
- [ ] CA: confirm the invoice layout and numbering (INV/<FY>/<6 digits>, issued at dispatch).
- [ ] Choose an email provider (email OTP, invoices) and a Google OAuth client if social sign-in is wanted.
- [ ] Set `ACCOUNTS_ENABLED` on the host only once the database and SMS provider are live.

## 2026-11-23 (after M7)
- [ ] Production: set `ADMIN_SETUP_TOKEN` (≥ 32 random chars) in the host's secret store, create the owner at
      `/admin/setup`, set up the authenticator, then delete the token from the host.
- [ ] Confirm the staff roles and money limits (support: refunds up to ₹5,000, no credit; store manager: refunds up to
      ₹10,000, credit up to ₹2,000; finance and owner: no limit).
- [ ] Decide where products / coupons are edited (Shopify / Medusa admin) — the store admin shows them read-only.
- [ ] OK to add `recharts` (~100 KB, admin only) for report charts? Plain bars are used until then.
- [ ] Choose a courier aggregator (Shiprocket / Delhivery) so shipping and delivery updates come by webhook.

## 2026-11-24 (after M8)
- [ ] Lawyer: review the updated Privacy Notice (Google Analytics, Google Ads, Meta Pixel + Conversions API, transfers
      outside India, retention) and the Cookie Policy — both now version 2026-11-24 (visitors are asked again).
- [ ] Create GA4, Google Ads and Meta Pixel accounts (MFA on each); give the public IDs (`GA4_MEASUREMENT_ID`,
      `GOOGLE_ADS_ID` + purchase label, `META_PIXEL_ID`) and put `GA4_API_SECRET` and `META_CAPI_TOKEN` in the host's
      secret store. Then validate in GA4 DebugView and Meta Events Manager (use `META_TEST_EVENT_CODE`, remove after).
- [ ] Set GA4 data retention to 14 months (the Privacy Notice says so) and turn off Google signals unless wanted.
- [ ] Merchant Center + Meta Commerce Manager: add `https://<domain>/feeds/products.xml` as a scheduled feed once real
      product photos exist; set shipping and returns in Merchant Center to match /help/shipping.
- [x] Brand assets: logo kit received 2026-11-24 and wired in (favicon, icons, header/footer/admin, share image).
- [ ] Review the draft About / FAQ / Shipping copy.
- [ ] OK to add `@lhci/cli` (dev only) for the Lighthouse CI gate? Lighthouse mobile ≥ 90 is unmeasured until then.
- [ ] At launch: set `SITE_URL`, then `ALLOW_INDEXING=true`, and submit `/sitemap.xml` in Search Console.

## 2026-11-24 (logo kit)
- [ ] Colours: switch the site's yellow accent to the kit's Wolf-eye Yellow #F5C80B and black to #0A0A0A? (today
      `volt` #F4E04D and `ink` #111111 — small visible change).
- [ ] Brand icons (bag, wishlist, delivery, returns, Alpha Club): use them in the UI instead of Hugeicons, or only as
      brand art (e.g. the Alpha Club badge in M9)?
- [ ] Before trademark filing: designer review of the master SVG and a trademark search (kit README).

## 2026-11-24 (mascot images)
- [ ] Review the mascot placements (`docs/brand/mascot/README.md`) in `pnpm dev`: homepage hero / tiles / promo band /
      "The Pack" band, About page, empty bag & wishlist, order success, size guide, track order, sign-in, 404.
- [ ] Copy edits: homepage hero now "Own the city / Hood up / Built to lead"; the third collection tile changed from
      "Knit club" to "Denim days" (links to /men/jeans) to match the denim artwork.
- [ ] Regenerate "Alpha Wolf Stride" (and a transparent "peek") if you want the runway banner and corner peek.
- [ ] Before merch / trademark: designer recreation of the mascot (owned files).

## 2026-11-23 (POS proposal — `docs/alpha-hood-store-kit/POS.md`)
- [ ] Approve or reject the POS scope change (PRD §2 lists offline POS as a v1 non-goal) and build vs buy (POS.md §0).
- [ ] Answer POS.md §13: stores and states (GSTIN per state), own vs franchise, hardware + EDC provider, store stock
      online or not, store prices/offers/coupons, store return & cash-refund policy, discount limits / staff discount /
      commission, offline need, GS1 vs internal barcodes.
- [ ] CA: invoice + credit-note format and ≤ 16-character series (also fixes the online series), cash rounding,
      e-invoice threshold, stock-transfer documents, s.269ST cash limit and Rule 114B PAN handling.

## 2026-11-25 (after M9 part 1)
- [ ] Confirm the Alpha Club rules (demo values in `lib/loyalty/config.ts` and the Terms): earn 5 / 7 / 10 per ₹100,
      Elite ₹15,000 / Legend ₹40,000 a year, 30-day member returns, coins expire after 365 days, leaving forfeits
      coins, referral ₹200 off ₹999+ and 200 coins, 50 coins per approved photo.
- [ ] CA: are Hood Coins a discount (reduces taxable value) or a payment / tender? Needed before coins can be spent
      at checkout (M9 part 2). Same question for gift cards (GST at issue vs redemption) and their expiry (RBI PPI
      rules: at least 1 year).
- [ ] Lawyer: review the new Terms sections (Alpha Club, #WearTheHood) and the Privacy Notice additions (2026-11-25).
- [ ] Choose a WhatsApp Business provider (BSP) and get the templates approved; SMS DLT templates for review
      request, back in stock and price drop.
- [ ] Set `CRON_SECRET` (≥ 32 random chars) on the host and add a scheduled call to `/api/cron/sweep` (every 15 min).
- [ ] Decide on one-click checkout (GoKwik / Razorpay Magic / Shiprocket) and marketing automation (Klaviyo /
      MoEngage / WebEngage) — each needs an integration and a Privacy Notice entry.
- [ ] Give staff the moderation rules for #WearTheHood (store manager / marketing have `ugc.moderate`).
- [ ] Review the demo looks ("The street uniform", "Winter layers") and real campaign photos for Shop the Look.

## 2026-11-25 (after M9 part 2)
- [ ] CA: confirm the wallet treatment — Hood Coins, gift cards and store credit are recorded as ways to pay (the
      invoice and GST are on the full price). If coins must be a discount instead, tell us before launch.
- [ ] Confirm: coins can pay up to 20% of an order's product value; order of use: coins → gift card → store credit;
      gift cards ₹500–₹10,000, valid 1 year.
- [ ] Decide whether to sell gift cards online (needs a payment flow + GST decision) — staff can issue them today.
- [ ] Give finance staff the gift card process: issue with a reason, send the code privately, block if reported lost.

## 2026-11-26 (own backend, phase 1)
- [ ] Create the local databases and a dedicated app user (not root):
      MySQL `CREATE DATABASE alpha_hood_dev …; CREATE DATABASE alpha_hood_test …;` and the same two in PostgreSQL.
- [ ] Put the credentials in `.env.test.local` (`TEST_MYSQL_URL`, `TEST_POSTGRES_URL`) and, to run the app on them,
      in `.env.local` — then run `pnpm test` (contract suite on all three) and tell me the result.
- [ ] Production database choice (MySQL / PostgreSQL / MongoDB Atlas) and hosting — the app supports all three.

## 2026-11-26 (own backend, phase 4 — catalogue)
- [ ] Decide when the store switches to `COMMERCE_PROVIDER=own` (own catalogue). Until phase 5 the admin staff store
      is memory-only, so on a live server products can't be managed yet.
- [ ] Prepare the real catalogue data: SKU, title, colour, sizes + opening stock, MRP and price, description,
      Legal Metrology details (manufacturer / packer / importer, country of origin, net quantity) per product.
      Demo products and reviews are only for local testing and must not be imported to the live store.
- [ ] Product photos (shot list per DESIGN.md §5) — the upload feature is the next catalogue step.

## 2026-11-26 (own backend, phase 5 — admin + growth)
- [ ] Generate `SECRET_BOX_KEY` (32 random bytes, base64) and put it in the production secret store — staff
      sign-in refuses to run in production without it. Keep a copy in the password manager: without it, staff TOTP
      secrets can't be read and everyone must re-enrol MFA.
- [ ] When the production database is created, give the app a database user that can't UPDATE or DELETE
      `audit_log` (insert + select only).


## 2026-11-24 (trademark files — `docs/brand/trademark/TRADEMARK.md`)
- [ ] Engage a trademark attorney/agent; run a clearance search for `THE ALPHA HOOD` and the wolf device (classes 25, 35).
- [ ] Confirm who created the logo concept and get a written copyright assignment (or have a designer finalise the
      master) before filing.
- [ ] Provide applicant details (legal entity, address, entity type for the fee tier) and date of first use / evidence.
- [ ] Decide B&W vs colour claim for the device marks, then file (word mark first). Use ™ only — never ® until registered.

## 2026-11-27 (own backend, phase 6 — switch-over, see docs/backend/go-live.md)
- [ ] Pick the production database host (Indian region, managed backups with point-in-time recovery) and create the
      deploy + app users (app user: INSERT/SELECT only on `audit_log` and `consent_records`).
- [ ] Put the secrets from go-live.md §3 in the host's secret store; keep `SECRET_BOX_KEY` in the password manager.
- [ ] Schedule `GET /api/cron/sweep` every 15 minutes with `Authorization: Bearer $CRON_SECRET`.
- [ ] Prepare the real catalogue file (template: docs/backend/catalog-import.example.json) and product photos.
- [ ] Do the first restore test from a backup and note RTO / RPO.
- [ ] Have a lawyer review the retention schedule (go-live.md §7) and set periods for the consent ledger, audit log
      and privacy requests.

