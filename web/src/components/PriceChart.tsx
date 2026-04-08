'use client'

import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface Trade {
  id: string
  price: number
  quantity: number
  timestamp: string
}

interface PriceChartProps {
  trades: Trade[]
  loading?: boolean
}

export default function PriceChart({ trades, loading }: PriceChartProps) {
  const chartData = useMemo(() => {
    if (!trades || trades.length === 0) return []

    // Sort trades oldest → newest
    const sorted = [...trades].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    return sorted.map((trade) => ({
      time: new Date(trade.timestamp).getTime(),
      yesPrice: Math.round(trade.price * 10000) / 100, // 0.48 → 48.00
      noPrice: Math.round((1 - trade.price) * 10000) / 100,
      volume: trade.quantity,
    }))
  }, [trades])

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Price History</h3>
        <div className="w-full h-64 bg-slate-700/30 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Price History</h3>
        <div className="flex items-center justify-center h-48 text-slate-500">
          No trades yet — chart will appear after the first trade
        </div>
      </div>
    )
  }

  const latestYes = chartData[chartData.length - 1]?.yesPrice ?? 50

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-white">Price History</h3>
        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-1.5">
            <div className="w-3 h-0.5 bg-green-500 rounded" />
            <span className="text-slate-400">YES</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <div className="w-3 h-0.5 bg-red-500 rounded" />
            <span className="text-slate-400">NO</span>
          </div>
        </div>
      </div>

      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="noGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1e293b"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickFormatter={(value) => {
                const d = new Date(value)
                return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
              }}
              stroke="#334155"
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#64748b', fontSize: 11 }}
              stroke="#334155"
              tickLine={false}
              tickFormatter={(value) => `${value}¢`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '0.5rem',
                padding: '10px 14px',
              }}
              labelStyle={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}
              itemStyle={{ fontSize: 13 }}
              formatter={(value: number, name: string) => {
                const label = name === 'yesPrice' ? 'YES' : 'NO'
                const color = name === 'yesPrice' ? '#22c55e' : '#ef4444'
                return [`${value.toFixed(1)}¢`, label]
              }}
              labelFormatter={(label) => {
                const d = new Date(label)
                return d.toLocaleString()
              }}
            />
            <ReferenceLine
              y={50}
              stroke="#475569"
              strokeDasharray="6 4"
              strokeWidth={1}
            />
            <Area
              type="stepAfter"
              dataKey="yesPrice"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#yesGradient)"
              dot={chartData.length < 30 ? { fill: '#22c55e', r: 3, strokeWidth: 0 } : false}
              isAnimationActive={false}
              name="yesPrice"
            />
            <Area
              type="stepAfter"
              dataKey="noPrice"
              stroke="#ef4444"
              strokeWidth={1.5}
              fill="url(#noGradient)"
              dot={false}
              isAnimationActive={false}
              name="noPrice"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Current price summary */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700/50">
        <div className="flex items-center space-x-4">
          <span className="text-sm text-slate-400">Last trade:</span>
          <span className="text-sm font-semibold text-green-400">YES {latestYes.toFixed(1)}¢</span>
          <span className="text-sm font-semibold text-red-400">NO {(100 - latestYes).toFixed(1)}¢</span>
        </div>
        <span className="text-xs text-slate-500">{chartData.length} trade{chartData.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}
