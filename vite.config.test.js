import { afterEach, describe, expect, it, vi } from 'vitest'

const originalBrowserRpcUrl = process.env.VITE_AMOY_RPC_URL

async function loadDemoConfig(browserRpcUrl) {
  vi.resetModules()
  vi.stubEnv('VITE_DEMO_ANVIL', 'true')
  vi.stubEnv('ANVIL_RPC_URL', 'http://anvil:8545')
  vi.stubEnv('APP_HOST', 'student.idgs8-2.tech')
  vi.stubEnv('PORT', '3000')

  if (browserRpcUrl === undefined) {
    delete process.env.VITE_AMOY_RPC_URL
  } else {
    vi.stubEnv('VITE_AMOY_RPC_URL', browserRpcUrl)
  }

  return import('./vite.config.js')
}

afterEach(() => {
  vi.unstubAllEnvs()
  if (originalBrowserRpcUrl === undefined) delete process.env.VITE_AMOY_RPC_URL
  else process.env.VITE_AMOY_RPC_URL = originalBrowserRpcUrl
})

describe('Vite demo RPC configuration', () => {
  it('fails closed when the browser RPC URL is missing', async () => {
    await expect(loadDemoConfig()).rejects.toThrow(
      'VITE_AMOY_RPC_URL is required when VITE_DEMO_ANVIL=true.',
    )
  })

  it('fails closed when the browser RPC URL bypasses the same-origin proxy', async () => {
    await expect(loadDemoConfig('https://rpc-amoy.polygon.technology')).rejects.toThrow(
      'VITE_AMOY_RPC_URL must be exactly /rpc when VITE_DEMO_ANVIL=true.',
    )
  })

  it('accepts exactly the same-origin /rpc path', async () => {
    const { default: config } = await loadDemoConfig('/rpc')

    expect(config.server.proxy['/rpc'].target).toBe('http://anvil:8545')
  })
})
