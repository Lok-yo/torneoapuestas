// Jugadores mock. Todos los nombres son ficticios (gamertags inventados),
// pensado para mapear después a una tabla `players` de Supabase ligada al
// usuario autenticado con Google.
import { createRng, randInt } from '../lib/rng.js'

const PLAYER_NAMES = [
  'NovaStrike', 'GlacialFox', 'RuinKazan', 'EmberVolt', 'CrimsonWisp',
  'ObsidianLynx', 'VoltageQueen', 'ShadowMerak', 'AzureFang', 'PhantomReiko',
  'IroncladYuki', 'SolsticeDrake', 'MysticHollow', 'TempestRook', 'VelvetHavoc',
  'FrostbiteJinx', 'RogueCipher', 'StormShade', 'LunarWraith', 'BlazeCorvid',
  'SilentAmara', 'ThornVex', 'GaleQuartz', 'EchoRaven',
]

// 8 jugadores por juego (con overlap entre juegos, como en la escena real de
// jugadores que compiten en varios títulos de lucha).
const GAME_ROSTER = {
  ssbu: ['NovaStrike', 'GlacialFox', 'RuinKazan', 'EmberVolt', 'CrimsonWisp', 'ObsidianLynx', 'VoltageQueen', 'ShadowMerak'],
  melee: ['AzureFang', 'PhantomReiko', 'IroncladYuki', 'SolsticeDrake', 'MysticHollow', 'TempestRook', 'NovaStrike', 'GlacialFox'],
  sf6: ['VelvetHavoc', 'FrostbiteJinx', 'RogueCipher', 'StormShade', 'LunarWraith', 'BlazeCorvid', 'RuinKazan', 'EmberVolt'],
  'fatal-fury': ['SilentAmara', 'ThornVex', 'GaleQuartz', 'EchoRaven', 'CrimsonWisp', 'ObsidianLynx', 'VelvetHavoc', 'FrostbiteJinx'],
  tekken8: ['RogueCipher', 'StormShade', 'LunarWraith', 'BlazeCorvid', 'VoltageQueen', 'ShadowMerak', 'SilentAmara', 'ThornVex'],
  roa2: ['AzureFang', 'PhantomReiko', 'IroncladYuki', 'SolsticeDrake', 'GaleQuartz', 'EchoRaven', 'MysticHollow', 'TempestRook'],
}

function genRecentForm(rng, winRate, length = 5) {
  return Array.from({ length }, () => (rng() < winRate ? 'W' : 'L'))
}

function buildPlayers() {
  const rng = createRng(42)
  const byUsername = new Map(
    PLAYER_NAMES.map((username, i) => [
      username,
      {
        id: `p${i + 1}`,
        username,
        joinedAt: new Date(2025, i % 12, ((i * 3) % 27) + 1).toISOString(),
        games: [],
      },
    ]),
  )

  for (const [gameId, roster] of Object.entries(GAME_ROSTER)) {
    for (const username of roster) {
      const player = byUsername.get(username)
      const rating = randInt(rng, 950, 2180)
      const wins = randInt(rng, 8, 60)
      const losses = randInt(rng, 4, 55)
      const winRate = wins / (wins + losses)
      player.games.push({
        gameId,
        rating,
        wins,
        losses,
        recentForm: genRecentForm(rng, winRate),
      })
    }
  }

  return Array.from(byUsername.values())
}

export const PLAYERS = buildPlayers()

export const getPlayerById = (id) => PLAYERS.find((p) => p.id === id)

export const getPlayerByUsername = (username) =>
  PLAYERS.find((p) => p.username.toLowerCase() === username.toLowerCase())

export const getPlayerGameStats = (player, gameId) =>
  player?.games?.find((g) => g.gameId === gameId)

/** Rating promedio del jugador entre todos los juegos que juega — usado como "puntos" generales. */
export const overallRating = (player) => {
  if (!player.games.length) return 0
  const sum = player.games.reduce((acc, g) => acc + g.rating, 0)
  return Math.round(sum / player.games.length)
}

export const overallRecord = (player) =>
  player.games.reduce(
    (acc, g) => ({ wins: acc.wins + g.wins, losses: acc.losses + g.losses }),
    { wins: 0, losses: 0 },
  )

export const playersForGame = (gameId) =>
  PLAYERS.filter((p) => p.games.some((g) => g.gameId === gameId))
