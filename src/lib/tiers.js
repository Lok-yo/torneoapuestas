// Sistema de rangos (tiers) por puntaje, similar al de un ranked de videojuego
// competitivo. El "rating" de un jugador en un juego determina su tier y un
// nivel de progreso (1-5) dentro de ese tier.

export const TIERS = [
  { name: 'Bronce', min: 0, color: '#c2795a' },
  { name: 'Plata', min: 1200, color: '#b9c2cc' },
  { name: 'Oro', min: 1400, color: '#facc15' },
  { name: 'Platino', min: 1600, color: '#5eead4' },
  { name: 'Diamante', min: 1800, color: '#60a5fa' },
  { name: 'Master', min: 2000, color: '#f472b6' },
]

const STEP = 40 // ancho, en puntos, de cada uno de los 5 niveles dentro de un tier

/** Dado un rating, devuelve { tier, color, level, progress, nextTierIn } */
export function getTierInfo(rating = 0) {
  let tierIndex = 0
  for (let i = 0; i < TIERS.length; i++) {
    if (rating >= TIERS[i].min) tierIndex = i
  }
  const tier = TIERS[tierIndex]
  const nextTier = TIERS[tierIndex + 1]
  const span = nextTier ? nextTier.min - tier.min : STEP * 5
  const within = Math.min(rating - tier.min, span)
  const level = Math.min(5, 1 + Math.floor((within / span) * 5))
  const progress = Math.min(1, within / span)
  const nextTierIn = nextTier ? Math.max(0, nextTier.min - rating) : null

  return {
    tier: tier.name,
    color: tier.color,
    level,
    progress,
    nextTier: nextTier?.name ?? null,
    nextTierIn,
  }
}
