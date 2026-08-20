import { supabase } from '../supabase.js'
import { matchQuestionId } from './questionId.js'
import { getLang } from '../../i18n/lang.js'
import { es } from '../../i18n/es.js'
import { en } from '../../i18n/en.js'

export function marketStateCopy(state) {
  const dict = getLang() === 'en' ? en : es
  return dict.state[Number(state)] ?? dict.state[0]
}

export async function fetchSetCatalog() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('public_tournament_sets_view')
    .select('startgg_set_id, startgg_event_id, entrant_a_name, entrant_b_name, phase_name, round')
  if (error) return []
  return data ?? []
}

export function resolveQuestion(questionId, catalog) {
  const id = String(questionId || '').toLowerCase()
  if (!id) return null
  for (const set of catalog) {
    if (!set.startgg_event_id || !set.startgg_set_id) continue
    const hash = matchQuestionId(set.startgg_event_id, set.startgg_set_id).toLowerCase()
    if (hash === id) {
      const playerA = set.entrant_a_name || 'Jugador 1'
      const playerB = set.entrant_b_name || 'Jugador 2'
      return {
        playerA,
        playerB,
        matchup: `${playerA} vs ${playerB}`,
        round: set.round,
        phase: set.phase_name,
        eventId: set.startgg_event_id,
        setId: set.startgg_set_id,
      }
    }
  }
  return null
}

export function pickName(meta, outcomeIndex) {
  if (!meta) return null
  return Number(outcomeIndex) === 0 ? meta.playerA : meta.playerB
}
