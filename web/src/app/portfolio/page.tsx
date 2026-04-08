'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Wallet, TrendingUp, TrendingDown, ArrowDownToLine,
  CheckCircle, XCircle, Clock, ShoppingCart, X
} from 'lucide-react'
import { useWalletContext } from '@/context/WalletContext'
import DepositWithdrawModal from '@/components/DepositWithdrawModal'
import Link from 'next/link'

interface ApiPosition {
  id: string
  userId: string
  marketId: string
  outcomeIndex: number
  quantity: number
  costBasis: number
  createdAt: string
  updatedAt: string
}

interface ApiOrder {
  id: string
  marketId: string
  userId: string
  side: 'buy' | 'sell'
  outcomeIndex: number
  price: number
  quantity: number
  filledQty: number
  status: string
  createdAt: string
}

interface Market {
  id: string
  question: string
  outcomes: string[]
  status: string
  resolvedOutcomeIndex?: number
}

interface OrderBookData {
  bids: Array<{ price: number; quantity: number }>
  asks: Array<{ price: number; quantity: number }>
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

export default function Portfolio() {
  const { connected, publicKey, balance, refreshBalance } = useWalletContext()
  const [positions, setPositions] = useState<ApiPosition[]>([])
  const [orders, setOrders] = useState<ApiOrder[]>([])
  const [markets, setMarkets] = useState<Map<string, Market>>(new Map())
  const [marketPrices, setMarketPrices] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showFundsModal, setShowFundsModal] = useState(false)
  const [cancellingOrder, setCancellingOrder] = useState<string | null>(null)
  const [showAllClosed, setShowAllClosed] = useState(false)

  const fetchData = useCallback(async () => {
    if (!publicKey) return
    try {
      setLoading(true)

      // Fetch positions and orders in parallel
      const [posRes, ordRes] = await Promise.all([
        fetch(`${API_BASE}/users/${publicKey}/positions`),
        fetch(`${API_BASE}/users/${publicKey}/orders`),
      ])

      let activePositions: ApiPosition[] = []
      let openOrders: ApiOrder[] = []

      if (posRes.ok) {
        const posData = await posRes.json()
        activePositions = posData.filter((p: ApiPosition) => p.quantity > 0)
        setPositions(activePositions)
      }

      if (ordRes.ok) {
        const ordData = await ordRes.json()
        openOrders = ordData.filter((o: ApiOrder) =>
          o.status === 'open' || o.status === 'partially_filled'
        )
        setOrders(openOrders)
      }

      // Collect all market IDs we need
      const marketIds = new Set<string>()
      activePositions.forEach(p => marketIds.add(p.marketId))
      openOrders.forEach(o => marketIds.add(o.marketId))

      // Fetch market details and last trade prices in parallel
      const marketMap = new Map<string, Market>()
      const priceMap = new Map<string, number>()

      await Promise.all(
        Array.from(marketIds).map(async (mktId) => {
          try {
            // Fetch market info
            const mktRes = await fetch(`${API_BASE}/markets/${mktId}`)
            if (mktRes.ok) {
              const mktData = await mktRes.json()
              marketMap.set(mktId, mktData)
            }

            // Fetch last trade for current price (for unrealized P&L)
            const tradeRes = await fetch(`${API_BASE}/markets/${mktId}/trades?limit=1`)
            if (tradeRes.ok) {
              const trades = await tradeRes.json()
              if (trades.length > 0) {
                priceMap.set(mktId, trades[0].price)
              }
            }

            // Fallback to order book midpoint if no trades
            if (!priceMap.has(mktId)) {
              const obRes = await fetch(`${API_BASE}/markets/${mktId}/orderbook/0`)
              if (obRes.ok) {
                const ob: OrderBookData = await obRes.json()
                if (ob.bids.length > 0 && ob.asks.length > 0) {
                  const mid = (ob.bids[0].price + ob.asks[0].price) / 2
                  priceMap.set(mktId, mid)
                } else if (ob.bids.length > 0) {
                  priceMap.set(mktId, ob.bids[0].price)
                } else if (ob.asks.length > 0) {
                  priceMap.set(mktId, ob.asks[0].price)
                }
              }
            }
          } catch (err) {
            console.error(`Failed to fetch data for market ${mktId}:`, err)
          }
        })
      )

      setMarkets(marketMap)
      setMarketPrices(priceMap)

      // Filter out orders for resolved markets (they should have been cancelled,
      // but in case the DB wasn't updated, hide them from the UI)
      const filteredOrders = openOrders.filter(o => {
        const mkt = marketMap.get(o.marketId)
        return !mkt || mkt.status !== 'resolved'
      })
      setOrders(filteredOrders)

      await refreshBalance()
    } catch (err) {
      console.error('Failed to fetch portfolio:', err)
    } finally {
      setLoading(false)
    }
  }, [publicKey, refreshBalance])

  useEffect(() => {
    if (connected && publicKey) {
      fetchData()
    } else {
      setLoading(false)
    }
  }, [connected, publicKey, fetchData])

  const handleCancelOrder = async (marketId: string, orderId: string) => {
    setCancellingOrder(orderId)
    try {
      const res = await fetch(`${API_BASE}/markets/${marketId}/orders/${orderId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        // Remove from local state immediately
        setOrders(prev => prev.filter(o => o.id !== orderId))
        await refreshBalance()
      } else {
        console.error('Failed to cancel order')
      }
    } catch (err) {
      console.error('Cancel error:', err)
    } finally {
      setCancellingOrder(null)
    }
  }

  // Derive the user's display side and price for an order
  // Remember: "sell YES at P" on the book = "Buy NO at (1-P)" for the user
  const getOrderDisplay = (order: ApiOrder) => {
    if (order.side === 'buy') {
      return { displaySide: 'YES', displayPrice: order.price }
    } else {
      // sell on YES book = buying NO
      return { displaySide: 'NO', displayPrice: 1 - order.price }
    }
  }

  // Split positions into open (market active) vs closed (market resolved)
  const { openPositions, closedPositions } = useMemo(() => {
    const open: Array<ApiPosition & { market?: Market; currentPrice?: number; unrealizedPnl?: number; currentValue?: number }> = []
    const closed: Array<ApiPosition & { market?: Market; won?: boolean; pnl?: number }> = []

    for (const pos of positions) {
      const market = markets.get(pos.marketId)
      if (market && market.status === 'resolved') {
        const won = market.resolvedOutcomeIndex === pos.outcomeIndex
        const payout = won ? pos.quantity : 0
        const pnl = payout - pos.costBasis
        closed.push({ ...pos, market, won, pnl })
      } else {
        // Get current market price for unrealized P&L
        const lastTradePrice = marketPrices.get(pos.marketId)
        let currentPrice: number | undefined
        if (lastTradePrice !== undefined) {
          // If position is on YES (outcome 0), current price is the trade price
          // If position is on NO (outcome 1), current price is 1 - trade price
          currentPrice = pos.outcomeIndex === 0 ? lastTradePrice : 1 - lastTradePrice
        }
        const currentValue = currentPrice !== undefined ? currentPrice * pos.quantity : undefined
        const unrealizedPnl = currentValue !== undefined ? currentValue - pos.costBasis : undefined
        open.push({ ...pos, market, currentPrice, currentValue, unrealizedPnl })
      }
    }

    return { openPositions: open, closedPositions: closed }
  }, [positions, markets, marketPrices])

  const totalClosedPnl = closedPositions.reduce((sum, p) => sum + (p.pnl ?? 0), 0)
  const totalUnrealizedPnl = openPositions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0)
  const hasUnrealizedData = openPositions.some(p => p.unrealizedPnl !== undefined)

  // Not connected state
  if (!connected) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center py-24">
          <Wallet className="w-16 h-16 text-slate-600 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">Connect Your Wallet</h1>
          <p className="text-slate-400 text-lg mb-8 max-w-md mx-auto">
            Connect your Freighter wallet to view your portfolio, positions, and trade on prediction markets.
          </p>
          <p className="text-slate-500 text-sm">
            Use the &quot;Connect Freighter&quot; button in the top navigation bar.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading portfolio...</p>
        </div>
      </div>
    )
  }

  const totalValue = (balance?.available ?? 0) + (balance?.locked ?? 0)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white">Your Portfolio</h1>
          <button
            onClick={() => setShowFundsModal(true)}
            className="btn-primary flex items-center space-x-2"
          >
            <ArrowDownToLine className="w-4 h-4" />
            <span>Deposit / Withdraw</span>
          </button>
        </div>

        {/* Balance Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card-interactive">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-400 uppercase tracking-widest">Total Balance</p>
              <Wallet className="w-4 h-4 text-green-400" />
            </div>
            <p className="text-3xl font-bold text-white">${totalValue.toFixed(2)}</p>
            <p className="text-xs text-slate-400 mt-2">Total USDC</p>
          </div>

          <div className="card-interactive">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-400 uppercase tracking-widest">Available</p>
              <TrendingUp className="w-4 h-4 text-green-400" />
            </div>
            <p className="text-3xl font-bold text-slate-100">${balance?.available.toFixed(2) ?? '0.00'}</p>
            <p className="text-xs text-slate-400 mt-2">Ready to trade</p>
          </div>

          <div className="card-interactive">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-400 uppercase tracking-widest">Locked</p>
              <TrendingDown className="w-4 h-4 text-yellow-400" />
            </div>
            <p className="text-3xl font-bold text-slate-100">${balance?.locked.toFixed(2) ?? '0.00'}</p>
            <p className="text-xs text-slate-400 mt-2">In open orders</p>
          </div>
        </div>
      </div>

      {/* ─── SECTION 1: Open Orders ─── */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="w-5 h-5 text-yellow-400" />
          <h2 className="text-2xl font-bold text-white">Open Orders</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-medium">
            {orders.length}
          </span>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 text-center py-10">
            <p className="text-slate-400 mb-2">No open orders</p>
            <p className="text-slate-500 text-sm">Orders waiting to be filled will appear here</p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-700 overflow-hidden overflow-x-auto">
            <div className="min-w-[640px]">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-slate-800/80 text-xs text-slate-400 uppercase tracking-wider font-medium sticky top-0 z-10">
              <div className="col-span-4">Market</div>
              <div className="col-span-1 text-center">Side</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-1 text-right">Qty</div>
              <div className="col-span-1 text-right">Filled</div>
              <div className="col-span-2 text-right">Cost Locked</div>
              <div className="col-span-1 text-center"></div>
            </div>

            <div className="max-h-80 overflow-y-auto">
            {orders.map((order) => {
              const market = markets.get(order.marketId)
              const { displaySide, displayPrice } = getOrderDisplay(order)
              const remaining = order.quantity - order.filledQty
              const costPerShare = order.side === 'buy' ? order.price : (1 - order.price)
              const lockedCost = costPerShare * remaining

              return (
                <div
                  key={order.id}
                  className="grid grid-cols-12 gap-4 px-4 py-3 border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors items-center"
                >
                  <Link
                    href={`/markets/${order.marketId}`}
                    className="col-span-4 text-sm text-white hover:text-green-300 transition truncate"
                  >
                    {market?.question || `Market ${order.marketId.slice(0, 8)}...`}
                  </Link>
                  <div className="col-span-1 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      displaySide === 'YES'
                        ? 'bg-green-900/40 text-green-400'
                        : 'bg-red-900/40 text-red-400'
                    }`}>
                      {displaySide}
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-sm text-slate-300 font-mono">
                    {(displayPrice * 100).toFixed(1)}¢
                  </div>
                  <div className="col-span-1 text-right text-sm text-white font-mono">
                    {order.quantity}
                  </div>
                  <div className="col-span-1 text-right text-sm text-slate-400 font-mono">
                    {order.filledQty}/{order.quantity}
                  </div>
                  <div className="col-span-2 text-right text-sm text-yellow-400 font-mono">
                    ${lockedCost.toFixed(2)}
                  </div>
                  <div className="col-span-1 text-center">
                    <button
                      onClick={() => handleCancelOrder(order.marketId, order.id)}
                      disabled={cancellingOrder === order.id}
                      className="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition disabled:opacity-50"
                      title="Cancel order"
                    >
                      {cancellingOrder === order.id ? (
                        <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
            </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── SECTION 2: Open Positions ─── */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <ShoppingCart className="w-5 h-5 text-green-400" />
          <h2 className="text-2xl font-bold text-white">Open Positions</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
            {openPositions.length}
          </span>
          {hasUnrealizedData && openPositions.length > 0 && (
            <span className={`text-sm font-semibold ml-auto ${totalUnrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              Unrealized: {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
            </span>
          )}
        </div>

        {openPositions.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 text-center py-10">
            <p className="text-slate-400 mb-2">No open positions</p>
            <Link href="/" className="text-green-400 hover:text-green-300 text-sm">
              Browse markets &rarr;
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-700 overflow-hidden overflow-x-auto">
            <div className="min-w-[700px]">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-slate-800/80 text-xs text-slate-400 uppercase tracking-wider font-medium sticky top-0 z-10">
              <div className="col-span-3">Market</div>
              <div className="col-span-1 text-center">Side</div>
              <div className="col-span-1 text-right">Shares</div>
              <div className="col-span-2 text-right">Avg Price</div>
              <div className="col-span-1 text-right">Cost</div>
              <div className="col-span-2 text-right">Mkt Value</div>
              <div className="col-span-2 text-right">Unrealized P&L</div>
            </div>

            <div className="max-h-80 overflow-y-auto">
            {openPositions.map((pos) => {
              const outcome = pos.market
                ? pos.market.outcomes[pos.outcomeIndex] || `Outcome ${pos.outcomeIndex}`
                : `Outcome ${pos.outcomeIndex}`
              const avgPrice = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0

              return (
                <Link
                  key={pos.id}
                  href={`/markets/${pos.marketId}`}
                  className="grid grid-cols-12 gap-4 px-4 py-3 border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors items-center group"
                >
                  <div className="col-span-3 text-sm text-white group-hover:text-green-300 transition truncate">
                    {pos.market?.question || `Market ${pos.marketId.slice(0, 8)}...`}
                  </div>
                  <div className="col-span-1 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      pos.outcomeIndex === 0
                        ? 'bg-green-900/40 text-green-400'
                        : 'bg-red-900/40 text-red-400'
                    }`}>
                      {outcome}
                    </span>
                  </div>
                  <div className="col-span-1 text-right text-sm text-white font-mono">
                    {pos.quantity}
                  </div>
                  <div className="col-span-2 text-right text-sm text-slate-300 font-mono">
                    {(avgPrice * 100).toFixed(1)}¢
                  </div>
                  <div className="col-span-1 text-right text-sm text-white font-mono">
                    ${pos.costBasis.toFixed(2)}
                  </div>
                  <div className="col-span-2 text-right text-sm text-slate-300 font-mono">
                    {pos.currentValue !== undefined
                      ? `$${pos.currentValue.toFixed(2)}`
                      : '—'}
                  </div>
                  <div className="col-span-2 text-right">
                    {pos.unrealizedPnl !== undefined ? (
                      <span className={`text-sm font-semibold font-mono ${
                        pos.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-500">—</span>
                    )}
                  </div>
                </Link>
              )
            })}
            </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── SECTION 3: Closed Positions ─── */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle className="w-5 h-5 text-slate-400" />
          <h2 className="text-2xl font-bold text-white">Closed Positions</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 font-medium">
            {closedPositions.length}
          </span>
          {closedPositions.length > 0 && (
            <span className={`text-sm font-semibold ml-auto ${totalClosedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              Realized P&L: {totalClosedPnl >= 0 ? '+' : ''}${totalClosedPnl.toFixed(2)}
            </span>
          )}
        </div>

        {closedPositions.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 text-center py-10">
            <p className="text-slate-400">No resolved positions yet</p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-700 overflow-hidden overflow-x-auto">
            <div className="min-w-[640px]">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-slate-800/80 text-xs text-slate-400 uppercase tracking-wider font-medium sticky top-0 z-10">
              <div className="col-span-4">Market</div>
              <div className="col-span-1 text-center">Side</div>
              <div className="col-span-2 text-center">Result</div>
              <div className="col-span-1 text-right">Shares</div>
              <div className="col-span-2 text-right">Cost</div>
              <div className="col-span-2 text-right">Realized P&L</div>
            </div>

            <div className={`overflow-y-auto ${showAllClosed ? 'max-h-[600px]' : 'max-h-60'}`}>
            {closedPositions.map((pos) => {
              const outcome = pos.market
                ? pos.market.outcomes[pos.outcomeIndex] || `Outcome ${pos.outcomeIndex}`
                : `Outcome ${pos.outcomeIndex}`

              return (
                <Link
                  key={pos.id}
                  href={`/markets/${pos.marketId}`}
                  className="grid grid-cols-12 gap-4 px-4 py-3 border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors items-center group"
                >
                  <div className="col-span-4 text-sm text-slate-300 group-hover:text-white transition truncate">
                    {pos.market?.question || `Market ${pos.marketId.slice(0, 8)}...`}
                  </div>
                  <div className="col-span-1 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      pos.outcomeIndex === 0
                        ? 'bg-green-900/40 text-green-400'
                        : 'bg-red-900/40 text-red-400'
                    }`}>
                      {outcome}
                    </span>
                  </div>
                  <div className="col-span-2 text-center">
                    {pos.won ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Won
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">
                        <XCircle className="w-3.5 h-3.5" />
                        Lost
                      </span>
                    )}
                  </div>
                  <div className="col-span-1 text-right text-sm text-slate-400 font-mono">
                    {pos.quantity}
                  </div>
                  <div className="col-span-2 text-right text-sm text-slate-400 font-mono">
                    ${pos.costBasis.toFixed(2)}
                  </div>
                  <div className="col-span-2 text-right">
                    <span className={`text-sm font-semibold font-mono ${
                      (pos.pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(pos.pnl ?? 0) >= 0 ? '+' : ''}${(pos.pnl ?? 0).toFixed(2)}
                    </span>
                  </div>
                </Link>
              )
            })}
            </div>

            {/* Show more/less toggle */}
            {closedPositions.length > 5 && (
              <button
                onClick={() => setShowAllClosed(!showAllClosed)}
                className="w-full py-2.5 text-center text-sm text-slate-400 hover:text-white hover:bg-slate-700/50 transition border-t border-slate-700/50"
              >
                {showAllClosed ? 'Show less' : `Show all ${closedPositions.length} positions`}
              </button>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Deposit/Withdraw Modal */}
      <DepositWithdrawModal
        isOpen={showFundsModal}
        onClose={() => setShowFundsModal(false)}
      />
    </div>
  )
}
