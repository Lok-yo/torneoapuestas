import { getTierInfo } from '../lib/tiers.js'

export default function TierBadge({ rating, showLevel = true }) {
  const { tier, color, level } = getTierInfo(rating)

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide"
      style={{ background: `${color}22`, color, borderColor: `${color}55` }}
    >
      {tier}
      {showLevel ? ` ${level}` : ''}
    </span>
  )
}
