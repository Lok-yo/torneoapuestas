// RED (now GREEN against src/config/featureFlags.js, src/App.jsx,
// src/components/Navbar.jsx, src/pages/HomePage.jsx): proves a production
// build (FEATURE_FLAGS.demoFinancialUI hard-forced off, never a runtime
// env override) exposes no wallet/market/prediction routes or UI —
// Stage 1 explicitly excludes real cryptocurrency, wallets, deposits/
// withdrawals, custody, and monetized predictions. See tasks.md 5.6/5.7
// and legacy-migration-controls spec "Legacy identity and financial
// isolation". This build is produced by `npm run build` with no
// VITE_DEMO_FINANCIAL_UI override — `import.meta.env.PROD` alone already
// forces the flag off regardless.
import { test, expect } from '@playwright/test'

const USER_ID = 'e2e00000-0000-0000-0000-0000000000f1'

async function stubAuthenticatedSession(page) {
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: USER_ID,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'e2e-financial-isolation@example.com',
        app_metadata: { provider: 'google' },
        user_metadata: {},
        identities: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        is_anonymous: false,
      }),
    }),
  )

  await page.route('**/functions/v1/bootstrap-session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profile: { user_id: USER_ID, username: 'jugador_sin_wallet', display_name: null, avatar_url: null },
        roles: ['user'],
      }),
    }),
  )
}

function stubAccessTokenHash() {
  return '#access_token=e2e-fake-access-token&refresh_token=e2e-fake-refresh-token&expires_in=3600&token_type=bearer'
}

test.describe('Production build excludes all financial/prediction-market UI', () => {
  test('the wallet route is unreachable (404), never a fabricated wallet page', async ({ page }) => {
    await stubAuthenticatedSession(page)
    await page.goto('/wallet' + stubAccessTokenHash())

    await expect(page.getByText('404')).toBeVisible()
    await expect(page.getByText('No encontramos esta página.')).toBeVisible()
  })

  test('a market-detail route is unreachable (404), never a fabricated market page', async ({ page }) => {
    await page.goto('/mercados/whatever-market-id')

    await expect(page.getByText('404')).toBeVisible()
  })

  test('the navbar never shows a wallet balance link', async ({ page }) => {
    // Note: Navbar.jsx still reads the legacy mock useSessionStore for its
    // "logged in" UI (a pre-existing, separately-scoped gap documented
    // since batch 2 — it does not yet reflect the real SessionProvider),
    // so a real authenticated session does not visibly change the navbar
    // here. That gap is orthogonal to this assertion: regardless of which
    // session store the navbar ever migrates to read, FEATURE_FLAGS.
    // demoFinancialUI being hard-off in production means the wallet
    // link's own render branch can never execute. See
    // docs/legacy-retirement.md for the tracked navbar-migration item.
    await stubAuthenticatedSession(page)
    await page.goto('/' + stubAccessTokenHash())

    await expect(page.getByRole('link', { name: /wallet/i })).toHaveCount(0)
  })

  test('the home page shows no prediction-market section or betting copy', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('Mercados con más volumen')).toHaveCount(0)
    await expect(page.getByText(/apostá con TCRED/i)).toHaveCount(0)
    await expect(page.getByText(/mercados de predicción/i)).toHaveCount(0)
  })
})
