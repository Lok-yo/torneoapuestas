// Torneos mock, uno por juego, con distintos estados para mostrar variedad
// (próximo / en vivo / finalizado) en toda la app.
import { GAMES } from './games.js'
import { playersForGame } from './players.js'

const DAY = 24 * 60 * 60 * 1000
// "Hoy" fijo para que los datos mock sean estables entre recargas.
const TODAY = new Date('2026-08-09T12:00:00Z').getTime()

const TOURNAMENT_PLAN = {
  ssbu: { status: 'live', offsetDays: -1, format: 'Doble eliminación' },
  melee: { status: 'finished', offsetDays: -21, format: 'Doble eliminación' },
  sf6: { status: 'upcoming', offsetDays: 6, format: 'Suizo + Bracket final' },
  'fatal-fury': { status: 'live', offsetDays: -1, format: 'Simple eliminación' },
  tekken8: { status: 'upcoming', offsetDays: 13, format: 'Doble eliminación' },
  roa2: { status: 'finished', offsetDays: -28, format: 'Simple eliminación' },
}

function buildTournament(game) {
  const plan = TOURNAMENT_PLAN[game.id]
  const participants = playersForGame(game.id)
  return {
    id: `t-${game.id}`,
    gameId: game.id,
    name: `${game.shortName} Open`,
    status: plan.status,
    startDate: new Date(TODAY + plan.offsetDays * DAY).toISOString(),
    format: plan.format,
    participantIds: participants.map((p) => p.id),
    prizePoolTCRED: 5000 + participants.length * 250,
  }
}

export const TOURNAMENTS = GAMES.map(buildTournament)

export const getTournamentById = (id) => TOURNAMENTS.find((t) => t.id === id)

export const tournamentsForGame = (gameId) =>
  TOURNAMENTS.filter((t) => t.gameId === gameId)
