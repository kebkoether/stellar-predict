'use client'

import Link from 'next/link'
import { TrendingUp, CheckCircle } from 'lucide-react'

interface MarketCardProps {
  id: string
  question: string
  description?: string
  outcomes?: string[]
  status?: string
  resolvedOutcomeIndex?: number
  resolutionTime?: string
  resolutionDate?: string
  // These come from enriched data (when we have trades)
  yesPrice?: number
  noPrice?: number
  volume?: number
  category?: string
  yesPercentage?: number
  yesProbability?: number
}

export default function MarketCard({
  id,
  question,
  outcomes,
  status,
  resolvedOutcomeIndex,
  resolutionTime,
  resolutionDate,
  yesPrice,
  noPrice,
  volume,
  category,
  yesPercentage,
  yesProbability,
}: MarketCardProps) {
  // Default values when no trading data exists yet
  const yes = yesPrice ?? 0.5
  const no = noPrice ?? 0.5
  const vol = volume ?? 0
  const pct = yesPercentage ?? yesProbability ?? 50
  const cat = category ?? 'Crypto'
  const resolves = resolutionTime ?? resolutionDate ?? ''
  const noPct = 100 - pct
  const isResolved = status === 'resolved'
  const winningOutcome = isResolved && resolvedOutcomeIndex !== undefined
    ? (outcomes?.[resolvedOutcomeIndex] ?? (resolvedOutcomeIndex === 0 ? 'YES' : 'NO'))
    : null

  const formatVolume = (v: number) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`
    return `$${v.toFixed(0)}`
  }

  return (
    <Link href={`/markets/${id}`}>
      <div className={`card-interactive group relative ${isResolved ? 'opacity-60 hover:opacity-90 transition-opacity' : ''}`}
        style={isResolved ? { border: '1px solid rgba(239, 68, 68, 0.2)', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(30, 30, 40, 0.9) 100%)' } : {}}
      >
        {/* Resolved overlay badge */}
        {isResolved && winningOutcome && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold px-2.5 py-1 rounded-full z-10">
            <CheckCircle className="w-3.5 h-3.5" />
            {winningOutcome}
          </div>
        )}

        {/* Header with Category and Status */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="badge badge-blue text-xs">{cat}</span>
            {isResolved && (
              <span className="text-xs px-2 py-0.5 rounded bg-slate-500/20 text-slate-400">
                Resolved
              </span>
            )}
          </div>
          {!isResolved && (
            <TrendingUp className="w-4 h-4 text-slate-500 group-hover:text-green-400 transition" />
          )}
        </div>

        {/* Question */}
        <h3 className="text-lg font-semibold text-white mb-4 line-clamp-2 group-hover:text-green-300 transition">
          {question}
        </h3>

        {/* Probability Bar */}
        <div className="mb-4">
          <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
            {isResolved ? (
              <div
                className={`h-full rounded-full transition-all ${resolvedOutcomeIndex === 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                style={{ width: resolvedOutcomeIndex === 0 ? '100%' : '0%' }}
              ></div>
            ) : (
              <div
                className="bg-green-500 h-full rounded-full transition-all"
                style={{ width: `${pct}%` }}
              ></div>
            )}
          </div>
          <div className="flex justify-between mt-2 text-xs">
            {isResolved ? (
              <>
                <span className={resolvedOutcomeIndex === 0 ? 'text-emerald-400 font-bold' : 'text-slate-500 line-through'}>
                  {outcomes?.[0] ?? 'YES'} {resolvedOutcomeIndex === 0 ? '100%' : '0%'}
                </span>
                <span className={resolvedOutcomeIndex === 1 ? 'text-emerald-400 font-bold' : 'text-slate-500 line-through'}>
                  {outcomes?.[1] ?? 'NO'} {resolvedOutcomeIndex === 1 ? '100%' : '0%'}
                </span>
              </>
            ) : (
              <>
                <span className="text-green-400 font-medium">
                  {outcomes?.[0] ?? 'YES'} {pct.toFixed(0)}%
                </span>
                <span className="text-red-400 font-medium">
                  {outcomes?.[1] ?? 'NO'} {noPct.toFixed(0)}%
                </span>
              </>
            )}
          </div>
        </div>

        {/* Prices */}
        <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-slate-700">
          {isResolved ? (
            <>
              <div>
                <p className="text-xs text-slate-400 mb-1">{outcomes?.[0] ?? 'YES'}</p>
                <p className={`text-2xl font-bold ${resolvedOutcomeIndex === 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {resolvedOutcomeIndex === 0 ? '$1.00' : '$0.00'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">{outcomes?.[1] ?? 'NO'}</p>
                <p className={`text-2xl font-bold ${resolvedOutcomeIndex === 1 ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {resolvedOutcomeIndex === 1 ? '$1.00' : '$0.00'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs text-slate-400 mb-1">{outcomes?.[0] ?? 'YES'}</p>
                <p className="text-2xl font-bold text-green-400">
                  {(yes * 100).toFixed(0)}¢
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">{outcomes?.[1] ?? 'NO'}</p>
                <p className="text-2xl font-bold text-red-400">
                  {(no * 100).toFixed(0)}¢
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div>
            <p className="font-mono">Vol: {formatVolume(vol)}</p>
          </div>
          <div className="text-right">
            {isResolved ? (
              <p className="text-slate-500">Settled</p>
            ) : (
              resolves && <p>{new Date(resolves).toLocaleDateString()}</p>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
