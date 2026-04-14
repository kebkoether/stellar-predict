'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Clock, Activity, ChevronDown, ChevronUp } from 'lucide-react'
import OrderEntry from '@/components/OrderEntry'
import InlineOrderBook from '@/components/InlineOrderBook'
import { useWalletContext } from '@/context/WalletContext'

interface Market {
  id: string
  question: string
  description: string
  outcomes: string[]
  status: string
  yesPrice?: number
  yesProbability?: number
  resolutionTime: string
  resolutionDate?: string
  category?: string
  eventId?: string
  eventTitle?: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

function extractShortName(question: string): string {
  return question
    .replace(/^Will (the )?/i, '')
    .replace(/win.*$/i, '')
    .replace(/\?.*$/i, '')
    .trim()
}

export default function EventPage() {
  const params = useParams()
  const eventId = params.eventId as string
  const { connected, publicKey } = useWalletContext()

  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null)
  const [expandedMarketId, setExpandedMarketId] = useState<string | null>(null)
  const [eventTitle, setEventTitle] = useState('')
  const [category, setCategory] = useState('')
  const [sidebarAction, setSidebarAction] = useState<'buy' | 'sell'>('buy')
  const [sidebarPulse, setSidebarPulse] = useState(false)

  const fetchMarkets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/markets`)
      if (!res.ok) throw new Error('Failed to fetch markets')
      const all: Market[] = await res.json()
      const eventMarkets = all
        .filter(m => m.eventId === eventId)
        .sort((a, b) => (b.yesPrice ?? 0) - (a.yesPrice ?? 0))
      setMarkets(eventMarkets)
      if (eventMarkets.length > 0) {
        setEventTitle(eventMarkets[0].eventTitle || eventId)
        setCategory(eventMarkets[0].category || 'Sports')
        if (!selectedMarketId) {
          setSelectedMarketId(eventMarkets[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to fetch event markets:', error)
    } finally {
      setLoading(false)
    }
  }, [eventId, selectedMarketId])

  useEffect(() => {
    fetchMarkets()
    const interval = setInterval(fetchMarkets, 10000)
    return () => clearInterval(interval)
  }, [fetchMarkets])

  const selectedMarket = markets.find(m => m.id === selectedMarketId)
  const totalProb = markets.reduce((s, m) => s + (m.yesProbability ?? 0), 0)
  const resolutionDate = selectedMarket
    ? new Date(selectedMarket.resolutionDate || selectedMarket.resolutionTime)
    : null

  const handleOutcomeClick = (marketId: string) => {
    setSelectedMarketId(marketId)
    setSidebarAction('buy')
    // Toggle orderbook expansion
    setExpandedMarketId(prev => prev === marketId ? null : marketId)
  }

  const scrollToSidebar = () => {
    const el = document.getElementById('order-sidebar')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setSidebarPulse(true)
      setTimeout(() => setSidebarPulse(false), 1500)
    }
  }

  const handleQuickBuy = (e: React.MouseEvent, marketId: string) => {
    e.stopPropagation()
    setSelectedMarketId(marketId)
    setSidebarAction('buy')
    scrollToSidebar()
  }

  const handleQuickSell = (e: React.MouseEvent, marketId: string) => {
    e.stopPropagation()
    setSelectedMarketId(marketId)
    setSidebarAction('sell')
    scrollToSidebar()
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-slate-800 rounded-lg h-96 animate-pulse"></div>
      </div>
    )
  }

  if (markets.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <p className="text-slate-400">Event not found</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Event Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="badge badge-blue text-xs">{category}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
            Multi-outcome
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-600/30 text-slate-400">
            {markets.length} outcomes
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3">
          {eventTitle}
        </h1>
        <div className="flex items-center gap-6 text-sm text-slate-400">
          {resolutionDate && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Resolves {resolutionDate.toLocaleDateString()}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Activity className="w-4 h-4" />
            Prob. sum: {totalProb}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Outcomes List — Main Content */}
        <div className="lg:col-span-2">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-6 py-3 border-b border-slate-700 text-xs text-slate-400 uppercase tracking-widest">
              <span>Outcome</span>
              <span className="w-16 text-center">Chance</span>
              <span className="w-20 text-center">Buy Yes</span>
              <span className="w-20 text-center">Buy No</span>
            </div>

            <div className="divide-y divide-slate-700/50">
              {markets.map((m) => {
                const pct = m.yesProbability ?? Math.round((m.yesPrice ?? 0.5) * 100)
                const price = m.yesPrice ?? 0.5
                const yesPrice = Math.round(price * 100)
                const noPrice = 100 - yesPrice
                const shortName = extractShortName(m.question)
                const isSelected = m.id === selectedMarketId
                const isExpanded = m.id === expandedMarketId

                return (
                  <div key={m.id}>
                    {/* Outcome Row */}
                    <div
                      onClick={() => handleOutcomeClick(m.id)}
                      className={`grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-6 py-4 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-slate-700/30'
                          : 'hover:bg-slate-700/20'
                      }`}
                    >
                      {/* Name + probability bar */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium truncate ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                            {shortName}
                          </p>
                          <div className="w-full bg-slate-700 rounded-full h-1 mt-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isSelected ? 'bg-green-500' : 'bg-slate-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Chance */}
                      <div className="w-16 text-center">
                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                          {pct}%
                        </span>
                      </div>

                      {/* Buy Yes button */}
                      <button
                        onClick={(e) => handleQuickBuy(e, m.id)}
                        className={`w-20 py-1.5 rounded-lg text-sm font-bold transition border ${
                          isSelected && sidebarAction === 'buy'
                            ? 'bg-green-600 border-green-500 text-white'
                            : 'bg-green-900/30 border-green-700/50 text-green-400 hover:bg-green-900/50 hover:border-green-600'
                        }`}
                      >
                        {yesPrice}¢
                      </button>

                      {/* Buy No button */}
                      <button
                        onClick={(e) => handleQuickSell(e, m.id)}
                        className={`w-20 py-1.5 rounded-lg text-sm font-bold transition border ${
                          isSelected && sidebarAction === 'sell'
                            ? 'bg-red-600 border-red-500 text-white'
                            : 'bg-red-900/30 border-red-700/50 text-red-400 hover:bg-red-900/50 hover:border-red-600'
                        }`}
                      >
                        {noPrice}¢
                      </button>
                    </div>

                    {/* Expanded Orderbook */}
                    {isExpanded && (
                      <div className="px-6 pb-4 bg-slate-800/80 border-t border-slate-700/50">
                        <div className="flex items-center justify-between py-2">
                          <span className="text-xs text-slate-400 uppercase tracking-widest">
                            Order Book — {shortName}
                          </span>
                          <button
                            onClick={() => setExpandedMarketId(null)}
                            className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                          >
                            <ChevronUp className="w-3 h-3" />
                            Collapse
                          </button>
                        </div>
                        <InlineOrderBook marketId={m.id} />
                        <div className="mt-2 text-center">
                          <Link
                            href={`/markets/${m.id}`}
                            className="text-xs text-green-400 hover:underline"
                          >
                            View full market details &rarr;
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Sidebar — Order Entry for Selected Outcome */}
        <div id="order-sidebar" className={`space-y-6 transition-all duration-500 ${sidebarPulse ? 'ring-2 ring-green-500/50 rounded-xl' : ''}`}>
          {selectedMarket && selectedMarket.status !== 'resolved' ? (
            <>
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Trading</p>
                <p className="text-lg font-semibold text-white">{extractShortName(selectedMarket.question)}</p>
                <p className="text-sm text-slate-400 mt-1">{selectedMarket.question}</p>
              </div>

              <OrderEntry
                marketId={selectedMarket.id}
                outcomes={selectedMarket.outcomes}
                onOrderPlaced={() => {
                  setTimeout(() => fetchMarkets(), 1000)
                }}
                initialYesPrice={selectedMarket.yesPrice}
                initialAction={sidebarAction}
              />
            </>
          ) : (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 text-center">
              <p className="text-slate-400">Select an outcome to start trading</p>
            </div>
          )}

          {/* Event Info */}
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-300">
              <span className="font-semibold">How it works:</span> Each outcome is a separate YES/NO market.
              Buy YES on the outcome you think will win. If correct, each share pays $1.00.
              Probabilities are normalized so they sum to ~100%.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
