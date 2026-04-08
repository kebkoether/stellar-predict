'use client'

import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { useWalletContext } from '@/context/WalletContext'

interface OrderEntryProps {
  marketId: string
  outcomes: string[]
  onOrderPlaced?: () => void
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

/**
 * Polymarket-style order entry.
 *
 * All orders go through the YES (outcome 0) book:
 *   - "Buy YES at 60¢" → buy on outcome 0 at 0.60 (costs 60¢/share)
 *   - "Buy NO at 60¢"  → sell on outcome 0 at 0.40 (costs 60¢/share for NO tokens)
 *
 * The price slider always represents what YOU pay per share for the outcome you selected.
 */
export default function OrderEntry({
  marketId,
  outcomes,
  onOrderPlaced,
}: OrderEntryProps) {
  const { connected, publicKey, connect, balance, refreshBalance } = useWalletContext()
  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no'>('yes')
  const [price, setPrice] = useState(50)
  const [quantity, setQuantity] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // You always pay `price` cents per share for whatever outcome you selected
  const costPerShare = price / 100
  const estimatedCost = quantity * costPerShare

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!connected || !publicKey) {
      setError('Please connect your wallet first')
      return
    }

    setLoading(true)

    try {
      // Translate to the YES book:
      //   Buy YES at P → { side: 'buy', outcomeIndex: 0, price: P/100 }
      //   Buy NO at P  → { side: 'sell', outcomeIndex: 0, price: (100-P)/100 }
      //     because selling YES at (100-P)¢ = buying NO at P¢
      const apiSide = selectedOutcome === 'yes' ? 'buy' : 'sell'
      const apiPrice = selectedOutcome === 'yes' ? price / 100 : (100 - price) / 100

      const response = await fetch(`${API_BASE}/markets/${marketId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: publicKey,
          side: apiSide,
          outcomeIndex: 0, // always the YES book
          price: apiPrice,
          quantity,
          type: 'limit',
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || data.error || 'Failed to place order')
      }

      const outcomeName = selectedOutcome === 'yes' ? (outcomes[0] || 'YES') : (outcomes[1] || 'NO')
      setSuccess(`Bought ${quantity} ${outcomeName} at ${price}¢`)
      setQuantity(10)

      await refreshBalance()

      if (onOrderPlaced) {
        setTimeout(onOrderPlaced, 500)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const outcomeName = selectedOutcome === 'yes' ? (outcomes[0] || 'YES') : (outcomes[1] || 'NO')

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
      <h3 className="text-xl font-semibold text-white mb-6">Place Order</h3>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 mb-4">
          <p className="text-sm text-green-300">{success}</p>
        </div>
      )}

      {/* Outcome Selector — Pick YES or NO */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => setSelectedOutcome('yes')}
          className={`py-3.5 px-4 rounded-lg font-bold transition border text-center ${
            selectedOutcome === 'yes'
              ? 'bg-green-900/40 border-green-500 text-green-400 shadow-lg shadow-green-900/20'
              : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Buy {outcomes[0] || 'YES'}
        </button>
        <button
          onClick={() => setSelectedOutcome('no')}
          className={`py-3.5 px-4 rounded-lg font-bold transition border text-center ${
            selectedOutcome === 'no'
              ? 'bg-red-900/40 border-red-500 text-red-400 shadow-lg shadow-red-900/20'
              : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Buy {outcomes[1] || 'NO'}
        </button>
      </div>

      {/* Price Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Your price: <span className={selectedOutcome === 'yes' ? 'text-green-400' : 'text-red-400'}>{price}¢</span> per {outcomeName} share
        </label>
        <input
          type="range"
          min="1"
          max="99"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className={`w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer ${
            selectedOutcome === 'yes' ? 'accent-green-500' : 'accent-red-500'
          }`}
        />
        <div className="flex justify-between text-xs text-slate-400 mt-2">
          <span>1¢</span>
          <span>50¢</span>
          <span>99¢</span>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {selectedOutcome === 'yes'
            ? `If ${outcomes[0] || 'YES'} wins, each share pays $1.00 (profit: ${(100 - price)}¢)`
            : `If ${outcomes[1] || 'NO'} wins, each share pays $1.00 (profit: ${(100 - price)}¢)`
          }
        </p>
      </div>

      {/* Quantity Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Shares
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-600"
          placeholder="10"
        />
      </div>

      {/* Estimated Cost */}
      <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center">
          <span className="text-slate-400 text-sm">Total Cost</span>
          <span className="text-2xl font-bold text-white">
            ${estimatedCost.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-slate-500">Potential payout</span>
          <span className="text-xs text-green-400 font-semibold">
            ${(quantity * 1).toFixed(2)} (+${(quantity - estimatedCost).toFixed(2)})
          </span>
        </div>
        {balance && connected && (
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-600/50">
            <span className="text-xs text-slate-500">Available balance</span>
            <span className={`text-xs font-semibold ${balance.available >= estimatedCost ? 'text-green-400' : 'text-red-400'}`}>
              ${balance.available.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Submit Button */}
      {!connected ? (
        <button
          type="button"
          onClick={connect}
          className="w-full py-3 px-4 rounded-lg text-lg font-semibold transition bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-500 hover:to-blue-600 flex items-center justify-center space-x-2"
        >
          <Wallet className="w-5 h-5" />
          <span>Connect Wallet to Trade</span>
        </button>
      ) : (
        <form onSubmit={handleSubmit}>
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 px-4 rounded-lg text-lg font-bold transition ${
              selectedOutcome === 'yes'
                ? 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-500 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed'
                : 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-500 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {loading ? 'Processing...' : `Buy ${outcomeName} at ${price}¢`}
          </button>
        </form>
      )}

      <p className="text-xs text-slate-400 text-center mt-4">
        Settlement in USDC on Stellar
      </p>
    </div>
  )
}
