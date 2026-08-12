// Environment-scoped, observable feature flags. See tasks.md 5.1/5.2 and
// legacy-migration-controls spec "Staged, environment-scoped rollout" /
// "Explicit source-of-truth boundary" / "Emergency disablement".
//
// identity / tournaments / ratings: SessionProvider, tournamentRepository,
// bracketRepository, resultRepository, and ratingRepository have no
// fixture/mock counterpart at all — Phases 2-4 wired every one of them
// directly to Supabase, each with a truthful UNAVAILABLE error on outage
// (assertConfigured()) and zero fixture fallback in any build. There is no
// fixture "safe path" to route to for these three, so the "Emergency
// disablement" scenario's safe path IS that same truthful-unavailable
// state — an operator disabling one of these flags doesn't reveal a
// fixture, it just makes the adapter refuse to run at all (see
// assertConfigured() in each repository, which checks both Supabase
// configuration AND its adapter's flag). Each flag defaults on and is
// reversibly disabled via its own env var override, so an authorized
// operator can genuinely flip one off per legacy-migration-controls'
// "Emergency disablement" scenario without a redeploy that changes code.
//
// demoFinancialUI: the one legacy surface that still has a real
// fixture-backed implementation — wallet balance, prediction markets, and
// simulated TCRED credits (proposal.md "Out of Scope": no real
// cryptocurrency, wallets, deposits/withdrawals, custody, or monetized
// predictions in Stage 1). This flag is the only thing standing between
// that demo UI and a production build.
export function resolveDemoFinancialUIFlag({ isProd, envOverride }) {
  // `isProd` is Vite's `import.meta.env.PROD`, which is replaced with a
  // literal boolean at build time (Vite `define`) — so this branch is not
  // a runtime toggle a misconfigured env var can flip on in production;
  // the production bundle never even contains the `envOverride` check on
  // this path. See tasks.md 5.6 "unreachable in production build".
  if (isProd) return false
  return envOverride !== 'false'
}

/**
 * Adapter flags (identity/tournaments/ratings) default enabled and are
 * reversibly disabled only by an explicit `'false'` env override — never
 * silently, and never by any other value. Unlike demoFinancialUI, this is
 * not forced by `isProd`: production is exactly where an operator needs
 * the real ability to disable an adapter during an incident (see
 * legacy-migration-controls spec "Emergency disablement"), so the
 * override is honored in every environment, not just non-production.
 */
export function resolveAdapterFlag({ envOverride }) {
  return envOverride !== 'false'
}

export const FEATURE_FLAGS = Object.freeze({
  identity: resolveAdapterFlag({ envOverride: import.meta.env.VITE_FEATURE_IDENTITY }),
  tournaments: resolveAdapterFlag({ envOverride: import.meta.env.VITE_FEATURE_TOURNAMENTS }),
  ratings: resolveAdapterFlag({ envOverride: import.meta.env.VITE_FEATURE_RATINGS }),
  demoFinancialUI: resolveDemoFinancialUIFlag({
    isProd: import.meta.env.PROD,
    envOverride: import.meta.env.VITE_DEMO_FINANCIAL_UI,
  }),
})

export const isProductionBuild = import.meta.env.PROD
