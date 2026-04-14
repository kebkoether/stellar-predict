'use client'

import { useEffect, useState } from 'react'
import { Shield, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

type Solvency = {
  solvent: boolean
  surplus: number
  onChainUsdc: number
  totalAvailable: number
  totalLocked: number
  totalActivePositionCost: number
  totalLiabilities: number
  userCount: number
  marketCount: number
  openMarkets: number
}

type Audit = {
  recentDeposits: Array<{ tx_hash: string; user_id: string; amount: number; processed_at: string }>
  recentWithdrawals: Array<{ id: string; user_id: string; amount: number; tx_hash: string | null; status: string; created_at: string }>
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [solvency, setSolvency] = useState<Solvency | null>(null)
  const [audit, setAudit] = useState<Audit | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // Very simple local-only gate. NOT real security — for a friends-only preview.
  // Set NEXT_PUBLIC_ADMIN_PASSWORD in .env.local to override "admin".
  const ADMIN_PW = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin'

  const loadData = async () => {
    setLoading(true); setErr('')
    try {
      const [s, a] = await Promise.all([
        fetch(`${API_BASE}/admin/solvency`).then(r => r.json()),
        fetch(`${API_BASE}/admin/audit`).then(r => r.json()),
      ])
      setSolvency(s)
      setAudit(a)
    } catch (e: any) {
      setErr(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authed) {
      loadData()
      const t = setInterval(loadData, 15000)
      return () => clearInterval(t)
    }
  }, [authed])

  if (!authed) {
    return (
      <div className="max-w-sm mx-auto mt-20 p-6 bg-slate-800 rounded-xl border border-slate-700">
        <h1 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5" /> Admin
        </h1>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && password === ADMIN_PW && setAuthed(true)}
          placeholder="Admin password"
          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white mb-3"
        />
        <button
          onClick={() => password === ADMIN_PW ? setAuthed(true) : setErr('Wrong password')}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded"
        >
          Unlock
        </button>
        {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
      </div>
    )
  }

  const fmt = (n: number) => `$${n.toFixed(2)}`

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-6 h-6" /> Stellar (H)edge Admin
        </h1>
        <button onClick={loadData} disabled={loading}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded flex items-center gap-2 text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Solvency banner */}
      {solvency && (
        <div className={`p-5 rounded-xl border ${
          solvency.solvent
            ? 'bg-green-900/30 border-green-700'
            : 'bg-red-900/40 border-red-600'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            {solvency.solvent
              ? <CheckCircle className="w-6 h-6 text-green-400" />
              : <AlertTriangle className="w-6 h-6 text-red-400" />}
            <h2 className="text-lg font-bold">
              {solvency.solvent ? 'SOLVENT' : 'INSOLVENT — INVESTIGATE IMMEDIATELY'}
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Stat label="On-chain USDC" value={fmt(solvency.onChainUsdc)} />
            <Stat label="Total liabilities" value={fmt(solvency.totalLiabilities)} />
            <Stat label="Surplus" value={fmt(solvency.surplus)}
              color={solvency.surplus >= 0 ? 'text-green-400' : 'text-red-400'} />
            <Stat label="Users" value={String(solvency.userCount)} />
          </div>
        </div>
      )}

      {/* Breakdown */}
      {solvency && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h3 className="font-semibold mb-3">Liability breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <Stat label="Available (cash)" value={fmt(solvency.totalAvailable)} />
            <Stat label="Locked (open orders)" value={fmt(solvency.totalLocked)} />
            <Stat label="Open positions (collateral)" value={fmt(solvency.totalActivePositionCost)} />
            <Stat label="Markets total" value={String(solvency.marketCount)} />
            <Stat label="Markets open" value={String(solvency.openMarkets)} />
          </div>
        </div>
      )}

      {/* Audit log */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AuditPanel title="Recent Deposits" rows={audit?.recentDeposits?.map(d => ({
          when: d.processed_at,
          who: d.user_id,
          amount: d.amount,
          ref: d.tx_hash,
        })) || []} />
        <AuditPanel title="Recent Withdrawals" rows={audit?.recentWithdrawals?.map(w => ({
          when: w.created_at,
          who: w.user_id,
          amount: w.amount,
          ref: w.tx_hash || w.status,
        })) || []} />
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-mono font-semibold ${color || 'text-white'}`}>{value}</p>
    </div>
  )
}

function AuditPanel({ title, rows }: { title: string; rows: Array<{ when: string; who: string; amount: number; ref: string | null }> }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <h3 className="font-semibold mb-3">{title}</h3>
      {rows.length === 0 && <p className="text-sm text-slate-500">None yet</p>}
      <div className="space-y-2 text-xs font-mono">
        {rows.slice(0, 10).map((r, i) => (
          <div key={i} className="flex justify-between border-b border-slate-700 pb-1">
            <span className="text-slate-300 truncate max-w-[8rem]">{r.who.slice(0, 10)}…</span>
            <span className="text-white">${r.amount.toFixed(2)}</span>
            <span className="text-slate-400 truncate max-w-[8rem]">{r.ref ? r.ref.slice(0, 10) + '…' : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
