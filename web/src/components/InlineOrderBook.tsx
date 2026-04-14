'use client'

import { useState, useEffect, useMemo } from 'react'

interface OrderBookLevel {
  price: number
  quantity: number
}

interface InlineOrderBookProps {
  marketId: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

/**
 * Compact, self-fetching orderbook for embedding inline below an outcome row.
 * Shows top 5 bids and asks side-by-side with depth bars.
 */
export default function InlineOrderBook({ marketId }: InlineOrderBookProps) {
  const [bids, setBids] = useState<OrderBookLevel[]>([])
  const [asks, setAsks] = useState<OrderBookLevel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchOB = async () => {
      try {
        const res = await fetch(`${API_BASE}/markets/${marketId}/orderbook/0`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setBids(data.bids || [])
        setAsks(data.asks || [])
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchOB()
    const interval = setInterval(fetchOB, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [marketId])

  const maxQty = useMemo(() => {
    const all = [...bids, ...asks]
    return Math.max(...all.map(l => l.quantity), 1)
  }, [bids, asks])

  const topBids = bids.sort((a, b) => b.price - a.price).slice(0, 5)
  const topAsks = asks.sort((a, b) => a.price - b.price).slice(0, 5)

  const midPrice = topBids.length > 0 && topAsks.length > 0
    ? ((topBids[0].price + topAsks[0].price) / 2 * 100).toFixed(1)
    : null

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 py-2">
        <div className="space-y-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-6 bg-slate-700/50 rounded animate-pulse"></div>
          ))}
        </div>
        <div className="space-y-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-6 bg-slate-700/50 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    )
  }

  if (bids.length === 0 && asks.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-3 text-center">No orders yet</p>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {/* Bids (Buy side) */}
        <div>
          <div className="flex justify-between text-[10px] text-green-400/70 uppercase tracking-widest mb-1 px-2">
            <span>Bid</span>
            <span>Qty</span>
          </div>
          {topBids.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-2">No bids</p>
          ) : (
            topBids.map((bid, idx) => (
              <div key={idx} className="relative px-2 py-1 hover:bg-green-900/10 transition">
                <div
                  className="absolute top-0 right-0 h-full bg-green-500/8 rounded"
                  style={{ width: `${(bid.quantity / maxQty) * 100}%` }}
                />
                <div className="relative z-10 flex justify-between items-center">
                  <span className="text-xs font-mono text-green-400">{(bid.price * 100).toFixed(1)}¢</span>
                  <span className="text-xs font-mono text-slate-400">{bid.quantity}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Asks (Sell side) */}
        <div>
          <div className="flex justify-between text-[10px] text-red-400/70 uppercase tracking-widest mb-1 px-2">
            <span>Ask</span>
            <span>Qty</span>
          </div>
          {topAsks.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-2">No asks</p>
          ) : (
            topAsks.map((ask, idx) => (
              <div key={idx} className="relative px-2 py-1 hover:bg-red-900/10 transition">
                <div
                  className="absolute top-0 left-0 h-full bg-red-500/8 rounded"
                  style={{ width: `${(ask.quantity / maxQty) * 100}%` }}
                />
                <div className="relative z-10 flex justify-between items-center">
                  <span className="text-xs font-mono text-red-400">{(ask.price * 100).toFixed(1)}¢</span>
                  <span className="text-xs font-mono text-slate-400">{ask.quantity}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Spread / Mid */}
      {midPrice && (
        <div className="flex justify-center mt-2 pt-2 border-t border-slate-700/50">
          <span className="text-[11px] text-slate-400">
            Mid: <span className="font-mono text-slate-300">{midPrice}¢</span>
            {topBids.length > 0 && topAsks.length > 0 && (
              <span className="ml-3 text-slate-500">
                Spread: {((topAsks[0].price - topBids[0].price) * 100).toFixed(1)}¢
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
