// Mercados de apuesta mock, uno por partido, al estilo Polymarket: se apuesta
// "Sí" o "No" a que gane el jugador A, el precio de "Sí" (entre 0 y 1) es la
// probabilidad implícita que el mercado le da a ese resultado.
import { createRng, randInt } from '../lib/rng.js'
import { MATCHES } from './matches.js'
import { getPlayerById } from './players.js'
import { calculatePrediction } from '../lib/prediction.js'

function seedFromId(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return h
}

function buildPriceHistory(rng, target, points = 18) {
  const history = []
  let price = 0.5
  const now = Date.now()
  for (let i = 0; i < points; i++) {
    const pull = (target - price) * 0.18
    const noise = (rng() - 0.5) * 0.08
    price = Math.min(0.96, Math.max(0.04, price + pull + noise))
    history.push({
      t: new Date(now - (points - i) * 3 * 60 * 60 * 1000).toISOString(),
      price: Number(price.toFixed(3)),
    })
  }
  return history
}

function buildMarket(match) {
  const rng = createRng(seedFromId(match.id))
  const playerA = getPlayerById(match.playerAId)
  const playerB = getPlayerById(match.playerBId)
  const { probA } = calculatePrediction(playerA, playerB, match.gameId)

  const resolved = match.status === 'finished'
  const target = resolved
    ? match.winnerId === playerA.id
      ? 0.95
      : 0.05
    : Math.min(0.9, Math.max(0.1, probA + (rng() - 0.5) * 0.2))

  const priceHistory = buildPriceHistory(rng, target)
  const yesPrice = priceHistory[priceHistory.length - 1].price

  return {
    id: `mkt-${match.id}`,
    matchId: match.id,
    gameId: match.gameId,
    question: `¿Gana ${playerA.username}?`,
    yesPrice,
    volumeTCRED: randInt(rng, 800, 42000),
    priceHistory,
    resolved,
    resolvedSide: resolved ? (match.winnerId === playerA.id ? 'YES' : 'NO') : null,
  }
}

export const MARKETS = MATCHES.map(buildMarket)

export const getMarketById = (id) => MARKETS.find((m) => m.id === id)

export const getMarketByMatchId = (matchId) =>
  MARKETS.find((m) => m.matchId === matchId)

export const topMarketsByVolume = (limit = 6) =>
  [...MARKETS].sort((a, b) => b.volumeTCRED - a.volumeTCRED).slice(0, limit)
