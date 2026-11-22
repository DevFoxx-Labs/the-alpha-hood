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
