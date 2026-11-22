# Retention schedule (DPDP rule §9)

DRAFT — must match the Privacy Notice §5 (`lib/legal/notices/privacy.ts`) and be reviewed by a lawyer/CA.
Change both in the same commit. Deletion jobs are built with the database (M6/M7); until then nothing is
stored in production (all stores fail closed).

| Data | Where (planned) | Keep for | Then | Job |
|---|---|---|---|---|
| Account profile, saved addresses | Commerce platform / DB | While account active | Delete within 30 days of account deletion | `account-erasure` (M6) |
| Inactive accounts | DB | 3 years without sign-in or order | Email/SMS 48 h before, then delete | `inactive-accounts` (M6) |
| Orders, invoices, payment references | Platform / DB | ≥ 72 months from due date of that year's annual GST return | Anonymise customer fields | `orders-anonymise` (M7) — confirm period with CA |
| Return/exchange photos | Private object storage | Until return closed + 180 days | Delete objects | `return-media-purge` (M6) |
| UPI ID for COD refunds | DB (encrypt at rest) | Until refund paid + 180 days | Delete | `return-media-purge` |
| Store credit ledger | DB, append-only | While account active | Zeroed on account deletion (rows kept for accounts) | `account-erasure` |
| Newsletter subscribers | DB | Until unsubscribe/withdrawal | Delete contact within 30 days (keep consent rows) | `newsletter-purge` |
| Consent ledger (`consent_records`) | DB, append-only | Up to 7 years after withdrawal / account closure | Delete rows | `consent-ledger-expiry` |
| Privacy requests & grievances | DB | 3 years after closure | Delete | `grievance-expiry` (M7) |
| Security & access logs | Log store | ≥ 1 year (DPDP Rules) | Delete | log retention policy |
| `ah_vid` cookie | Browser | 12 months | Expires | — |
| `ah_consent` cookie | Browser | 6 months | Expires → banner asks again | — |

Rules: never copy real personal data to local/staging unmasked; jobs run in batches inside transactions and
log counts only (no personal data).
