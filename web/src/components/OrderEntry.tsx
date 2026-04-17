'use client'

import { useState, useEffect } from 'react'
import { Wallet, Zap, ChevronDown } from 'lucide-react'
import { useWalletContext } from '@/context/WalletContext'
import { useToast } from '@/components/Toast'

interface OrderEntryProps {
  marketId: string
  outcomes: string[]
  onOrderPlaced?: () => void
  initialYesPrice?: number   // 0-1 from orderbook mid, e.g. 0.12 for Celtics
  initialAction?: 'buy' | 'sell'  // pre-select buy or sell from parent
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

/**
 * Polymarket-style order entry.
 *
 * Defaults to Buy + Market order at FMV.
 * Dropdown to switch to Limit order with custom price.
 *
 * All orders go through the YES (outcome 0) book:
 *   - "Buy YES at P" → buy on outcome 0 at P
 *   - "Buy NO at P"  → sell on outcome 0 at (1-P)
 */
export default function OrderEntry({
  marketId,
  outcomes,
  onOrderPlaced,
  initialYesPrice,
  initialAction,
}: OrderEntryProps) {
  const { connected, publicKey, connect, balance, refreshBalance } = useWalletContext()
  const { showToast } = useToast()
  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no'>(initialAction === 'sell' ? 'no' : 'yes')
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [price, setPrice] = useState(50)
  const [quantityStr, setQuantityStr] = useState('10')
  const quantity = Number(quantityStr) || 0
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [bestAsk, setBestAsk] = useState<number | null>(null)
  const [bestBid, setBestBid] = useState<number | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Sync initialAction from parent (e.g. when user clicks Buy/Sell buttons)
  useEffect(() => {
    if (initialAction === 'sell') {
      setSelectedOutcome('no')
    } else if (initialAction === 'buy') {
      setSelectedOutcome('yes')
    }
  }, [initialAction])

  // Set initial price from orderbook mid when provided
  useEffect(() => {
    if (initialYesPrice !== undefined && initialYesPrice > 0 && initialYesPrice < 1) {
      setPrice(Math.round(initialYesPrice * 100))
    }
  }, [initialYesPrice])

  // Reset to market order when switching markets
  useEffect(() => {
    setOrderType('market')
    setError('')
    setSuccess('')
  }, [marketId])

  // Fetch best bid/ask for market order pricing
  useEffect(() => {
    const fetchOrderbook = async () => {
      try {
        const res = await fetch(`${API_BASE}/markets/${marketId}/orderbook/0`)
        if (!res.ok) return
        const data = await res.json()
        if (data.bids?.length > 0) setBestBid(data.bids[0].price)
        if (data.asks?.length > 0) setBestAsk(data.asks[data.asks.length - 1]?.price || data.asks[0]?.price)
      } catch {}
    }
    fetchOrderbook()
    const interval = setInterval(fetchOrderbook, 5000)
    return () => clearInterval(interval)
  }, [marketId])

  // For market orders, cost is based on best available price
  // For limit orders, cost is based on the chosen price
  const effectivePrice = orderType === 'market'
    ? (selectedOutcome === 'yes'
        ? (bestAsk !== null ? Math.round(bestAsk * 100) : price)
        : (bestBid !== null ? Math.round((1 - bestBid) * 100) : price))
    : (selectedOutcome === 'yes' ? price : 100 - price)

  const costPerShare = effectivePrice / 100
  const estimatedCost = quantity * costPerShare

  // Step 1: validate and show confirmation modal
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!connected || !publicKey) {
      setError('Please connect your wallet first')
      return
    }

    if (!balance || balance.available < estimatedCost) {
      setError(`Insufficient balance. You need $${estimatedCost.toFixed(2)} but only have $${(balance?.available ?? 0).toFixed(2)}.`)
      return
    }

    setShowConfirm(true)
  }

  // Step 2: actually place the order after user confirms
  const handleConfirmedSubmit = async () => {
    setShowConfirm(false)
    setLoading(true)

    try {
      let apiSide: 'buy' | 'sell'
      let apiPrice: number
      let apiType: string

      if (orderType === 'market') {
        if (selectedOutcome === 'yes') {
          apiSide = 'buy'
          apiPrice = 0.99
        } else {
          apiSide = 'sell'
          apiPrice = 0.01
        }
        apiType = 'ioc'
      } else {
        apiSide = selectedOutcome === 'yes' ? 'buy' : 'sell'
        apiPrice = selectedOutcome === 'yes' ? price / 100 : (100 - price) / 100
        apiType = 'limit'
      }

      const response = await fetch(`${API_BASE}/markets/${marketId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: publicKey,
          side: apiSide,
          outcomeIndex: 0,
          price: apiPrice,
          quantity,
          type: apiType,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || data.error || 'Failed to place order')
      }

      const result = await response.json()
      const outcomeLabel = selectedOutcome === 'yes' ? (outcomes[0] || 'YES') : (outcomes[1] || 'NO')
      const filledQty = result.order?.filledQty ?? 0

      if (orderType === 'market') {
        if (filledQty > 0) {
          const msg = `Filled ${filledQty} ${outcomeLabel} shares`
          setSuccess(msg)
          showToast('success', msg)
        } else {
          const msg = 'No liquidity — try a limit order instead'
          setError(msg)
          showToast('error', msg)
        }
      } else {
        if (filledQty === quantity) {
          const msg = `Filled ${quantity} ${outcomeLabel} at ${price}¢`
          setSuccess(msg)
          showToast('success', msg)
        } else if (filledQty > 0) {
          const msg = `Partial fill: ${filledQty}/${quantity} ${outcomeLabel} at ${price}¢`
          setSuccess(msg)
          showToast('success', msg)
        } else {
          const msg = `Order resting: ${quantity} ${outcomeLabel} at ${price}¢`
          setSuccess(msg)
          showToast('success', msg)
        }
      }

      setQuantityStr('10')
      await refreshBalance()
      if (onOrderPlaced) setTimeout(onOrderPlaced, 500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      showToast('error', msg)
    } finally {
      setLoading(false)
    }
  }

  const outcomeName = selectedOutcome === 'yes' ? (outcomes[0] || 'YES') : (outcomes[1] || 'NO')
  const midPriceCents = initialYesPrice ? Math.round(initialYesPrice * 100) : null
  const displayPrice = selectedOutcome === 'yes'
    ? (midPriceCents ?? 50)
    : (100 - (midPriceCents ?? 50))

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
      {/* Header with order type dropdown */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-white">Place Order</h3>
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 transition"
          >
            {orderType === 'market' ? (
              <>
                <Zap className="w-3.5 h-3.5 text-blue-400" />
                Market
              </>
            ) : (
              <>Limit</>
            )}
            <ChevronDown className="w-3.5 h-3.5 ml-1" />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-1 w-36 bg-slate-700 border border-slate-600 rounded-lg shadow-xl z-20 overflow-hidden">
              <button
                onClick={() => { setOrderType('market'); setDropdownOpen(false) }}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition ${
                  orderType === 'market'
                    ? 'bg-blue-900/30 text-blue-400'
                    : 'text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Market
              </button>
              <button
                onClick={() => { setOrderType('limit'); setDropdownOpen(false) }}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition ${
                  orderType === 'limit'
                    ? 'bg-blue-900/30 text-blue-400'
                    : 'text-slate-300 hover:bg-slate-600'
                }`}
              >
                Limit
              </button>
            </div>
          )}
        </div>
      </div>

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

      {/* Outcome Selector — Buy Yes / Buy No */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button
          onClick={() => setSelectedOutcome('yes')}
          className={`py-3 px-4 rounded-lg font-bold transition border text-center ${
            selectedOutcome === 'yes'
              ? 'bg-green-900/40 border-green-500 text-green-400 shadow-lg shadow-green-900/20'
              : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Buy Yes
          {midPriceCents !== null && (
            <span className="block text-xs font-normal mt-0.5 opacity-70">{midPriceCents}¢</span>
          )}
        </button>
        <button
          onClick={() => setSelectedOutcome('no')}
          className={`py-3 px-4 rounded-lg font-bold transition border text-center ${
            selectedOutcome === 'no'
              ? 'bg-red-900/40 border-red-500 text-red-400 shadow-lg shadow-red-900/20'
              : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Buy No
          {midPriceCents !== null && (
            <span className="block text-xs font-normal mt-0.5 opacity-70">{100 - midPriceCents}¢</span>
          )}
        </button>
      </div>

      {/* Market order info */}
      {orderType === 'market' && (
        <div className={`rounded-lg p-3 mb-5 border ${
          (selectedOutcome === 'yes' && bestAsk === null) || (selectedOutcome === 'no' && bestBid === null)
            ? 'bg-yellow-900/15 border-yellow-800/40'
            : 'bg-blue-900/15 border-blue-800/40'
        }`}>
          {((selectedOutcome === 'yes' && bestAsk !== null) || (selectedOutcome === 'no' && bestBid !== null)) ? (
            <p className="text-xs text-blue-300">
              <Zap className="w-3 h-3 inline mr-1" />
              Fills at best available price.
              {selectedOutcome === 'yes' && bestAsk !== null && (
                <span className="font-semibold"> Best ask: {Math.round(bestAsk * 100)}¢</span>
              )}
              {selectedOutcome === 'no' && bestBid !== null && (
                <span className="font-semibold"> Best ask: {Math.round((1 - bestBid) * 100)}¢</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-yellow-300">
              No orders on the book yet. Switch to <button onClick={() => { setOrderType('limit'); setDropdownOpen(false) }} className="underline font-semibold">Limit</button> to be the first to post — your order will rest until someone takes the other side.
            </p>
          )}
        </div>
      )}

      {/* Limit Price Input — only for limit orders */}
      {orderType === 'limit' && (
        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Price: <span className={selectedOutcome === 'yes' ? 'text-green-400' : 'text-red-400'}>
              {selectedOutcome === 'yes' ? price : 100 - price}¢
            </span> per share
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
            {midPriceCents !== null && (
              <span className={selectedOutcome === 'yes' ? 'text-green-400' : 'text-red-400'}>
                FMV: {displayPrice}¢
              </span>
            )}
            <span>99¢</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            If {outcomeName} wins: $1.00/share (profit: {100 - effectivePrice}¢)
          </p>
        </div>
      )}

      {/* Quantity Input */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Shares
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={quantityStr}
          onChange={(e) => setQuantityStr(e.target.value.replace(/[^0-9]/g, ''))}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-600"
          placeholder="10"
        />
      </div>

      {/* Estimated Cost */}
      <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 mb-5">
        <div className="flex justify-between items-center">
          <span className="text-slate-400 text-sm">
            {orderType === 'market' ? 'Est. Cost' : 'Total Cost'}
          </span>
          <span className="text-2xl font-bold text-white">
            ${estimatedCost.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-slate-500">Potential return</span>
          <span className="text-xs text-green-400 font-semibold">
            ${(quantity * 1).toFixed(2)} (+${(quantity - estimatedCost).toFixed(2)})
          </span>
        </div>
        {balance && connected && (
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-600/50">
            <span className="text-xs text-slate-500">Available</span>
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
          <span>Connect Wallet</span>
        </button>
      ) : (
        <form onSubmit={handleSubmit}>
          <button
            type="submit"
            disabled={loading || !balance || balance.available < estimatedCost || quantity < 1}
            className={`w-full py-3 px-4 rounded-lg text-lg font-bold transition flex items-center justify-center gap-2 ${
              selectedOutcome === 'yes'
                ? 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-500 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed'
                : 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-500 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {orderType === 'market' && <Zap className="w-5 h-5" />}
            {loading
              ? 'Processing...'
              : !balance
                ? 'Loading...'
                : balance.available < estimatedCost
                  ? `Insufficient funds ($${balance.available.toFixed(2)})`
                  : orderType === 'market'
                    ? `Buy ${outcomeName}`
                    : `Buy ${outcomeName} at ${selectedOutcome === 'yes' ? price : 100 - price}¢`}
          </button>
        </form>
      )}

      <p className="text-xs text-slate-400 text-center mt-4">
        Settlement in USDC on Stellar
      </p>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in">
            <h3 className="text-lg font-bold text-white mb-4 text-center">Confirm Your Order</h3>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center py-2 border-b border-slate-700">
                <span className="text-sm text-slate-400">Side</span>
                <span className={`text-sm font-bold ${selectedOutcome === 'yes' ? 'text-green-400' : 'text-red-400'}`}>
                  Buy {selectedOutcome === 'yes' ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-700">
                <span className="text-sm text-slate-400">Outcome</span>
                <span className="text-sm font-semibold text-white">{outcomeName}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-700">
                <span className="text-sm text-slate-400">Type</span>
                <span className="text-sm text-white capitalize">{orderType}</span>
              </div>
              {orderType === 'limit' && (
                <div className="flex justify-between items-center py-2 border-b border-slate-700">
                  <span className="text-sm text-slate-400">Price</span>
                  <span className="text-sm font-semibold text-white">{selectedOutcome === 'yes' ? price : 100 - price}¢</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2 border-b border-slate-700">
                <span className="text-sm text-slate-400">Shares</span>
                <span className="text-sm font-semibold text-white">{quantity}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-slate-400">Total Cost</span>
                <span className="text-lg font-bold text-white">${estimatedCost.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmedSubmit}
                className={`flex-1 py-2.5 rounded-lg font-bold text-sm text-white transition ${
                  selectedOutcome === 'yes'
                    ? 'bg-green-600 hover:bg-green-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
