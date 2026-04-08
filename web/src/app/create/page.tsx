'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, AlertCircle, Loader2, HelpCircle } from 'lucide-react'
import { useWalletContext } from '@/context/WalletContext'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

// Default USDC on testnet
const DEFAULT_COLLATERAL = {
  code: 'USDC',
  issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
}

const CATEGORIES = [
  { label: 'Crypto', emoji: '₿' },
  { label: 'Politics', emoji: '🏛️' },
  { label: 'Sports', emoji: '⚽' },
  { label: 'Tech', emoji: '💻' },
  { label: 'Science', emoji: '🔬' },
  { label: 'Entertainment', emoji: '🎬' },
  { label: 'Business', emoji: '📈' },
  { label: 'Other', emoji: '🌐' },
]

export default function CreateMarket() {
  const router = useRouter()
  const { connected, publicKey, connect } = useWalletContext()

  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Crypto')
  const [resolutionDate, setResolutionDate] = useState('')
  const [resolutionTime, setResolutionTime] = useState('00:00')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Get minimum date — today in local time (allow same-day markets)
  const today = new Date()
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!connected || !publicKey) {
      setError('Please connect your wallet first')
      return
    }

    if (!question.trim()) {
      setError('Please enter a question')
      return
    }

    if (!description.trim()) {
      setError('Please enter resolution criteria')
      return
    }

    if (!resolutionDate) {
      setError('Please set a resolution date')
      return
    }

    setLoading(true)

    try {
      // Build the date in the user's local timezone, then convert to ISO/UTC for the server
      const resDateTime = new Date(`${resolutionDate}T${resolutionTime}:00`).toISOString()

      const response = await fetch(`${API_BASE}/markets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          description: description.trim(),
          outcomes: ['Yes', 'No'],
          collateralCode: DEFAULT_COLLATERAL.code,
          collateralIssuer: DEFAULT_COLLATERAL.issuer,
          resolutionTime: resDateTime,
          createdBy: publicKey,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create market')
      }

      const market = await response.json()
      router.push(`/markets/${market.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create market')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-3">Create a Market</h1>
          <p className="text-slate-400 text-lg">
            Set up a prediction market for any future event. Others can trade YES and NO shares.
          </p>
        </div>

        {/* Not connected */}
        {!connected && (
          <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-8 text-center mb-8">
            <p className="text-blue-300 text-lg mb-4">Connect your wallet to create a market</p>
            <button onClick={connect} className="btn-primary">
              Connect Freighter
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Question */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 uppercase tracking-widest mb-2">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Will [event] happen by [date]?"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white text-lg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              maxLength={200}
            />
            <p className="text-xs text-slate-500 mt-2">
              {question.length}/200 — Make it specific and unambiguous
            </p>
          </div>

          {/* Resolution Criteria */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 uppercase tracking-widest mb-2">
              Resolution Criteria
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe exactly how this market will be resolved. Be specific about data sources, thresholds, and edge cases."
              rows={4}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition resize-none"
              maxLength={1000}
            />
            <p className="text-xs text-slate-500 mt-2">
              {description.length}/1000 — Clear criteria prevent disputes
            </p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 uppercase tracking-widest mb-3">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => setCategory(cat.label)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                    category === cat.label
                      ? 'bg-green-600 text-white shadow-lg shadow-green-600/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  {cat.emoji} {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution Date */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 uppercase tracking-widest mb-2">
              Resolution Date
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <input
                  type="date"
                  value={resolutionDate}
                  onChange={(e) => setResolutionDate(e.target.value)}
                  min={minDate}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <input
                  type="time"
                  value={resolutionTime}
                  onChange={(e) => setResolutionTime(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
                <p className="text-xs text-slate-500 mt-1">UTC time</p>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <div className="flex items-start space-x-3">
              <HelpCircle className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-slate-400 space-y-2">
                <p>Your market will have two outcomes: <span className="text-green-400 font-semibold">YES</span> and <span className="text-red-400 font-semibold">NO</span>. Shares trade between 1¢ and 99¢.</p>
                <p>Collateral: <span className="text-white font-semibold">USDC</span> on Stellar testnet. Each winning share pays out $1.00 on resolution.</p>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !connected}
            className="w-full py-4 px-6 rounded-xl text-lg font-bold transition bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-500 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-600/20"
          >
            {loading ? (
              <span className="flex items-center justify-center space-x-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Creating Market...</span>
              </span>
            ) : (
              <span className="flex items-center justify-center space-x-2">
                <Plus className="w-5 h-5" />
                <span>Create Market</span>
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
