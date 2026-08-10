// Partidos mock generados a partir de los torneos, armando un bracket simple
// (cuartos -> semifinal -> final para 8 participantes). El ganador de cada
// partido ya jugado se decide con la misma fórmula de predicción que se
// muestra en los mercados, para que el resultado sea coherente con el rating
// de cada jugador (con algo de azar, para permitir sorpresas).
import { createRng } from '../lib/rng.js'
import { TOURNAMENTS } from './tournaments.js'
import { getPlayerById } from './players.js'
import { calculatePrediction } from '../lib/prediction.js'

const ROUND_NAMES = ['Cuartos de final', 'Semifinal', 'Final']
const HALF_HOUR = 30 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

function simulateWinner(rng, playerA, playerB, gameId) {
  const { probA } = calculatePrediction(playerA, playerB, gameId)
  return rng() < probA ? playerA : playerB
}

function buildTournamentMatches(rng, tournament) {
  const participants = tournament.participantIds.map(getPlayerById)
  const totalRounds = Math.log2(participants.length)
  const resolvedRounds =
    tournament.status === 'finished' ? totalRounds : tournament.status === 'live' ? 1 : 0

  const matches = []
  let currentRoundPlayers = participants
  const baseTime = new Date(tournament.startDate).getTime()

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex++) {
    if (tournament.status === 'upcoming' && roundIndex > 0) break

    const isResolvedRound = roundIndex < resolvedRounds
    const isLiveRound = tournament.status === 'live' && roundIndex === resolvedRounds
    const nextRoundPlayers = []

    for (let i = 0; i < currentRoundPlayers.length; i += 2) {
      const playerA = currentRoundPlayers[i]
      const playerB = currentRoundPlayers[i + 1]
      const scheduledAt = new Date(
        baseTime + roundIndex * 2 * DAY + i * HALF_HOUR,
      ).toISOString()

      let status = 'scheduled'
      let winnerId = null
      if (isResolvedRound) {
        const winner = simulateWinner(rng, playerA, playerB, tournament.gameId)
        winnerId = winner.id
        status = 'finished'
        nextRoundPlayers.push(winner)
      } else if (isLiveRound) {
        status = 'live'
      }

      matches.push({
        id: `${tournament.id}-m${matches.length + 1}`,
        tournamentId: tournament.id,
        gameId: tournament.gameId,
        round: roundIndex + 1,
        roundName: ROUND_NAMES[roundIndex] ?? `Ronda ${roundIndex + 1}`,
        playerAId: playerA.id,
        playerBId: playerB.id,
        status,
        scheduledAt,
        winnerId,
      })
    }

    if (!isResolvedRound) break // ronda en vivo o próxima: no generamos rondas futuras (TBD)
    currentRoundPlayers = nextRoundPlayers
  }

  return matches
}

function buildMatches() {
  const rng = createRng(7)
  return TOURNAMENTS.flatMap((t) => buildTournamentMatches(rng, t))
}

export const MATCHES = buildMatches()

export const getMatchById = (id) => MATCHES.find((m) => m.id === id)

export const matchesForTournament = (tournamentId) =>
  MATCHES.filter((m) => m.tournamentId === tournamentId)
