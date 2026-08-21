// RED (Phase 4, task 4.1): isLocalRpcHost doesn't exist yet. The rest of
// dev-fast-forward.mjs (raw evm_* RPC calls) is manual-E2E only per
// design.md "Testing Strategy" — this pure guard predicate is the one
// piece of logic worth a real, mock-free unit test: it is the exact
// safety gate the design's Threat Matrix calls out ("dev-fast-forward.mjs
// aborts unless the RPC host is 127.0.0.1/localhost, so time-travel can
// never hit a real chain").

import { describe, expect, it } from 'vitest'
import { isLocalRpcHost } from '../dev-fast-forward.mjs'

describe('isLocalRpcHost', () => {
  it('accepts 127.0.0.1 and localhost RPC URLs', () => {
    expect(isLocalRpcHost('http://127.0.0.1:8545')).toBe(true)
    expect(isLocalRpcHost('http://localhost:8545')).toBe(true)
  })

  it('rejects a real, non-local RPC host (never time-travel a real chain)', () => {
    expect(isLocalRpcHost('https://polygon-amoy.g.alchemy.com/v2/some-key')).toBe(false)
    expect(isLocalRpcHost('https://rpc-amoy.polygon.technology')).toBe(false)
  })

  it('rejects a malformed URL rather than throwing', () => {
    expect(isLocalRpcHost('not-a-url')).toBe(false)
    expect(isLocalRpcHost('')).toBe(false)
  })
})
