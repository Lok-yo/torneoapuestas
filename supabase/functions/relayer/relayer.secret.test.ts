// Threat-matrix RED (now GREEN against signer.ts): the relayer's signer
// private key must NEVER appear in the postResult bundle, in any log
// line, or in the function's HTTP response — only the Supabase secret
// itself may ever hold it. See tasks.md 2.3/10.1 and design.md "signer
// key held only in Supabase secrets".

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1'
import { buildPostResultBundle, createRelayerAccount, redactSecrets } from './signer.ts'

// Well-known Anvil/Foundry default test account #0 private key — public
// test fixture, never a real secret. Used only to prove the redaction
// logic works; using a *real* secret in a test would defeat the point.
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

Deno.test('createRelayerAccount: returned object exposes only the public address, never the private key', () => {
  const account = createRelayerAccount(TEST_PRIVATE_KEY)

  assertEquals(Object.keys(account).sort(), ['address', 'signTransaction'])
  assertFalse(account.address.toLowerCase().includes(TEST_PRIVATE_KEY.slice(2).toLowerCase()))

  const serialized = JSON.stringify({ address: account.address })
  assertFalse(serialized.includes(TEST_PRIVATE_KEY), 'serialized account object must never contain the raw private key')
})

Deno.test('buildPostResultBundle: bundle is fully public-safe (no signer key material)', () => {
  const account = createRelayerAccount(TEST_PRIVATE_KEY)
  const bundle = buildPostResultBundle(
    '0x00000000000000000000000000000000000adapter'.slice(0, 42),
    account.address,
    '0x' + '11'.repeat(32),
    0,
    '0x' + '22'.repeat(32),
  )

  const serializedBundle = JSON.stringify(bundle)
  assertFalse(serializedBundle.includes(TEST_PRIVATE_KEY), 'bundle JSON must never contain the raw private key')
  assertFalse(serializedBundle.toLowerCase().includes('privatekey'), 'bundle must not even carry a privateKey field name')

  // Bundle is exactly the public shape a relayer would broadcast/log —
  // nothing else.
  assertEquals(Object.keys(bundle).sort(), ['data', 'from', 'questionId', 'to', 'winningIndex'])
})

Deno.test('redactSecrets: strips the configured secret env var value from any string before logging/response', () => {
  const fakeEnv = (key: string) => (key === 'RELAYER_PRIVATE_KEY' ? TEST_PRIVATE_KEY : undefined)

  const logLine = `relayer signing with key=${TEST_PRIVATE_KEY} for questionId=0xabc`
  const redacted = redactSecrets(logLine, fakeEnv)

  assertFalse(redacted.includes(TEST_PRIVATE_KEY), 'redacted output must not contain the raw key')
  assert(redacted.includes('[REDACTED]'), 'redacted output must show the redaction marker in place of the key')
})

Deno.test('redactSecrets: no-op when the secret env var is unset (nothing to leak)', () => {
  const fakeEnv = (_key: string) => undefined
  const input = 'no secrets here'
  assertEquals(redactSecrets(input, fakeEnv), input)
})
