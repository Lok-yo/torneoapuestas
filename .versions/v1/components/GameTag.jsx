import GameCover from './GameCover.jsx'

export default function GameTag({ game }) {
  if (!game) return null
  return (
    <span className="inline-flex items-center gap-1.5 border border-[#2a382c] bg-[#10180f] pr-2 text-[11px] font-semibold text-[#ddd6c4]">
      <GameCover game={game} className="h-5 w-4" />
      {game.shortName}
    </span>
  )
}
