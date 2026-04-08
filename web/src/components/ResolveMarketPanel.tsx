'use client'

import { useState } from 'react'
import { Shield, CheckCircle, AlertTriangle } from 'lucide-react'

interface ResolveMarketPanelProps {
  marketId: string
  outcomes: string[]
  onResolved: () => void
}

export default function ResolveMarketPanel({ marketId, outcomes, onResolved }: ResolveMarketPanelProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

  const handleResolve = async () => {
    if (selectedOutcome === null) return
    setSubmitting(true)
    setError(null)

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'
      const res = await fetch(`${apiBase}/admin/markets/${marketId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcomeIndex: selectedOutcome }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to resolve market')
        return
      }

      setResult(data)
      onResolved()
    } catch (err) {
      setError('Network error — is the server running?')
    } finally {
      setSubmitting(false)
      setConfirming(false)
    }
  }

  if (result) {
    return (
      <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold text-emerald-400">Market Resolved</h3>
        </div>
        <p className="text-sm text-slate-300 mb-3">
          Winning outcome: <span className="font-semibold text-white">{result.winningOutcome}</span>
        </p>
        <div className="space-y-1 text-sm text-slate-400">
          <p>Collateral pool: ${result.collateralPool?.toFixed(2)}</p>
          <p>Winners paid: {result.payouts?.length ?? 0}</p>
          <p>Losers: {result.losses?.length ?? 0}</p>
          <p className={result.zeroSumCheck?.balanced ? 'text-emerald-400' : 'text-red-400'}>
            {result.zeroSumCheck?.balanced ? '✅ Zero-sum balanced' : '❌ Imbalance detected'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-amber-400" />
        <h3 className="text-lg font-semibold text-amber-300">Resolve Market</h3>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Resolve this market by selecting the winning outcome.
        This will cancel open orders, pay out winners, and is irreversible.
      </p>

      {/* Outcome selection */}
      <div className="space-y-2 mb-4">
        {outcomes.map((outcome, index) => (
          <button
            key={index}
            onClick={() => { setSelectedOutcome(index); setConfirming(false) }}
            className={`w-full text-left px-4 py-3 rounded-lg border transition ${
              selectedOutcome === index
                ? index === 0
                  ? 'border-green-500 bg-green-900/30 text-green-400'
                  : 'border-red-500 bg-red-900/30 text-red-400'
                : 'border-slate-600 bg-slate-800/50 text-slate-300 hover:border-slate-500'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{outcome}</span>
              {selectedOutcome === index && (
                <CheckCircle className="w-4 h-4" />
              )}
            </div>
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 mb-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Two-step confirmation */}
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={selectedOutcome === null}
          className="w-full py-3 rounded-lg font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-500 text-white"
        >
          Resolve Market
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300">
              This will resolve the market as <span className="font-bold text-white">&quot;{outcomes[selectedOutcome!]}&quot;</span> and pay out winners. This cannot be undone.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="py-2.5 rounded-lg font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleResolve}
              disabled={submitting}
              className="py-2.5 rounded-lg font-semibold bg-red-600 hover:bg-red-500 text-white transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Resolving...
                </>
              ) : (
                'Confirm Resolution'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
