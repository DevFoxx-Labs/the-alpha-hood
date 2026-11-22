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
