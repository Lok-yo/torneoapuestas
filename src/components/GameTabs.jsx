import { GAMES } from '../data/games.js'

export default function GameTabs({ activeId, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          activeId === null
            ? 'border-zinc-100 bg-zinc-100 text-zinc-900'
            : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
        }`}
      >
        Todos
      </button>
      {GAMES.map((game) => {
        const Icon = game.icon
        const active = activeId === game.id
        return (
          <button
            key={game.id}
            type="button"
            onClick={() => onChange(game.id)}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition"
            style={
              active
                ? {
                    borderColor: game.accentColor,
                    background: `${game.accentColor}22`,
                    color: game.accentColor,
                  }
                : { borderColor: '#27272a', color: '#a1a1aa' }
            }
          >
            <Icon size={14} />
            {game.shortName}
          </button>
        )
      })}
    </div>
  )
}
