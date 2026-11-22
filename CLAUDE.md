@AGENTS.md

# The Alpha Hood storefront — project rules

**Specs:** `docs/alpha-hood-store-kit/PRD.md` (what + milestones), `DESIGN.md` (look), `reference/` (screens + prototypes).
Build one milestone at a time (PRD §12). Reference requirement IDs (e.g. `CARD-01`) in commits and tests.

**Before a task:** read this file, `changes/CHANGELOG.md` and `docs/known-gaps.md`.
**After a task:** add a `changes/CHANGELOG.md` entry; update `docs/known-gaps.md` / `docs/owner-todo.md`.
**Done =** `pnpm verify` (typecheck, lint, test, build) passes and UI is checked at 1440 / 390 / 360 px.

## Stack
Next.js 16 App Router (Cache Components on) · TypeScript · Tailwind v4 (tokens in `app/globals.css` `@theme`) ·
shadcn/ui-style primitives on `radix-ui` in `components/ui` · store components in `components/store` · Vitest.

## Rules
- **Icons: Hugeicons free only** (`@hugeicons/react` + `@hugeicons/core-free-icons`) via `components/ui/icon.tsx`.
  No lucide/other icon sets, no ad-hoc SVG icons. Icon-only buttons need `aria-label`. (DESIGN.md §0 mentions
  lucide-react; the owner's standing rule overrides it.)
- **Design:** square corners; red only for price/sale/urgency; volt only on dark/tiles; Anton display + Inter UI.
- **Commerce only through `lib/commerce`** (adapter interface). The mock adapter and `/dev/*` pages fail closed in
  production (`resolveCommerce`, `devPagesEnabled`).
- **Money:** integer paise everywhere (`lib/format.ts`); the server computes every price/total — client state is display only.
- **Security by design** (global rule): threat-model each feature, server-side authorization, never trust client
  price/role/status, rate-limit public writes, no secrets in `NEXT_PUBLIC_*`, negative tests per abuse case.
- **DPDP compliance** (global rule): notices, consent ledger, cookie gating and rights must exist before any feature
  that collects personal data or loads trackers — see `docs/known-gaps.md`.
- **Database safety / performance / workflow** (global rules): additive migrations, ACID writes; LCP ≤ 2.5 s,
  INP ≤ 200 ms, CLS ≤ 0.1; use what's installed, one service per business rule, fail-closed flags.
