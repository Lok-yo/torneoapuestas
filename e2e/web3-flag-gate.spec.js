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

  test('the custodial market-detail route stays reachable when web3 is off', async ({ page }) => {
    await page.goto('/mercados/00000000-0000-0000-0000-000000000001')

    await expect(page.getByText('404')).toHaveCount(0)
  })

  test('the wallet route requires a session instead of 404ing', async ({ page }) => {
    await page.goto('/wallet')

    await expect(page).toHaveURL(/\/login/)
  })
})
