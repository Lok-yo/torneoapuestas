import GameCover from './GameCover.jsx'

export default function GameTag({ game }) {
  if (!game) return null
  return (
    <span className="inline-flex items-center gap-1.5 border border-[#242424] bg-[#0c0c0c] pr-2 text-[11px] font-medium text-[#edeae3]">
      <GameCover game={game} className="h-5 w-4" />
      {game.shortName}
    </span>
  )
}
