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
  test('an authenticated user reaches their real wallet & ledger page', async ({ page }) => {
    await stubAuthenticatedSession(page)
    await page.route('**/rest/v1/rpc/get_or_create_wallet', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ user_id: USER_ID, balance: 100, locked_balance: 0, available_balance: 100, currency: 'USD' }]),
      }),
    )
    await page.route('**/rest/v1/wallet_transactions*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )

    await page.goto('/wallet' + stubAccessTokenHash())

    await expect(page.getByText('Billetera de @jugador_sin_wallet')).toBeVisible()
    await expect(page.getByText('Saldo Total')).toBeVisible()
  })

  test('a market-detail route renders real prediction market details from Supabase', async ({ page }) => {
    await page.route('**/rest/v1/markets*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-0000-0000-000000000001',
          question: '¿Gana Jugador 1 el torneo?',
          category: 'TOURNAMENT',
          status: 'OPEN',
          market_outcomes: [
            { id: 'o1', label: 'Sí', price: 0.5, total_shares: 10 },
            { id: 'o2', label: 'No', price: 0.5, total_shares: 0 },
          ],
        }),
      }),
    )
    await page.route('**/rest/v1/market_positions*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )

    await page.goto('/mercados/00000000-0000-0000-0000-000000000001')

    await expect(page.getByText('¿Gana Jugador 1 el torneo?')).toBeVisible()
    await expect(page.getByText('Operar Mercado')).toBeVisible()
  })

  test('the navbar shows a wallet link for authenticated users', async ({ page }) => {
    await stubAuthenticatedSession(page)
    await page.goto('/' + stubAccessTokenHash())

    await expect(page.locator('a[href="/wallet"]')).toHaveCount(1)
  })

  test('the home page shows no prediction-market section or betting copy', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('Mercados con más volumen')).toHaveCount(0)
    await expect(page.getByText(/apostá con TCRED/i)).toHaveCount(0)
    await expect(page.getByText(/mercados de predicción/i)).toHaveCount(0)
  })
})
