// GREEN against 0023 financial audit fixes: proves that /wallet and
// /mercados/:id both resolve to NotFoundPage when FEATURE_FLAGS.web3 is
// off (default). The old "wallet & ledger page" and "market detail from
// Supabase" tests are replaced with 404-assertion tests — these routes
// are now web3-gated at the router level, not just internally. See
// tasks.md 5.6/5.7 and 0023_financial_audit_fixes.sql.
import { test, expect } from '@playwright/test'

test.describe('Production build excludes all financial/prediction-market UI', () => {
  test('the wallet route 404s when web3 is off — no legacy TCRED wallet', async ({ page }) => {
    await page.goto('/wallet')

    await expect(page.getByText('404')).toBeVisible()
    await expect(page.getByText('No encontramos esta página.')).toBeVisible()
  })

  test('the market-detail route 404s when web3 is off — no legacy prediction UI', async ({ page }) => {
    await page.goto('/mercados/00000000-0000-0000-0000-000000000001')

    await expect(page.getByText('404')).toBeVisible()
    await expect(page.getByText('No encontramos esta página.')).toBeVisible()
  })

  test('the home page shows no prediction-market section or betting copy', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('Mercados con más volumen')).toHaveCount(0)
    await expect(page.getByText(/apostá con TCRED/i)).toHaveCount(0)
    await expect(page.getByText(/mercados de predicción/i)).toHaveCount(0)
  })
})
