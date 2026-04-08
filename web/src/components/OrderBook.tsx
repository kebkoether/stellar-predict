'use client'

import { useMemo } from 'react'

interface OrderBookLevel {
  price: number
  quantity: number
  total?: number
}

interface OrderBookProps {
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  midPrice?: number
  loading?: boolean
}

export default function OrderBook({
  bids,
  asks,
  midPrice,
  loading = false,
}: OrderBookProps) {
  const maxQuantity = useMemo(() => {
    const all = [...bids, ...asks]
    return Math.max(...all.map((l) => l.quantity), 1)
  }, [bids, asks])

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Order Book</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-slate-700/50 rounded animate-pulse"></div>
            ))}
          </div>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-slate-700/50 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
      <h3 className="text-xl font-semibold text-white mb-4">Order Book (YES Outcome)</h3>

      <div className="grid grid-cols-2 gap-4">
        {/* Asks (Red - Sell Side) */}
        <div>
          <h4 className="text-xs uppercase tracking-widest text-red-400 font-semibold mb-3">
            Asks (Sell)
          </h4>
          <div className="space-y-0 max-h-80 overflow-y-auto">
            {asks.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No asks</p>
            ) : (
              asks
                .sort((a, b) => b.price - a.price)
                .map((ask, idx) => (
                  <div
                    key={idx}
                    className="relative py-2 px-3 hover:bg-red-900/10 transition group"
                  >
                    <div
                      className="absolute top-0 left-0 h-full bg-red-500/5 rounded"
                      style={{
                        width: `${(ask.quantity / maxQuantity) * 100}%`,
                      }}
                    ></div>
                    <div className="relative z-10 flex justify-between items-center">
                      <p className="text-sm font-mono text-red-400">
                        {(ask.price * 100).toFixed(1)}¢
                      </p>
                      <p className="text-xs text-slate-300 font-mono">
                        {ask.quantity}
                      </p>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Bids (Green - Buy Side) */}
        <div>
          <h4 className="text-xs uppercase tracking-widest text-green-400 font-semibold mb-3">
            Bids (Buy)
          </h4>
          <div className="space-y-0 max-h-80 overflow-y-auto">
            {bids.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No bids</p>
            ) : (
              bids
                .sort((a, b) => b.price - a.price)
                .map((bid, idx) => (
                  <div
                    key={idx}
                    className="relative py-2 px-3 hover:bg-green-900/10 transition group"
                  >
                    <div
                      className="absolute top-0 left-0 h-full bg-green-500/5 rounded"
                      style={{
                        width: `${(bid.quantity / maxQuantity) * 100}%`,
                      }}
                    ></div>
                    <div className="relative z-10 flex justify-between items-center">
                      <p className="text-sm font-mono text-green-400">
                        {(bid.price * 100).toFixed(1)}¢
                      </p>
                      <p className="text-xs text-slate-300 font-mono">
                        {bid.quantity}
                      </p>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {midPrice && (
        <div className="mt-4 pt-4 border-t border-slate-700">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400">Mid Price</span>
            <span className="text-lg font-semibold text-slate-200">
              {midPrice.toFixed(2)}¢
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
