import { GAMES } from '../data/games.js'
import GameCover from './GameCover.jsx'

export default function GameTabs({ activeId, onChange }) {
  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`px-2 py-1 text-[11px] font-bold uppercase ${
          activeId === null ? 'bg-[#c9a227] text-[#141208]' : 'border border-[#2a382c] text-[#9aa090]'
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
            className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold uppercase ${
              active ? 'bg-[#c9a227] text-[#141208]' : 'border border-[#2a382c] text-[#9aa090]'
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
