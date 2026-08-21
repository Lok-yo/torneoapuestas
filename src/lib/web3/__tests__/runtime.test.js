import { describe, expect, it } from 'vitest'
import { isDemoAnvil, resolveBrowserRpcUrl, resolveInternalRpcUrl } from '../runtime.js'

describe('demo runtime configuration', () => {
  it('keeps Anvil helpers enabled behind a non-loopback proxy path', () => {
    expect(isDemoAnvil({ VITE_DEMO_ANVIL: 'true' }, '/rpc')).toBe(true)
  })

  it('preserves the existing loopback development behavior', () => {
    expect(isDemoAnvil({}, 'http://127.0.0.1:8545')).toBe(true)
    expect(isDemoAnvil({}, 'https://rpc-amoy.polygon.technology')).toBe(false)
  })

  it('turns the same-origin path into an absolute MetaMask RPC URL', () => {
    expect(resolveBrowserRpcUrl('/rpc', 'https://student.idgs8-2.tech')).toBe(
      'https://student.idgs8-2.tech/rpc',
    )
  })

  it('keeps an absolute RPC URL unchanged', () => {
    expect(resolveBrowserRpcUrl('http://127.0.0.1:8545', 'https://student.idgs8-2.tech')).toBe(
      'http://127.0.0.1:8545',
    )
  })

  it('keeps the internal Anvil URL separate from the browser URL', () => {
    expect(resolveInternalRpcUrl({ ANVIL_RPC_URL: 'http://anvil:8545', VITE_AMOY_RPC_URL: '/rpc' })).toBe(
      'http://anvil:8545',
    )
  })
})
