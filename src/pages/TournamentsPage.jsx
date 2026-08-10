import { useSearchParams } from 'react-router-dom'
import { TOURNAMENTS } from '../data/tournaments.js'
import TournamentCard from '../components/TournamentCard.jsx'
import GameTabs from '../components/GameTabs.jsx'

const STATUS_FILTERS = [
  { id: null, label: 'Todos' },
  { id: 'upcoming', label: 'Próximos' },
  { id: 'live', label: 'En vivo' },
  { id: 'finished', label: 'Finalizados' },
]

export default function TournamentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const gameId = searchParams.get('juego')
  const status = searchParams.get('estado')

  const filtered = TOURNAMENTS.filter(
    (t) => (!gameId || t.gameId === gameId) && (!status || t.status === status),
  )

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Torneos</h1>
        <p className="text-sm text-zinc-400">Elegí un juego y seguí sus torneos activos.</p>
      </div>

      <GameTabs activeId={gameId} onChange={(id) => updateParam('juego', id)} />

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => updateParam('estado', f.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === f.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No hay torneos con esos filtros.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))}
        </div>
      )}
    </div>
  )
}
