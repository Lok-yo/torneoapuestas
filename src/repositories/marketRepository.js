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
    .select('*, market_outcomes!market_outcomes_market_id_fkey(*)')

  if (tournamentId) {
    query = query.eq('tournament_id', tournamentId)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
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
    .select('*, market_outcomes!market_outcomes_market_id_fkey(*)')
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

/**
 * Opens (or returns) the custodial match market for a start.gg set.
 * Outcomes are labeled with the two player names.
 */
function throwIfMissingSetMarketRpc(error) {
  const msg = String(error?.message ?? '')
  if (error?.code === 'PGRST202' || msg.includes('ensure_set_market') || msg.includes('ensure_tournament_set_markets')) {
    throw toAppError({
      error: {
        code: 'UNAVAILABLE',
        message: 'Falta aplicar la migración 0027 (líneas de apuesta) en Supabase.',
      },
    })
  }
}

export async function ensureSetMarket(tournamentId, startggSetId) {
  assertConfigured()
  const { data, error } = await supabase.rpc('ensure_set_market', {
    p_tournament_id: tournamentId,
    p_startgg_set_id: startggSetId,
  })
  if (error) {
    throwIfMissingSetMarketRpc(error)
    throw toAppError(error)
  }
  return data
}

/**
 * Ensures a match market exists for every named TOP-8 set in a tournament.
 * @returns {Promise<Array<object>>}
 */
export async function ensureTournamentSetMarkets(tournamentId) {
  assertConfigured()
  const { data, error } = await supabase.rpc('ensure_tournament_set_markets', {
    p_tournament_id: tournamentId,
  })
  if (error) {
    throwIfMissingSetMarketRpc(error)
    throw toAppError(error)
  }
  return Array.isArray(data) ? data : []
}

/**
 * Current user's positions across all markets, with market + outcome labels.
 */
export async function listMyBets() {
  assertConfigured()
  const { data, error } = await supabase
    .from('market_positions')
    .select(
      'id, shares, avg_price, created_at, updated_at, market_id, outcome_id, market:markets(id, question, status, category, tournament_id, resolution_outcome_id, startgg_set_id), outcome:market_outcomes(id, label, price)',
    )
    .gt('shares', 0)
    .order('updated_at', { ascending: false })

  if (error) {
    if (String(error.message ?? '').includes('startgg_set_id')) {
      const retry = await supabase
        .from('market_positions')
        .select(
          'id, shares, avg_price, created_at, updated_at, market_id, outcome_id, market:markets(id, question, status, category, tournament_id, resolution_outcome_id), outcome:market_outcomes(id, label, price)',
        )
        .gt('shares', 0)
        .order('updated_at', { ascending: false })
      if (retry.error) throw toAppError(retry.error)
      return retry.data ?? []
    }
    throw toAppError(error)
  }
  return data ?? []
}
