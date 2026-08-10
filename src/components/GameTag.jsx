export default function GameTag({ game }) {
  const Icon = game.icon
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
      style={{
        color: game.accentColor,
        borderColor: `${game.accentColor}55`,
        background: `${game.accentColor}15`,
      }}
    >
      <Icon size={14} />
      {game.shortName}
    </span>
  )
}
