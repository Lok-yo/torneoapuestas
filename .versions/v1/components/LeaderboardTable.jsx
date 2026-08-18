import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import TierBadge from './TierBadge.jsx'

export default function LeaderboardTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-950/40 backdrop-blur-md">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              #
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Jugador
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Tier
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Rating
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Récord
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.player.id} className="border-t border-white/5 transition hover:bg-violet-500/5">
              <td className="px-4 py-3 font-mono text-zinc-500">{i + 1}</td>
              <td className="px-4 py-3">
                <Link to={`/jugadores/${row.player.username}`} className="flex items-center gap-2">
                  <Avatar username={row.player.username} size={28} />
                  <span className="font-medium text-zinc-100">@{row.player.username}</span>
                </Link>
              </td>
              <td className="px-4 py-3">
                <TierBadge rating={row.rating} />
              </td>
              <td className="px-4 py-3 text-right font-mono font-medium text-zinc-200">{row.rating}</td>
              <td className="px-4 py-3 text-right text-zinc-400">
                {row.wins}V-{row.losses}D
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
