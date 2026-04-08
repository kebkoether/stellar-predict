'use client'

import { useState, useMemo } from 'react'
import { Search, Filter, Activity, CheckCircle, LayoutGrid } from 'lucide-react'
import MarketCard from '@/components/MarketCard'
import { useMarkets } from '@/hooks/useMarket'

const CATEGORIES = ['All', 'Politics', 'Crypto', 'Sports', 'Science', 'Tech', 'Entertainment', 'Business']
const STATUS_TABS = [
  { key: 'active', label: 'Active', icon: Activity },
  { key: 'resolved', label: 'Resolved', icon: CheckCircle },
  { key: 'all', label: 'All', icon: LayoutGrid },
] as const

type StatusFilter = 'active' | 'resolved' | 'all'

interface Market {
  id: string
  question: string
  yesPrice: number
  noPrice: number
  volume: number
  resolutionDate: string
  category: string
  yesProbability: number
  status?: string
  resolvedOutcomeIndex?: number
  outcomes?: string[]
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const { markets, loading } = useMarkets()

  const filteredMarkets = useMemo(() => {
    let filtered = markets as Market[]

    // Status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter((m) => m.status !== 'resolved')
    } else if (statusFilter === 'resolved') {
      filtered = filtered.filter((m) => m.status === 'resolved')
    }

    if (selectedCategory !== 'All') {
      filtered = filtered.filter((m) => m.category === selectedCategory)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((m) =>
        m.question.toLowerCase().includes(query)
      )
    }

    // Sort: active markets first, then by date
    filtered.sort((a, b) => {
      if (a.status === 'resolved' && b.status !== 'resolved') return 1
      if (a.status !== 'resolved' && b.status === 'resolved') return -1
      return 0
    })

    return filtered
  }, [markets, selectedCategory, searchQuery, statusFilter])

  const activeCt = useMemo(() => (markets as Market[]).filter(m => m.status !== 'resolved').length, [markets])
  const resolvedCt = useMemo(() => (markets as Market[]).filter(m => m.status === 'resolved').length, [markets])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-green-900/10 to-transparent pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative">
          <div className="text-center mb-12">
            <h1 className="text-5xl sm:text-6xl font-bold mb-4 bg-gradient-to-r from-green-400 via-white to-blue-400 bg-clip-text text-transparent">
              Trade Tomorrow, Today
            </h1>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Explore prediction markets on Stellar. Buy shares in events you believe will happen.
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto mb-12">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search markets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-12 pr-4 py-3 text-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Featured Markets (only show when on Active tab) */}
          {statusFilter !== 'resolved' && <div className="mb-16">
            <h2 className="text-2xl font-bold text-white mb-6">Trending Markets</h2>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-slate-800 rounded-lg h-64 animate-pulse"
                  ></div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredMarkets.slice(0, 6).map((market) => (
                  <MarketCard key={market.id} {...market} />
                ))}
              </div>
            )}
          </div>}
        </div>
      </div>

      {/* Categories and Markets */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Status Tabs */}
        <div className="mb-6">
          <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
            {STATUS_TABS.map(({ key, label, icon: Icon }) => {
              const count = key === 'active' ? activeCt : key === 'resolved' ? resolvedCt : markets.length
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
                    statusFilter === key
                      ? 'bg-slate-700 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    statusFilter === key ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/50 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Category Filter */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <Filter className="w-5 h-5 text-green-400" />
            <span>Browse by Category</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedCategory === category
                    ? 'bg-green-600 text-white shadow-lg shadow-green-600/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Markets Grid */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6">
            {statusFilter === 'resolved' ? 'Resolved' : statusFilter === 'active' ? 'Active' : 'All'}
            {selectedCategory !== 'All' ? ` ${selectedCategory}` : ''} Markets
            <span className="text-slate-400 text-lg ml-3">({filteredMarkets.length})</span>
          </h2>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(9)].map((_, i) => (
                <div
                  key={i}
                  className="bg-slate-800 rounded-lg h-64 animate-pulse"
                ></div>
              ))}
            </div>
          ) : filteredMarkets.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-400 text-lg">
                No markets found. Try adjusting your search.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
              {filteredMarkets.map((market) => (
                <MarketCard key={market.id} {...market} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border-t border-slate-700 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Want to create a market?
          </h2>
          <p className="text-slate-300 mb-8">
            Set the terms and fees for your own prediction market.
          </p>
          <a href="/create" className="btn-primary btn-lg inline-block">
            Create Market
          </a>
        </div>
      </div>
    </div>
  )
}
