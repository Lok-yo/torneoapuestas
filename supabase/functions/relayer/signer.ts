// Pure(ish) relayer signing helpers, split out from index.ts so the
// "signer key never leaves this module" invariant can be unit-tested with
// `deno test` in isolation from any live RPC/broadcast call. The private
// key is read once from Supabase secrets (`Deno.env.get`), used only to
// derive a viem local account, and never placed on any object this module
// returns, logs, or serializes. See tasks.md 2.3/10.1 and design.md
// "signer key held only in Supabase secrets".

import { privateKeyToAccount } from 'https://esm.sh/viem@2/accounts?bundle'
import { encodeFunctionData, keccak256, toBytes } from 'https://esm.sh/viem@2?bundle'
import { resultRefPreimage } from '../_shared/settlement-mapping.js'

const POST_RESULT_ABI = [
  {
    type: 'function',
    name: 'postResult',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'questionId', type: 'bytes32' },
      { name: 'winningIndex', type: 'uint8' },
      { name: 'resultRef', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const

/** Public-only description of a postResult call: contract address, calldata,
 * and the relayer's own (public) address. Deliberately excludes anything
 * that could reconstruct the private key. Safe to log/return/serialize. */
export interface PostResultBundle {
  to: string
  data: string
  from: string
  questionId: string
  winningIndex: number
}

export interface RelayerAccount {
  address: string
  signTransaction: (tx: unknown) => Promise<string>
}

/** Derives a viem local account from a raw private key. The key itself is
 * captured only in this function's closure and the account object viem
 * returns internally — never assigned to any field this module exposes. */
export function createRelayerAccount(privateKeyHex: string): RelayerAccount {
  const account = privateKeyToAccount(privateKeyHex as `0x${string}`)
  return {
    address: account.address,
    // deno-lint-ignore no-explicit-any
    signTransaction: (tx: any) => account.signTransaction(tx),
  }
}

/** Builds the public calldata bundle for `ResolutionAdapter.postResult`.
 * Takes only the relayer's public address, never the private key. */
export function buildPostResultBundle(
  resolutionAdapterAddress: string,
  relayerAddress: string,
  questionId: string,
  winningIndex: number,
  resultRef: string,
): PostResultBundle {
  const data = encodeFunctionData({
    abi: POST_RESULT_ABI,
    functionName: 'postResult',
    args: [questionId as `0x${string}`, winningIndex, resultRef as `0x${string}`],
  })

  return {
    to: resolutionAdapterAddress,
    data,
    from: relayerAddress,
    questionId,
    winningIndex,
  }
}

/** Deterministically derives the on-chain resultRef (bytes32) for a
 * tournament_sets row's startgg_set_id. Reuses resultRefPreimage from
 * settlement-mapping.js — the SAME preimage the local settlement loop
 * hashes (scripts/settlement/tick.mjs) — so both paths always agree on
 * resultRef for a given set. See spec "resultRef Derivation" and
 * design.md "Data Flow". */
export function buildResultRef(startggSetId: string | number): string {
  return keccak256(toBytes(resultRefPreimage(startggSetId)))
}

/** Fields explicitly denylisted from every relayer log line / HTTP
 * response — defense in depth even though no code path here ever reads
 * the raw key into a loggable object. */
export const SECRET_ENV_KEYS = ['RELAYER_PRIVATE_KEY'] as const

/** Redacts any denylisted secret env var value that might appear
 * (accidentally, or via a future change) inside a string before it is
 * logged or returned in an HTTP response. */
export function redactSecrets(input: string, env: (key: string) => string | undefined = Deno.env.get): string {
  let redacted = input
  for (const key of SECRET_ENV_KEYS) {
    const value = env(key)
    if (value && value.length > 0) {
      redacted = redacted.split(value).join('[REDACTED]')
    }
  }
  return redacted
}
