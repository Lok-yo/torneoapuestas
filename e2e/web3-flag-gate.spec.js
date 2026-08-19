// GREEN against 0023 financial audit fixes: proves web3 routes
// (/mercados/nuevo, /mercados/:id) resolve to NotFoundPage while
// FEATURE_FLAGS.web3 is off (default). See design.md Decision 7 and
// 0023_financial_audit_fixes.sql.
import { test, expect } from '@playwright/test'

test.describe('Web3 routes resolve to NotFoundPage while FEATURE_FLAGS.web3 is off', () => {
  test('the permissionless market-creation route 404s', async ({ page }) => {
    await page.goto('/mercados/nuevo')

    await expect(page.getByText('404')).toBeVisible()
    await expect(page.getByText('No encontramos esta página.')).toBeVisible()
  })

  test('the market-detail route 404s when web3 is off — no legacy prediction-market UI', async ({ page }) => {
    await page.goto('/mercados/00000000-0000-0000-0000-000000000001')

    await expect(page.getByText('404')).toBeVisible()
    await expect(page.getByText('No encontramos esta página.')).toBeVisible()
  })

  test('the wallet route 404s when web3 is off — no legacy TCRED wallet UI', async ({ page }) => {
    await page.goto('/wallet')

    await expect(page.getByText('404')).toBeVisible()
    await expect(page.getByText('No encontramos esta página.')).toBeVisible()
  })
})
