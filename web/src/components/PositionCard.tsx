'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'

interface PositionCardProps {
  marketId: string
  question: string
  outcome: 'yes' | 'no'
  shares: number
  averagePrice: number
  currentPrice: number
  timestamp: number
}

export default function PositionCard({
  marketId,
  question,
  outcome,
  shares,
  averagePrice,
  currentPrice,
  timestamp,
}: PositionCardProps) {
  const cost = (shares * averagePrice) / 100
  const currentValue = (shares * currentPrice) / 100
  const pnl = currentValue - cost
  const pnlPercent = cost === 0 ? 0 : (pnl / cost) * 100

  const isProfit = pnl >= 0
  const outcomeColor = outcome === 'yes' ? 'text-green-400' : 'text-red-400'
  const pnlColor = isProfit ? 'text-green-400' : 'text-red-400'

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h4 className="font-semibold text-white mb-1 line-clamp-2">
            {question}
          </h4>
          <p className={`text-sm font-semibold ${outcomeColor}`}>
            {outcome === 'yes' ? '👍 YES' : '👎 NO'}
          </p>
        </div>
        {isProfit ? (
          <TrendingUp className="w-5 h-5 text-green-400 ml-4 flex-shrink-0" />
        ) : (
          <TrendingDown className="w-5 h-5 text-red-400 ml-4 flex-shrink-0" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-slate-700">
        <div>
          <p className="text-xs text-slate-400 mb-1">Shares</p>
          <p className="text-xl font-bold text-white">{shares}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Avg Price</p>
          <p className="text-xl font-bold text-slate-200">
            {averagePrice.toFixed(2)}¢
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-slate-400 mb-1">Cost Basis</p>
          <p className="text-lg font-bold text-white">${cost.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Current Value</p>
          <p className="text-lg font-bold text-white">${currentValue.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-slate-700/50 rounded-lg p-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-400">P&L</span>
          <div className="text-right">
            <p className={`text-lg font-bold ${pnlColor}`}>
              {isProfit ? '+' : ''}${pnl.toFixed(2)}
            </p>
            <p className={`text-xs font-semibold ${pnlColor}`}>
              {isProfit ? '+' : ''}{pnlPercent.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500 mt-3">
        Opened {new Date(timestamp * 1000).toLocaleDateString()}
      </p>
    </div>
  )
}
