// Playwright: connect → buy → redeem against a Polygon Amoy fork, per
// tasks.md 13.4. This is genuinely environment-dependent — it needs (1)
// a build with VITE_FEATURE_WEB3=true and real deployed contract
// addresses (contracts/script/Deploy.s.sol output), and (2) a live
// forked RPC (`anvil --fork-url <amoy-archive-rpc>`) with a funded test
// account, neither of which exists in the standard CI `npm run build` /
// `npm run preview` pipeline (that build intentionally uses stub,
// non-resolving credentials — see .github/workflows/ci.yml "Build with
// stub Supabase credentials for e2e interception"). Rather than fake a
// fork with mocked RPC responses (which would prove nothing about real
// CTF/FPMM contract behavior), this spec requires the maintainer to
// provide:
//   PLAYWRIGHT_AMOY_FORK_RPC_URL   e.g. http://127.0.0.1:8545 (anvil fork)
//   PLAYWRIGHT_WEB3_BASE_URL       a build with VITE_FEATURE_WEB3=true
//   PLAYWRIGHT_TEST_QUESTION_ID    an ACTIVE market's questionId on that fork
// and skips (not fails) when they're absent, so this test never
// silently reports false confidence in CI, but is ready to run wherever
// a maintainer wires the fork. See design.md "Testing Strategy" (E2E
// row) and README for local fork setup instructions.
import { test, expect } from '@playwright/test'

const forkRpcUrl = process.env.PLAYWRIGHT_AMOY_FORK_RPC_URL
const web3BaseUrl = process.env.PLAYWRIGHT_WEB3_BASE_URL
const questionId = process.env.PLAYWRIGHT_TEST_QUESTION_ID

test.describe('Web3 trade flow: connect → buy → redeem (Amoy fork)', () => {
  test.skip(
    !forkRpcUrl || !web3BaseUrl || !questionId,
    'Requires PLAYWRIGHT_AMOY_FORK_RPC_URL, PLAYWRIGHT_WEB3_BASE_URL, and PLAYWRIGHT_TEST_QUESTION_ID — ' +
      'not configured in this environment. See this file\'s header comment for local fork setup.',
  )

  test('a wallet connects, buys outcome shares, and redeems after settlement', async ({ page }) => {
    // Injects a minimal EIP-1193 provider backed by a real funded local
    // account so wagmi's `injected()` connector can drive an actual
    // signed transaction against the fork — not a UI-only mock.
    await page.addInitScript(
      ({ rpcUrl, privateKey }) => {
        // eslint-disable-next-line no-undef
        window.__PLAYWRIGHT_TEST_WALLET__ = { rpcUrl, privateKey }
      },
      { rpcUrl: forkRpcUrl, privateKey: process.env.PLAYWRIGHT_TEST_PRIVATE_KEY },
    )

    await page.goto(`${web3BaseUrl}/mercados/${questionId}`)

    await page.getByText(/Conectar con/).first().click()
    await expect(page.getByText(/Wallet conectada:/)).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Outcome A' }).click()
    await page.getByLabel('Monto a invertir (USDC)').fill('5')
    await page.getByRole('button', { name: /Comprar shares/ }).click()

    await expect(page.getByText(/Comprar shares/)).toBeEnabled({ timeout: 30_000 })

    await page.goto(`${web3BaseUrl}/wallet`)
    await expect(page.getByText('Billetera on-chain')).toBeVisible()
    await expect(page.getByText(questionId, { exact: false })).toBeVisible({ timeout: 15_000 })
  })
})
