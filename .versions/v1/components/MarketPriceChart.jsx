import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const value = payload[0].value
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950/95 px-3 py-2 shadow-xl backdrop-blur-md">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Probabilidad SÍ</p>
      <p className="font-mono text-sm font-semibold text-emerald-300">{value}%</p>
    </div>
  )
}

export default function MarketPriceChart({ priceHistory }) {
  const data = (priceHistory ?? []).map((p) => ({ ...p, pct: Math.round(p.price * 100) }))

  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-xs text-zinc-500">
        Todavía no hay historial de precio para graficar.
      </div>
    )
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="coliseumYesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
              <stop offset="85%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#18181b" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" hide />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke="#52525b"
            tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}
            width={40}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="pct"
            stroke="#34d399"
            strokeWidth={2.25}
            fill="url(#coliseumYesFill)"
            dot={false}
            activeDot={{ r: 4, fill: '#34d399', stroke: '#052e1a', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
