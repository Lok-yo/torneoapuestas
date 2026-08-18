import { useState } from 'react'

export default function GameCover({ game, className = '', alt }) {
  const [broken, setBroken] = useState(false)
  const src = game?.cover
  const label = alt ?? game?.shortName ?? 'Juego'

  if (!src || broken) {
    return (
      <div className={`cover-fallback flex items-end p-1.5 ${className}`} aria-hidden="true">
        <span className="font-display text-[10px] font-bold uppercase leading-none text-[#e8d48a]">
          {game?.shortName ?? 'FGC'}
        </span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={label}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={`object-cover object-top ${className}`}
    />
  )
}
