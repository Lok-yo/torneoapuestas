# TorneoApuestas — Production-ready tournament platform (Stage 1)

React 19 + Vite SPA backed by Supabase (Postgres + Auth + Edge Functions).
Stage 1 covers authenticated identity, one seeded game/format (SSBU
singles, single-elimination, 8 participants), tournament operations,
official results, and rating projections/leaderboard. It explicitly
excludes real cryptocurrency, wallets, custody, deposits/withdrawals,
KYC collection, and monetized prediction markets — see
`openspec/changes/production-ready-tournament-betting-platform/proposal.md`
"Out of Scope" for the authoritative list.

## Environment and secrets contract

Copy `.env.example` to `.env` (git-ignored) and fill in real values for
local development. **Never commit a real `.env` or a service-role key.**

### Client (Vite, `VITE_*`, bundled into the browser build)

| Variable | Required | Default when unset | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Yes | — | Public Supabase project URL. Every repository's `assertConfigured()` fails into a truthful `UNAVAILABLE` state (never a fixture) when this or the anon key is missing — see `src/lib/supabase.js`. |
| `VITE_SUPABASE_ANON_KEY` | Yes | — | Public anon key only. The service-role key must never appear in client code or a `VITE_*` variable — it would ship to every browser. |
| `VITE_FEATURE_IDENTITY` | No | enabled | Set to the literal string `false` to reversibly disable the identity adapter (emergency disablement — see `legacy-migration-controls` spec). Honored in every environment, including production. |
| `VITE_FEATURE_TOURNAMENTS` | No | enabled | Same mechanism, for the tournament/bracket/result adapters. |
| `VITE_FEATURE_RATINGS` | No | enabled | Same mechanism, for the ratings/leaderboard adapter. |
| `VITE_DEMO_FINANCIAL_UI` | No | enabled in dev, **hard-forced off in production** | Gates the legacy demo wallet/prediction-market UI (`src/store/useWalletStore.js` and friends). `import.meta.env.PROD` overrides this at build time — no override can re-enable it in a production bundle. See `src/config/featureFlags.js`. |

### Edge Functions (Deno runtime, `Deno.env.get(...)`)

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | Yes | Injected automatically by the Supabase Edge Functions runtime — not something you set manually in `.env`. |
| `SUPABASE_ANON_KEY` | Yes | Same — injected automatically. Every Edge Function forwards the **caller's own JWT** (not a service-role key) to Postgres, so RLS — not the function — is the real authorization boundary. |

### Deploy-time only (never a `VITE_*` variable, never in the browser bundle)

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Yes, for the maintainer only | Used exactly once, manually, by the maintainer to apply the admin-bootstrap migration (see below). Never wired into any runtime code path, endpoint, or environment the app itself reads. |

## Local development

```bash
npm ci                 # frozen install
npm run dev             # Vite dev server
npm run lint             # oxlint
npm run test              # vitest (unit)
npm run build              # production build
npm run preview              # serve the built dist/
```

## Testing

| Layer | Command | What it covers |
|---|---|---|
| Unit (Vitest + RTL) | `npm run test -- --run` | Domain logic (`src/domain/**`), repositories, feature flags, `SessionProvider`, `RequireAuth` supporting logic. |
| Postgres / pgTAP | `npm run test:db` (wraps `supabase test db`) | Schema, RLS deny-by-default, RPC authorization/idempotency/concurrency, public-view projection boundaries, migration audit trail. Suites live in `supabase/tests/`. |
| End-to-end (Playwright) | `npm run test:e2e` (wraps `playwright test`) | OAuth-stub sign-in/onboarding, tournament lifecycle, leaderboard/history, no-financial-UI-in-production, and the routing threat matrix (`e2e/session-routing.spec.js`: token expiry, direct-URL access, forged role claims, hostile redirect targets). All specs stub the network boundary — no real Google/Supabase call is ever made. |

CI (`.github/workflows/ci.yml`) runs all of the above as one strict
sequential gate chain: frozen install → lint → unit tests (with
coverage) → Supabase migrations/RLS/pgTAP → build → Playwright → `npm
audit`. Any failure blocks every step after it.

## Migration and rollback runbook

Migrations live in `supabase/migrations/`, numbered and applied in
order. Locally:

```bash
supabase db reset   # replays every migration from a clean database
```

**Rollback policy** (see `design.md` "Security, Observability, and
Rollout"): migrations are additive. There is no automatic "down"
migration path for anything past the schema-definition stage —
prefer a forward-fixing migration that corrects the issue while
preserving every existing row and audit record. A tested rollback
`DROP`/`ALTER` is acceptable **only** before a migration has taken any
real write in production (i.e. it shipped but nothing depends on it
yet); once real rows exist, restore from a point-in-time backup instead
of dropping objects that data depends on.

Adapter-level rollback (not a database rollback) is the primary
incident-response tool: an authorized operator sets `VITE_FEATURE_*` or
`VITE_DEMO_FINANCIAL_UI` to `false` and redeploys the client — the
declared safe path is the truthful `UNAVAILABLE` state (there is no
fixture fallback for identity/tournaments/ratings; see
`docs/legacy-retirement.md`). Every such flag-driven denial and every
adapter-dependency error is recorded in the append-only `migration_events`
table (`supabase/migrations/0014_migration_audit.sql`), readable only by
an `admin`-role account, for later reconciliation.

## Admin bootstrap procedure

The first `admin` role grant is **not** a runtime or in-app action. It is
a one-time SQL migration (`supabase/migrations/0002_admin_bootstrap.sql`)
that grants `admin` to a fixed maintainer email
(`lleonalmaza@gmail.com`) if — and only if — that email has already
signed in at least once (so the corresponding `auth.users` row exists).
There is deliberately no runtime endpoint, JWT-claim grant, or
environment-variable allowlist path for granting roles — see
`proposal.md` "First admin bootstrap" and `design.md` "Browser writes vs
commands".

To apply it:

1. Have the fixed maintainer email sign in through the app once (so
   `auth.users` has the row).
2. Apply `0002_admin_bootstrap.sql` (already applied automatically as
   part of any full `supabase db reset` / migration replay) using the
   **service-role key**, never a browser session.
3. Re-running the migration is safe and idempotent
   (`on conflict (user_id, role) do nothing`) — it is not consumed or
   invalidated by re-application.

Every subsequent role grant (`organizer`, `referee`, additional
`admin`s) is expected to go through direct database administration by
someone who already holds `admin`, not through this bootstrap migration
again.
