# Personal data breach runbook (DPDP Act s.8(6) + DPDP Rules 2025)

DRAFT — owner + lawyer to confirm contacts and the Board's current reporting channel before launch.

## 0. Who
| Role | Person | Contact |
|---|---|---|
| Incident lead | _owner to fill_ | |
| Grievance Officer / privacy contact | `GRIEVANCE_OFFICER_*` env | |
| Engineering on-call | _owner to fill_ | |
| Legal counsel | _owner to fill_ | |

## 1. Contain (first hour)
- Stop the leak: rotate exposed keys/tokens, revoke sessions, disable the affected feature via its kill-switch
  flag, block abusing IPs at the CDN/WAF.
- Preserve evidence: snapshot logs, DB audit tables, CDN logs. Don't delete anything.
- Start the incident record (template below) — every action with time (IST) and who did it.

## 2. Assess (same day)
- What data, how many Data Principals, which categories (contact, address, orders, consent records…),
  since when, whether data left our control, likely harm.

## 3. Notify — without delay
- **Data Protection Board of India:** initial intimation without delay once we become aware; a detailed report
  within **72 hours** (or longer if the Board allows): facts, timing, cause, impact, mitigation, findings about the
  person responsible, measures to prevent recurrence, and the notifications made to users.
- **Every affected user** (email/SMS, in plain language): what happened, when, what data, likely consequences,
  what we're doing, what they should do (e.g. watch for phishing calls quoting order details), and the
  Grievance Officer contact.
- Payment data involved → also the payment gateway. Platform-level incident → the platform's process too.
- CERT-In: check whether the incident type is reportable within 6 hours under CERT-In directions (lawyer).

## 4. Recover & learn
- Fix the root cause, add a negative test / CI gate for it, update `docs/known-gaps.md`.
- Post-incident review within 7 days; record in `changes/CHANGELOG.md` (no personal data in the log).

## Incident record template
```
Incident ID:
Detected (IST) / by:
Data & users affected (counts only):
Timeline of actions (time — who — what):
Board intimation sent (time, channel, reference):
Board detailed report sent (time):
Users notified (time, channel, count):
Root cause:
Preventive measures:
```
