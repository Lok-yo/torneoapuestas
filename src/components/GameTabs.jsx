import { GAMES } from '../data/games.js'
import GameCover from './GameCover.jsx'

export default function GameTabs({ activeId, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
          activeId === null ? 'bg-[#b6ff3a] text-[#0a0c08]' : 'border border-[#2a3140] text-[#9aa3b2]'
        }`}
      >
        Todos
      </button>
      {GAMES.map((game) => {
        const active = activeId === game.id
        return (
          <button
            key={game.id}
            type="button"
            onClick={() => onChange(game.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
              active ? 'bg-[#b6ff3a] text-[#0a0c08]' : 'border border-[#2a3140] text-[#9aa3b2]'
            }`}
          >
            <GameCover game={game} className="h-4 w-3" />
            {game.shortName}
          </button>
        )
      })}
    </div>
  )
}
