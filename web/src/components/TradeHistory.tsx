'use client'

interface Trade {
  id: string
  marketId: string
  outcomeIndex: number
  buyOrderId: string
  sellOrderId: string
  buyUserId: string
  sellUserId: string
  price: number
  quantity: number
  timestamp: string
  settlementStatus: string
}

interface TradeHistoryProps {
  trades: Trade[]
  loading?: boolean
}

export default function TradeHistory({ trades, loading }: TradeHistoryProps) {
  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Recent Trades</h3>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-700/50 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
      <h3 className="text-xl font-semibold text-white mb-4">Recent Trades</h3>

      {trades.length === 0 ? (
        <p className="text-slate-400 text-center py-8">No trades yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-widest">
                <th className="text-left py-3 px-4 font-semibold">Time</th>
                <th className="text-left py-3 px-4 font-semibold">Price</th>
                <th className="text-left py-3 px-4 font-semibold">Quantity</th>
                <th className="text-left py-3 px-4 font-semibold">Buyer</th>
                <th className="text-left py-3 px-4 font-semibold">Seller</th>
              </tr>
            </thead>
            <tbody>
              {trades
                .sort(
                  (a, b) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                )
                .map((trade) => (
                  <tr
                    key={trade.id}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition text-sm"
                  >
                    <td className="py-3 px-4 text-slate-300 text-xs">
                      {new Date(trade.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-100">
                      {(trade.price * 100).toFixed(1)}¢
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {trade.quantity}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="inline-block px-2 py-1 rounded text-xs font-semibold bg-green-900/30 border border-green-700 text-green-300"
                      >
                        {trade.buyUserId.slice(0, 8)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="inline-block px-2 py-1 rounded text-xs font-semibold bg-red-900/30 border border-red-700 text-red-300"
                      >
                        {trade.sellUserId.slice(0, 8)}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
