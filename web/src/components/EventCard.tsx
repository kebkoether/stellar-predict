'use client'

import Link from 'next/link'
import { Users } from 'lucide-react'

interface EventMarket {
  id: string
  question: string
  yesPrice?: number
  category?: string
}

interface EventCardProps {
  eventId: string
  eventTitle: string
  markets: EventMarket[]
  category?: string
  resolutionDate?: string
}

export default function EventCard({ eventId, eventTitle, markets, category, resolutionDate }: EventCardProps) {
  const cat = category || 'Sports'

  return (
    <div className="card-interactive group">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="badge badge-blue text-xs">{cat}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
            Multi-outcome
          </span>
        </div>
        <Users className="w-4 h-4 text-slate-500 group-hover:text-green-400 transition" />
      </div>

      {/* Event Title */}
      <h3 className="text-lg font-semibold text-white mb-4 group-hover:text-green-300 transition">
        {eventTitle}
      </h3>

      {/* Outcome list with prices */}
      <div className="space-y-2 mb-4">
        {markets.slice(0, 5).map((m) => {
          const pct = m.yesPrice ? Math.round(m.yesPrice * 100) : 50
          // Extract short name from question (e.g., "Will the Thunder win..." → "Thunder")
          const shortName = m.question
            .replace(/^Will (the )?/i, '')
            .replace(/win.*$/i, '')
            .replace(/\?.*$/i, '')
            .trim()

          return (
            <Link key={m.id} href={`/markets/${m.id}`}>
              <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-700/50 transition cursor-pointer">
                <span className="text-sm text-slate-200 truncate mr-3">{shortName}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-16 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-green-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-mono font-semibold text-green-400 w-10 text-right">{pct}¢</span>
                </div>
              </div>
            </Link>
          )
        })}
        {markets.length > 5 && (
          <Link href={`/markets/${markets[0].id}`}>
            <p className="text-xs text-slate-400 hover:text-white transition pl-2">
              +{markets.length - 5} more outcomes →
            </p>
          </Link>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-700">
        <span>{markets.length} outcomes</span>
        {resolutionDate && <span>{new Date(resolutionDate).toLocaleDateString()}</span>}
      </div>
    </div>
  )
}
