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
- **Brand assets:** logo kit in `docs/brand/logo-kit/` (masters, usage rules); use only those files via `components/store/logo.tsx`
  / `public/brand/` — never redraw or recolour the logo.
- **Mascot "ALPHA":** placements in `docs/brand/mascot/README.md` (from `MASCOT_PROMPTS.md` §7); use `<Mascot>` +
  `lib/brand/mascot.ts`. Product photos lead; mascot only for in-between moments; never as product photos or merch for sale.
- **Own backend (`docs/backend/README.md`):** data lives behind store interfaces; `lib/db` implements them for MySQL,
  PostgreSQL and MongoDB (`DATABASE_DRIVER`). Every new store needs all three + memory, passing `lib/db/contract.test.ts`.
  Never import `lib/db` from client code (guard test). Destructive DB ops only on local `_dev`/`_test` databases.
  **MySQL is the primary database:** develop and verify on local MySQL first; PostgreSQL and MongoDB are checked after.
- **Admin settings (`lib/settings`):** a setting is declared once in `lib/settings/catalog.ts` and overrides one
  environment variable; read config through the existing `env = process.env` readers, never from the settings table.
  Database URL, `SECRET_BOX_KEY`, auth secrets and the preview switches must never be added to the catalogue.
- **Admin providers (`lib/providers`):** SMS goes through the provider made live in Admin → SMS providers; drivers
  have fixed hosts (never an admin-typed URL), keys are sealed and write-only, a provider must pass a test before
  it can go live, and only DLT templates with allow-listed variables are sent (no free text).
- **Providers & storage:** email goes through the provider live in Admin → Email providers (SMTP hosts must resolve
  to public addresses; connect to the checked IP). Product photos go through `withObjectStorage` (`lib/storage`):
  server-chosen keys, private buckets, fixed hosts. Social sign-in never matches a customer by email.
- **Commerce only through `lib/commerce`** (adapter interface). The mock adapter and `/dev/*` pages fail closed in
  production (`resolveCommerce`, `devPagesEnabled`).
- **Money:** integer paise everywhere (`lib/format.ts`); the server computes every price/total — client state is display only.
- **Security by design** (global rule): threat-model each feature, server-side authorization, never trust client
  price/role/status, rate-limit public writes, no secrets in `NEXT_PUBLIC_*`, negative tests per abuse case.
- **DPDP compliance** (global rule): notices, consent ledger, cookie gating and rights must exist before any feature
  that collects personal data or loads trackers — see `docs/known-gaps.md`.
- **Database safety / performance / workflow** (global rules): additive migrations, ACID writes; LCP ≤ 2.5 s,
  INP ≤ 200 ms, CLS ≤ 0.1; use what's installed, one service per business rule, fail-closed flags.
