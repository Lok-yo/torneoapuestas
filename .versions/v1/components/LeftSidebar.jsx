import { NavLink, Link } from 'react-router-dom'
import { Radio, Trophy, Medal, LayoutDashboard, Shield } from 'lucide-react'
import { GAMES } from '../data/games.js'
import { FEATURE_FLAGS } from '../config/featureFlags.js'
import { useSession } from '../auth/SessionProvider.jsx'
import GameCover from './GameCover.jsx'

const item = ({ isActive }) =>
  `flex items-center gap-2 px-3 py-2 text-[13px] font-semibold border-l-2 ${
    isActive
      ? 'border-[#c9a227] bg-[#162016] text-[#f0e6c8]'
      : 'border-transparent text-[#9aa090] hover:bg-[#121a14] hover:text-[#ddd6c4]'
  }`

export default function LeftSidebar({ onNavigate }) {
  const { status, profile, hasRole } = useSession()
  const isAuthenticated = status === 'authenticated' && Boolean(profile?.username)
  const isOrganizer = hasRole('organizer') || hasRole('admin')

  return (
    <div className="flex h-full flex-col">
      <nav className="py-2">
        <NavLink to="/" end className={item} onClick={onNavigate}>
          <LayoutDashboard size={15} />
          <span className="rail-label">Inicio</span>
        </NavLink>
        <NavLink to="/torneos" className={item} onClick={onNavigate}>
          <Radio size={15} />
          <span className="rail-label">Cartelera</span>
        </NavLink>
        <NavLink to="/ranking" className={item} onClick={onNavigate}>
          <Medal size={15} />
          <span className="rail-label">Ranking</span>
        </NavLink>
        {isAuthenticated && isOrganizer && (
          <NavLink to="/organizador" className={item} onClick={onNavigate}>
            <Trophy size={15} />
            <span className="rail-label">Panel organizador</span>
          </NavLink>
        )}
        {isAuthenticated && hasRole('admin') && (
          <NavLink to="/admin" className={item} onClick={onNavigate}>
            <Shield size={15} />
            <span className="rail-label">Admin</span>
          </NavLink>
        )}
      </nav>

      <div className="mt-1 border-t border-[#243028] px-3 py-3">
        <p className="rail-label mb-2 font-display text-[11px] font-bold tracking-[0.16em] text-[#6d7566]">
          JUEGOS
        </p>
        <div className="flex flex-col gap-0.5">
          {GAMES.map((game) => (
            <Link
              key={game.id}
              to={`/torneos?juego=${game.id}`}
              onClick={onNavigate}
              className="flex items-center gap-2 px-1 py-1.5 text-[12px] text-[#b8b09a] hover:bg-[#121a14] hover:text-[#f0e6c8]"
            >
              <GameCover game={game} className="h-9 w-7 shrink-0" />
              <span className="rail-label truncate">{game.shortName}</span>
            </Link>
          ))}
        </div>
      </div>

      {FEATURE_FLAGS.web3 && (
        <div className="mt-auto border-t border-[#243028] p-3 text-[10px] uppercase tracking-wider text-[#5c6458]">
          Polygon Amoy
        </div>
      )}
    </div>
  )
}
