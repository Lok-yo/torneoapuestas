import { NavLink, Link } from 'react-router-dom'
import { Radio, Trophy, Medal, LayoutDashboard, Shield } from 'lucide-react'
import { GAMES } from '../data/games.js'
import { FEATURE_FLAGS } from '../config/featureFlags.js'
import { useSession } from '../auth/SessionProvider.jsx'
import GameCover from './GameCover.jsx'

const item = ({ isActive }) =>
  `flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors duration-150 ${
    isActive
      ? 'bg-zinc-800/50 text-white shadow-[inset_2px_0_0_#b6ff3a]'
      : 'text-zinc-400 hover:bg-zinc-800/30 hover:text-white'
  }`

export default function LeftSidebar({ onNavigate }) {
  const { status, profile, hasRole } = useSession()
  const isAuthenticated = status === 'authenticated' && Boolean(profile?.username)
  const isOrganizer = hasRole('organizer') || hasRole('admin')

  return (
    <div className="flex h-full flex-col">
      <nav className="py-3">
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

      <div className="mt-1 border-t border-zinc-700/50 px-4 py-4">
        <p className="rail-label kicker mb-3">Juegos</p>
        <div className="flex flex-col gap-1">
          {GAMES.map((game) => (
            <Link
              key={game.id}
              to={`/torneos?juego=${game.id}`}
              onClick={onNavigate}
              className="flex items-center gap-2.5 py-1.5 text-[13px] font-semibold text-zinc-400 transition-colors duration-150 hover:text-white"
            >
              <GameCover game={game} className="h-10 w-7 shrink-0" />
              <span className="rail-label truncate">{game.shortName}</span>
            </Link>
          ))}
        </div>
      </div>

      {FEATURE_FLAGS.web3 && (
        <div className="mt-auto border-t border-zinc-700/50 p-4 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          Polygon Amoy
        </div>
      )}
    </div>
  )
}
