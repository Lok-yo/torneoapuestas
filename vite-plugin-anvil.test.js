import { describe, expect, it } from 'vitest'

import { resolveWalletAccount } from './vite-plugin-anvil.js'

describe('Anvil helper wallet isolation', () => {
  it('uses the unlocked Anvil deployer address in demo mode', () => {
    expect(
      resolveWalletAccount(
        { VITE_DEMO_ANVIL: 'true', ANVIL_RPC_URL: 'http://anvil:8545' },
        'http://anvil:8545',
      ),
    ).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
  })

  it('requires an explicit private key outside demo mode', () => {
    expect(() =>
      resolveWalletAccount({}, 'https://rpc-amoy.polygon.technology'),
    ).toThrow('DEPLOYER_PRIVATE_KEY is required outside demo Anvil')
  })

  it('creates a local account from an explicit non-demo private key', () => {
    const account = resolveWalletAccount(
      { DEPLOYER_PRIVATE_KEY: `0x${'11'.repeat(32)}` },
      'https://rpc-amoy.polygon.technology',
    )

    expect(account.type).toBe('local')
  })
})
