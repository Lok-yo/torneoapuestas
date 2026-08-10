import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

export default function MarketPriceChart({ priceHistory }) {
  const data = priceHistory.map((p) => ({ ...p, pct: Math.round(p.price * 100) }))

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" hide />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke="#71717a"
            tick={{ fontSize: 12 }}
            width={40}
          />
          <Tooltip
            formatter={(value) => [`${value}%`, 'Probabilidad Sí']}
            labelFormatter={() => ''}
            contentStyle={{
              background: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Line type="monotone" dataKey="pct" stroke="#34d399" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
