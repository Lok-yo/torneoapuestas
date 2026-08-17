// Optional 1:1 SIWE wallet<->GG2 account link (wallet-identity spec
// "Optional 1:1 SIWE Linking"). Signature verification happens
// client-side via the connecting wallet's own signMessage/viem
// verifyMessage (see src/lib/web3/siwe.js) — this repository only
// persists the resulting link and enforces the 1:1 invariant server-side
// via supabase/migrations/0020_wallet_and_onchain_cache.sql's
// link_wallet RPC (PK + UNIQUE constraints). NEVER required for trading
// — see spec "No Required GG2 Account for Trading".
import { supabase } from '../lib/supabase.js'
import { toAppError } from '../lib/errors.js'

/** @returns {Promise<{user_id: string, address: string}|null>} */
export async function getMyWalletLink() {
  const { data, error } = await supabase.from('wallet_links').select('user_id, address, chain_id, linked_at').maybeSingle()
  if (error) throw toAppError(error)
  return data ?? null
}

/**
 * @param {string} address
 * @param {number} chainId
 * @param {string} [nonce]
 */
export async function linkWallet(address, chainId, nonce) {
  const { data, error } = await supabase.rpc('link_wallet', { p_address: address, p_chain_id: chainId, p_siwe_nonce: nonce ?? null })
  if (error) throw toAppError(error)
  return data
}

export async function unlinkWallet() {
  const { error } = await supabase.rpc('unlink_wallet')
  if (error) throw toAppError(error)
}
