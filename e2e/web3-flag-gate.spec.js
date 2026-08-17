// RED (now GREEN against src/config/featureFlags.js, src/App.jsx): proves
// the web3 routes are registered but resolve to NotFoundPage while
// FEATURE_FLAGS.web3 is off (default — no VITE_FEATURE_WEB3 override in
// the standard `npm run build` used by this suite's webServer). Mirrors
// e2e/no-financial-ui.spec.js's proof pattern exactly. See tasks.md 13.3
// and design.md Decision 7.
import { test, expect } from '@playwright/test'

test.describe('Web3 routes resolve to NotFoundPage while FEATURE_FLAGS.web3 is off', () => {
  test('the permissionless market-creation route 404s', async ({ page }) => {
    await page.goto('/mercados/nuevo')

    await expect(page.getByText('404')).toBeVisible()
    await expect(page.getByText('No encontramos esta página.')).toBeVisible()
  })

  test('the legacy /mercados/:id route still renders the existing (non-web3) market detail page, never a wallet-connect prompt', async ({ page }) => {
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
    await expect(page.getByText('Conectá tu wallet')).toHaveCount(0)
    await expect(page.getByText(/Conectar con/)).toHaveCount(0)
  })
})
