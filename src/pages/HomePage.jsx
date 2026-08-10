import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { GAMES } from '../data/games.js'
import { TOURNAMENTS } from '../data/tournaments.js'
import { topMarketsByVolume } from '../data/markets.js'
import { useSessionStore } from '../store/useSessionStore.js'
import TournamentCard from '../components/TournamentCard.jsx'
import MarketCard from '../components/MarketCard.jsx'
import GameTag from '../components/GameTag.jsx'

export default function HomePage() {
  const user = useSessionStore((s) => s.user)
  const featured = TOURNAMENTS.filter((t) => t.status !== 'finished').slice(0, 3)
  const topMarkets = topMarketsByVolume(4)

  return (
    <div className="flex flex-col gap-14">
      <section className="flex flex-col items-start gap-4 rounded-3xl border border-zinc-800 bg-gradient-to-br from-violet-500/10 via-zinc-900 to-zinc-950 p-8 sm:p-12">
        <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
          Torneos + mercados de predicción
        </span>
        <h1 className="max-w-2xl text-3xl font-bold text-zinc-50 sm:text-5xl">
          Organizá torneos de lucha y apostá con TCRED en cada partido
        </h1>
        <p className="max-w-xl text-zinc-400">
          Smash Ultimate, Melee, Street Fighter 6, Fatal Fury: City of the Wolves, Tekken 8 y Rivals
          of Aether II. Rating por jugador, predicciones automáticas y mercados "Sí/No" estilo
          Polymarket.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/torneos"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white"
          >
            Ver torneos <ArrowRight size={16} />
          </Link>
          {!user?.username && (
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500"
            >
              Continuar con Google
            </Link>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Juegos</h2>
        <div className="flex flex-wrap gap-2">
          {GAMES.map((game) => (
            <Link key={game.id} to={`/torneos?juego=${game.id}`}>
              <GameTag game={game} />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Torneos destacados</h2>
          <Link to="/torneos" className="text-sm text-zinc-400 hover:text-zinc-200">
            Ver todos
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Mercados con más volumen</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {topMarkets.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      </section>
    </div>
  )
}
