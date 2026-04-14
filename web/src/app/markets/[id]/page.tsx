'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Clock, Users, Activity, CheckCircle, Trophy, XCircle } from 'lucide-react'
import OrderEntry from '@/components/OrderEntry'
import OrderBook from '@/components/OrderBook'
import TradeHistory from '@/components/TradeHistory'
import PriceChart from '@/components/PriceChart'
import ResolveMarketPanel from '@/components/ResolveMarketPanel'
import { useWalletContext } from '@/context/WalletContext'

interface Market {
  id: string
  question: string
  description: string
  outcomes: string[]
  status: string
  resolvedOutcomeIndex?: number
  collateralToken: { code: string; issuer: string }
  createdAt: string
  resolutionTime: string
  createdBy: string
}

interface OrderBookLevel {
  price: number
  quantity: number
  total: number
}

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

export default function MarketDetail() {
  const params = useParams()
  const marketId = params.id as string
  const { connected, publicKey } = useWalletContext()

  const [market, setMarket] = useState<Market | null>(null)
  const [loading, setLoading] = useState(true)
  const [bids, setBids] = useState<OrderBookLevel[]>([])
  const [asks, setAsks] = useState<OrderBookLevel[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [tradesLoading, setTradesLoading] = useState(true)
  const [orderBookLoading, setOrderBookLoading] = useState(true)
  const [yesPriceForDisplay, setYesPriceForDisplay] = useState(50)

  // Fetch market data
  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/markets/${marketId}`)
      if (!res.ok) throw new Error('Market not found')
      const data = await res.json()
      setMarket(data)
    } catch (error) {
      console.error('Failed to fetch market:', error)
    } finally {
      setLoading(false)
    }
  }, [marketId])

  useEffect(() => {
    fetchMarket()
  }, [fetchMarket])

  // Fetch order book for outcome 0 (YES)
  useEffect(() => {
    if (!market || market.status === 'resolved') return
    const fetchOrderBook = async () => {
      try {
        setOrderBookLoading(true)
        const res = await fetch(`${API_BASE}/markets/${marketId}/orderbook/0`)
        if (!res.ok) throw new Error('Failed to fetch orderbook')
        const data = await res.json()
        setBids(data.bids || [])
        setAsks(data.asks || [])
      } catch (error) {
        console.error('Failed to fetch orderbook:', error)
      } finally {
        setOrderBookLoading(false)
      }
    }
    fetchOrderBook()
    const interval = setInterval(fetchOrderBook, 5000)
    return () => clearInterval(interval)
  }, [marketId, market])

  // Fetch trades
  useEffect(() => {
    if (!market) return
    const fetchTrades = async () => {
      try {
        setTradesLoading(true)
        const res = await fetch(`${API_BASE}/markets/${marketId}/trades`)
        if (!res.ok) throw new Error('Failed to fetch trades')
        const data = await res.json()
        setTrades(Array.isArray(data) ? data : [])
        if (data && data.length > 0) {
          setYesPriceForDisplay(data[0].price * 100)
        }
      } catch (error) {
        console.error('Failed to fetch trades:', error)
      } finally {
        setTradesLoading(false)
      }
    }
    fetchTrades()
    if (market.status !== 'resolved') {
      const interval = setInterval(fetchTrades, 5000)
      return () => clearInterval(interval)
    }
  }, [marketId, market])

  const midPrice = bids.length > 0 && asks.length > 0
    ? ((bids[0].price + asks[asks.length - 1].price) / 2) * 100
    : yesPriceForDisplay

  const isResolved = market?.status === 'resolved'
  // For now, any connected wallet can resolve (admin/dev mode).
  // In production, replace with a whitelist: ADMIN_WALLETS.includes(publicKey)
  const isAdmin = connected && !!publicKey
  const winningOutcomeIndex = market?.resolvedOutcomeIndex
  const winningOutcome = isResolved && winningOutcomeIndex !== undefined
    ? market.outcomes[winningOutcomeIndex]
    : null

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-slate-800 rounded-lg h-96 animate-pulse"></div>
            <div className="bg-slate-800 rounded-lg h-96 animate-pulse"></div>
          </div>
          <div className="bg-slate-800 rounded-lg h-96 animate-pulse"></div>
        </div>
      </div>
    )
  }

  if (!market) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <p className="text-slate-400">Market not found</p>
        </div>
      </div>
    )
  }

  const resolutionDate = new Date(market.resolutionTime)
  const noPriceForDisplay = 100 - yesPriceForDisplay

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Resolved Banner */}
      {isResolved && winningOutcome && (
        <div className="mb-6 bg-emerald-900/20 border border-emerald-700/50 rounded-xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-emerald-400">Market Resolved</h2>
            <p className="text-slate-300">
              Winning outcome: <span className="font-semibold text-white">{winningOutcome}</span>
            </p>
          </div>
        </div>
      )}

      {/* Market Header */}
      <div className="mb-8">
        <div className="inline-block px-3 py-1 rounded-full mb-4" style={{
          background: isResolved ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
          border: `1px solid ${isResolved ? 'rgba(16, 185, 129, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
        }}>
          <span className={`text-sm font-semibold uppercase ${isResolved ? 'text-emerald-300' : 'text-blue-300'}`}>
            {market.status}
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
          {market.question}
        </h1>
        <p className="text-lg text-slate-300 max-w-3xl">
          {market.description}
        </p>

        {/* Market Info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">Status</p>
            <p className={`text-lg font-semibold capitalize ${isResolved ? 'text-emerald-400' : 'text-green-400'}`}>{market.status}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">Token</p>
            <p className="text-lg font-semibold text-white">{market.collateralToken.code}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex items-center space-x-3">
            <Clock className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Resolution</p>
              <p className="text-sm font-semibold text-white">
                {resolutionDate.toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex items-center space-x-3">
            <Users className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Creator</p>
              <p className="text-sm font-mono text-white truncate">{market.createdBy.slice(0, 10)}...</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Probability / Result Display */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8">
            {isResolved ? (
              <>
                <h2 className="text-2xl font-bold text-white mb-6">Final Result</h2>
                <div className="grid grid-cols-2 gap-6">
                  {market.outcomes.map((outcome, idx) => {
                    const isWinner = idx === winningOutcomeIndex
                    return (
                      <div key={idx} className={`text-center p-6 rounded-xl border ${
                        isWinner
                          ? 'border-emerald-500/40 bg-emerald-900/20'
                          : 'border-slate-700 bg-slate-800/30 opacity-50'
                      }`}>
                        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
                          isWinner
                            ? 'border-4 border-emerald-500/50 bg-emerald-900/30'
                            : 'border-4 border-slate-600/50 bg-slate-800/30'
                        }`}>
                          {isWinner ? (
                            <CheckCircle className="w-10 h-10 text-emerald-400" />
                          ) : (
                            <XCircle className="w-10 h-10 text-slate-600" />
                          )}
                        </div>
                        <p className={`text-xl font-bold mb-1 ${isWinner ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {outcome}
                        </p>
                        <p className={`text-3xl font-bold ${isWinner ? 'text-emerald-400' : 'text-slate-600'}`}>
                          {isWinner ? '$1.00' : '$0.00'}
                        </p>
                        {isWinner && (
                          <span className="inline-block mt-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold">
                            WINNER
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white mb-6">Current Probability</h2>
                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="text-center">
                    <p className="text-sm text-slate-400 mb-2">YES Probability</p>
                    <div className="inline-flex items-center justify-center w-32 h-32 rounded-full border-4 border-green-500/30 bg-green-900/10">
                      <p className="text-4xl font-bold text-green-400">
                        {yesPriceForDisplay.toFixed(0)}%
                      </p>
                    </div>
                    <p className="text-3xl font-bold text-green-400 mt-4">
                      {yesPriceForDisplay.toFixed(2)}¢
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-slate-400 mb-2">NO Probability</p>
                    <div className="inline-flex items-center justify-center w-32 h-32 rounded-full border-4 border-red-500/30 bg-red-900/10">
                      <p className="text-4xl font-bold text-red-400">
                        {noPriceForDisplay.toFixed(0)}%
                      </p>
                    </div>
                    <p className="text-3xl font-bold text-red-400 mt-4">
                      {noPriceForDisplay.toFixed(2)}¢
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Price Chart */}
          <PriceChart
            trades={trades}
            loading={tradesLoading}
          />

          {/* Order Book (only for active markets) */}
          {!isResolved && (
            <OrderBook
              bids={bids}
              asks={asks}
              midPrice={midPrice}
              loading={orderBookLoading}
            />
          )}

          {/* Trade History */}
          <TradeHistory
            trades={trades}
            loading={tradesLoading}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Order Entry (only for active markets) */}
          {!isResolved ? (
            <OrderEntry
              marketId={marketId}
              outcomes={market.outcomes}
              onOrderPlaced={() => {
                setTimeout(() => {
                  window.location.reload()
                }, 1000)
              }}
              initialYesPrice={midPrice / 100}
              initialAction="buy"
            />
          ) : (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 text-center">
              <Trophy className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-white mb-2">Market Settled</h3>
              <p className="text-sm text-slate-400 mb-4">
                This market has been resolved. Trading is closed.
              </p>
              <p className="text-sm text-slate-300">
                Winning outcome: <span className="font-bold text-emerald-400">{winningOutcome}</span>
              </p>
            </div>
          )}

          {/* Resolve Panel (admin — any connected wallet for now) */}
          {!isResolved && isAdmin && (
            <ResolveMarketPanel
              marketId={marketId}
              outcomes={market.outcomes}
              onResolved={() => fetchMarket()}
            />
          )}

          {/* Market Stats */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center space-x-2">
              <Activity className="w-5 h-5" />
              <span>Market Stats</span>
            </h3>
            <div className="space-y-4">
              {!isResolved && (
                <>
                  <div className="flex justify-between items-center pb-4 border-b border-slate-700">
                    <span className="text-slate-400">Mid Price</span>
                    <span className="font-semibold text-white">{midPrice.toFixed(2)}¢</span>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-slate-700">
                    <span className="text-slate-400">Spread</span>
                    <span className="font-semibold text-white">
                      {asks.length > 0 && bids.length > 0
                        ? ((asks[asks.length - 1].price - bids[0].price) * 100).toFixed(1)
                        : 'N/A'}¢
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Total Trades</span>
                <span className="font-semibold text-white">{trades.length}</span>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-300">
              <span className="font-semibold">Note:</span> {isResolved
                ? `This market has been settled. Winners received $1.00 per ${winningOutcome} share.`
                : `Trade YES and NO outcome shares. Settlement in ${market.collateralToken.code} on Stellar.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
