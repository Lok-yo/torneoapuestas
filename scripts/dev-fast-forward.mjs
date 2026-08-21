#!/usr/bin/env node
// One-shot, local-only time-travel: advances the local Anvil chain past
// ResolutionAdapter.CHALLENGE_WINDOW (4h) + a safety margin, then mines a
// block, so a demo can reach settle()/claim() without waiting 4 real
// hours. NEVER runs against a non-localhost RPC — this is the design's
// Threat Matrix safety gate #1 (see design.md "Threat Matrix" and spec
// "Local Execution Mode"). The settlement loop itself never calls this —
// it is a separate, explicitly manual demo step (spec "Sequencing").
//
// The rest of this file (raw evm_* JSON-RPC calls) is manual-E2E only
// per design.md "Testing Strategy" — isLocalRpcHost is the one piece of
// pure logic worth a real unit test (dev-fast-forward.test.mjs).
// tasks.md 4.1/4.2.

import { loadEnvLocal } from './_env.mjs'

const CHALLENGE_WINDOW_SECONDS = 4 * 60 * 60
const SAFETY_MARGIN_SECONDS = 60

/**
 * Guards against ever advancing a real chain's clock. Only 127.0.0.1 and
 * localhost are accepted; anything else — including a malformed URL — is
 * rejected.
 * @param {string} rpcUrl
 * @returns {boolean}
 */
export function isLocalRpcHost(rpcUrl) {
  try {
    const { hostname } = new URL(rpcUrl)
    return hostname === '127.0.0.1' || hostname === 'localhost'
  } catch {
    return false
  }
}

async function rpc(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = await res.json()
  if (body.error) throw new Error(`${method} failed: ${JSON.stringify(body.error)}`)
  return body.result
}

async function main() {
  const env = loadEnvLocal()
  const rpcUrl = env.VITE_AMOY_RPC_URL

  if (!rpcUrl || !isLocalRpcHost(rpcUrl)) {
    console.error(
      `dev-fast-forward: refusing to run — VITE_AMOY_RPC_URL (${rpcUrl ?? 'unset'}) is not a localhost RPC. This script must never advance a real chain's clock.`,
    )
    process.exit(1)
  }

  const latest = await rpc(rpcUrl, 'eth_getBlockByNumber', ['latest', false])
  const currentTimestamp = Number(latest.timestamp)
  const nextTimestamp = currentTimestamp + CHALLENGE_WINDOW_SECONDS + SAFETY_MARGIN_SECONDS

  await rpc(rpcUrl, 'evm_setNextBlockTimestamp', [nextTimestamp])
  await rpc(rpcUrl, 'evm_mine', [])

  console.log(
    `dev-fast-forward: advanced local chain by ${CHALLENGE_WINDOW_SECONDS + SAFETY_MARGIN_SECONDS}s (past ResolutionAdapter.CHALLENGE_WINDOW). Next settlement-loop tick can now settle().`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`dev-fast-forward: failed — ${String(err)}`)
    process.exit(1)
  })
}
