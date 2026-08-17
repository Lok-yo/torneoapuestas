// Read-only access to the Supabase on-chain cache tables
// (onchain_markets/onchain_positions/creation_bonds — see
// supabase/migrations/0020_wallet_and_onchain_cache.sql). Never a write
// path and never authoritative: on-chain state (read via
// src/lib/web3/hooks.js) remains the source of truth per
// onchain-prediction-markets spec "Collateral remains on-chain". This
// repository exists only so listing/browsing many markets doesn't cost
// one RPC call per market.
import { supabase } from '../lib/supabase.js'
import { toAppError } from '../lib/errors.js'

/** @returns {Promise<Array<object>>} */
export async function listOnchainMarkets() {
  const { data, error } = await supabase
    .from('onchain_markets')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw toAppError(error)
  return data ?? []
}

/** @param {string} address
 * @returns {Promise<Array<object>>} */
export async function listOnchainPositions(address) {
  if (!address) return []
  const { data, error } = await supabase
    .from('onchain_positions')
    .select('*')
    .ilike('holder_address', address)
    .gt('balance', 0)
  if (error) throw toAppError(error)
  return data ?? []
}

/** @param {string} conditionId
 * @returns {Promise<object|null>} */
export async function getOnchainMarketByConditionId(conditionId) {
  const { data, error } = await supabase.from('onchain_markets').select('*').eq('condition_id', conditionId).maybeSingle()
  if (error) throw toAppError(error)
  return data ?? null
}
