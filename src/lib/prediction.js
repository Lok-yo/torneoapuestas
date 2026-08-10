// ---------------------------------------------------------------------------
// PLACEHOLDER: motor de predicción determinístico.
//
// Esto NO es un modelo de machine learning entrenado — es una fórmula simple
// y transparente (tipo Elo) que combina el rating, el nivel/tier y la forma
// reciente de cada jugador para estimar una probabilidad de victoria. Sirve
// como base funcional de "un sistema que en base al nivel, puntos y todo lo
// que tenga un jugador va a predecir quién va a ganar". En una etapa futura
// esto se reemplazaría por un modelo entrenado con datos reales de partidos
// (Supabase + un job de entrenamiento), manteniendo la misma forma de salida
// para no romper la UI que lo consume.
// ---------------------------------------------------------------------------

/** Probabilidad esperada de victoria estilo Elo, en base a la diferencia de rating. */
function eloExpectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
}

/** Win rate de los últimos partidos de un jugador (0.5 si no hay historial). */
function recentFormRate(recentForm = []) {
  if (!recentForm.length) return 0.5
  const wins = recentForm.filter((r) => r === 'W').length
  return wins / recentForm.length
}

/**
 * Calcula la predicción de un enfrentamiento entre dos jugadores para un juego dado.
 * @returns {{ probA: number, probB: number, factors: Array<{label: string, probA: number}> }}
 */
export function calculatePrediction(playerA, playerB, gameId) {
  const statsA = playerA?.games?.find((g) => g.gameId === gameId)
  const statsB = playerB?.games?.find((g) => g.gameId === gameId)

  if (!statsA || !statsB) {
    return {
      probA: 0.5,
      probB: 0.5,
      factors: [{ label: 'Datos insuficientes', probA: 0.5 }],
    }
  }

  const eloA = eloExpectedScore(statsA.rating, statsB.rating)
  const formA = recentFormRate(statsA.recentForm)
  const formB = recentFormRate(statsB.recentForm)
  // normalizamos la forma reciente relativa entre ambos jugadores
  const formShareA = formA + formB === 0 ? 0.5 : formA / (formA + formB)

  const WEIGHT_ELO = 0.7
  const WEIGHT_FORM = 0.3
  const rawProbA = eloA * WEIGHT_ELO + formShareA * WEIGHT_FORM
  const probA = Math.min(0.95, Math.max(0.05, rawProbA))
  const probB = 1 - probA

  return {
    probA,
    probB,
    factors: [
      { label: 'Rating (Elo)', weight: WEIGHT_ELO, probA: eloA },
      { label: 'Forma reciente', weight: WEIGHT_FORM, probA: formShareA },
    ],
  }
}
