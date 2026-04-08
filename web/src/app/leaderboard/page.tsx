'use client'

import { useState, useEffect } from 'react'
import { Trophy, Medal, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'
import { useWalletContext } from '@/context/WalletContext'

interface LeaderboardEntry {
  userId: string
  available: number
  locked: number
  totalDeposited: number
  totalPnl: number
  marketsTraded: number
  marketsWon: number
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-400" />
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-300" />
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />
  return <span className="text-sm text-slate-500 font-mono w-5 text-center">{rank}</span>
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const { publicKey } = useWalletContext()

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch(`${API_BASE}/leaderboard`)
        if (res.ok) {
          const data = await res.json()
          // Filter out users with no activity
          setEntries(data.filter((e: LeaderboardEntry) => e.marketsTraded > 0))
        }
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchLeaderboard()
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/20 mb-4">
          <Trophy className="w-8 h-8 text-yellow-400" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">Leaderboard</h1>
        <p className="text-slate-400">Top traders ranked by realized profit &amp; loss</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-slate-800 rounded-lg h-16 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 bg-slate-800/50 border border-slate-700 rounded-lg">
          <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg mb-2">No traders yet</p>
          <p className="text-slate-500 text-sm">Start trading to appear on the leaderboard</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2 text-xs text-slate-400 uppercase tracking-wider font-medium">
            <div className="col-span-1">#</div>
            <div className="col-span-4">Trader</div>
            <div className="col-span-2 text-right">P&L</div>
            <div className="col-span-2 text-right">Balance</div>
            <div className="col-span-1 text-right">Markets</div>
            <div className="col-span-2 text-right">Win Rate</div>
          </div>

          {/* Rows */}
          {entries.map((entry, index) => {
            const rank = index + 1
            const isYou = publicKey && entry.userId === publicKey
            const winRate = entry.marketsTraded > 0
              ? ((entry.marketsWon / entry.marketsTraded) * 100).toFixed(0)
              : '0'

            return (
              <div
                key={entry.userId}
                className={`rounded-lg border transition ${
                  isYou
                    ? 'border-green-500/40 bg-green-900/10'
                    : rank <= 3
                    ? 'border-yellow-500/20 bg-slate-800/80'
                    : 'border-slate-700 bg-slate-800/50'
                }`}
              >
                {/* Desktop row */}
                <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-4 items-center">
                  <div className="col-span-1 flex items-center justify-center">
                    {getRankIcon(rank)}
                  </div>
                  <div className="col-span-4">
                    <span className="text-sm font-mono text-white">
                      {truncateAddress(entry.userId)}
                    </span>
                    {isYou && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
                        You
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-right">
                    <span className={`text-sm font-semibold font-mono ${
                      entry.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {entry.totalPnl >= 0 ? '+' : ''}${entry.totalPnl.toFixed(2)}
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-sm text-slate-300 font-mono">
                    ${(entry.available + entry.locked).toFixed(2)}
                  </div>
                  <div className="col-span-1 text-right text-sm text-slate-400">
                    {entry.marketsTraded}
                  </div>
                  <div className="col-span-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-slate-700 rounded-full h-1.5">
                        <div
                          className="bg-green-500 h-1.5 rounded-full"
                          style={{ width: `${winRate}%` }}
                        />
                      </div>
                      <span className="text-sm text-slate-400 w-10 text-right">{winRate}%</span>
                    </div>
                  </div>
                </div>

                {/* Mobile card */}
                <div className="sm:hidden px-4 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    {getRankIcon(rank)}
                    <span className="text-sm font-mono text-white">
                      {truncateAddress(entry.userId)}
                    </span>
                    {isYou && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
                        You
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">P&L</p>
                      <p className={`text-sm font-semibold font-mono ${
                        entry.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {entry.totalPnl >= 0 ? '+' : ''}${entry.totalPnl.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Markets</p>
                      <p className="text-sm text-white">{entry.marketsTraded}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Win Rate</p>
                      <p className="text-sm text-white">{winRate}%</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
