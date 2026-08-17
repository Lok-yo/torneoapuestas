import { supabase } from '../lib/supabase.js'
import { toAppError } from '../lib/errors.js'
import { assertAdapterAvailable } from './adapterAvailability.js'

function assertConfigured() {
  assertAdapterAvailable('identity', 'Los mercados de predicción no están disponibles ahora mismo.')
}

/**
 * Fetch open or all prediction markets.
 * @param {string} [tournamentId]
 * @returns {Promise<Array<object>>}
 */
export async function listMarkets(tournamentId) {
  assertConfigured()
  let query = supabase
    .from('markets')
    .select('*, market_outcomes(*)')
    .order('created_at', { ascending: false })

  if (tournamentId) {
    query = query.eq('tournament_id', tournamentId)
  }

  const { data, error } = await query
  if (error) throw toAppError(error)
  return data ?? []
}

/**
 * Fetch detailed market info including outcomes and current user's positions.
 * @param {string} marketId
 * @returns {Promise<{market: object, outcomes: Array<object>, userPositions: Array<object>}>}
 */
export async function getMarketDetails(marketId) {
  assertConfigured()
  const { data: market, error: mErr } = await supabase
    .from('markets')
    .select('*, market_outcomes(*)')
    .eq('id', marketId)
    .single()

  if (mErr) throw toAppError(mErr)

  const { data: userPositions } = await supabase
    .from('market_positions')
    .select('*')
    .eq('market_id', marketId)

  return {
    market,
    outcomes: market.market_outcomes ?? [],
    userPositions: userPositions ?? [],
  }
}

/**
 * Create a new prediction market (organizer or admin only).
 * @param {string|null} tournamentId
 * @param {string} question
 * @param {string} [category]
 */
export async function createPredictionMarket(tournamentId, question, category = 'TOURNAMENT') {
  assertConfigured()
  const { data, error } = await supabase.rpc('create_prediction_market', {
    p_tournament_id: tournamentId,
    p_question: question,
    p_category: category,
  })
  if (error) throw toAppError(error)
  return data?.[0]
}

/**
 * Buy shares for a specific market outcome.
 * @param {string} marketId
 * @param {string} outcomeId
 * @param {number} shares
 */
export async function buyMarketShares(marketId, outcomeId, shares) {
  assertConfigured()
  const { data, error } = await supabase.rpc('buy_market_shares', {
    p_market_id: marketId,
    p_outcome_id: outcomeId,
    p_shares: shares,
  })
  if (error) throw toAppError(error)
  return data?.[0]
}

/**
 * Resolve a market and pay out winning share holders (organizer or admin only).
 * @param {string} marketId
 * @param {string} winningOutcomeId
 */
export async function resolveMarket(marketId, winningOutcomeId) {
  assertConfigured()
  const { data, error } = await supabase.rpc('resolve_market', {
    p_market_id: marketId,
    p_winning_outcome_id: winningOutcomeId,
  })
  if (error) throw toAppError(error)
  return data?.[0]
}
