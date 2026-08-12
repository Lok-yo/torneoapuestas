// Rating repository: the public leaderboard/player-history projection,
// read straight from public_leaderboard_view / public_player_history_view
// (0005_public_views.sql) — never rating_events/rating_snapshots directly,
// which are RLS-locked to admin only. Both views already expose their own
// version/freshness columns so a caller can tell a stale/incomplete read
// apart from a genuinely empty one. See rating-projections spec "Public
// leaderboard and privacy boundary".
import { supabase } from '../lib/supabase.js'
import { toAppError } from '../lib/errors.js'
import { assertAdapterAvailable } from './adapterAvailability.js'

function assertConfigured() {
  assertAdapterAvailable('ratings', 'El ranking no está disponible ahora mismo.')
}

/**
 * @param {string|null} [gameId] - filters to one game's ranking, or the full cross-game leaderboard when omitted.
 * @returns {Promise<Array<{game_id: string, username: string, rating: number, version: number, computed_at: string}>>}
 */
export async function getLeaderboard(gameId) {
  assertConfigured()
  let query = supabase.from('public_leaderboard_view').select('*')
  if (gameId) query = query.eq('game_id', gameId)

  const { data, error } = await query.order('rating', { ascending: false })
  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return data ?? []
}

/**
 * @param {string} username
 * @returns {Promise<Array<{game_id: string, username: string, rating: number, version: number, computed_at: string}>>}
 */
export async function getPlayerRatings(username) {
  assertConfigured()
  const { data, error } = await supabase
    .from('public_leaderboard_view')
    .select('*')
    .eq('username', username)
    .order('game_id', { ascending: true })

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return data ?? []
}

/**
 * @param {string} username
 * @param {string|null} [gameId] - filters to one game's history, or every game when omitted.
 * @returns {Promise<Array<{username: string, game_id: string, delta: number, version: number, review_state: string, effective_at: string}>>}
 */
export async function getPlayerHistory(username, gameId) {
  assertConfigured()
  let query = supabase.from('public_player_history_view').select('*').eq('username', username)
  if (gameId) query = query.eq('game_id', gameId)

  const { data, error } = await query.order('effective_at', { ascending: false })
  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return data ?? []
}
