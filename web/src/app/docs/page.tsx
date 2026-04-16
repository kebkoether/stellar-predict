'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

interface Endpoint {
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  description: string
  params?: { name: string; type: string; desc: string }[]
  body?: { name: string; type: string; desc: string; required?: boolean }[]
  response?: string
}

interface Section {
  title: string
  description: string
  endpoints: Endpoint[]
}

const sections: Section[] = [
  {
    title: 'Markets',
    description: 'Browse and create prediction markets. Prices are enriched with live orderbook data and oracle reference feeds.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/markets',
        description: 'List all markets with live prices, volume, and oracle data. Prices within event groups are normalized to sum to $1.00.',
        response: `[{
  "id": "uuid",
  "question": "Will the Thunder win the 2026 NBA Finals?",
  "outcomes": ["Yes", "No"],
  "status": "open",
  "yesPrice": 0.42,
  "noPrice": 0.58,
  "yesProbability": 42,
  "oraclePrice": 0.415,
  "volume": 150.00,
  "eventId": "nba-champ-2026",
  "resolutionDate": "2026-06-30T00:00:00.000Z"
}]`,
      },
      {
        method: 'GET',
        path: '/api/markets/:id',
        description: 'Get a single market by ID.',
        params: [{ name: 'id', type: 'string', desc: 'Market UUID' }],
      },
      {
        method: 'POST',
        path: '/api/markets',
        description: 'Create a new market. Requires a $25 USDC bond from the creator (refunded on resolution).',
        body: [
          { name: 'question', type: 'string', desc: 'The prediction question', required: true },
          { name: 'description', type: 'string', desc: 'Detailed description', required: true },
          { name: 'outcomes', type: 'string[]', desc: 'Array of outcome labels (min 2)', required: true },
          { name: 'collateralCode', type: 'string', desc: 'Token code (e.g. "USDC")', required: true },
          { name: 'collateralIssuer', type: 'string', desc: 'Stellar asset issuer address', required: true },
          { name: 'resolutionTime', type: 'ISO 8601', desc: 'When the market resolves', required: true },
          { name: 'createdBy', type: 'string', desc: 'Creator user/wallet ID', required: true },
        ],
      },
    ],
  },
  {
    title: 'Orders',
    description: 'Place and cancel orders on prediction markets. Supports limit, market, IOC, and FOK order types.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/markets/:id/orders',
        description: 'Place an order. Market orders fill instantly against the book. Limit orders rest until matched.',
        params: [{ name: 'id', type: 'string', desc: 'Market UUID' }],
        body: [
          { name: 'userId', type: 'string', desc: 'Your wallet address', required: true },
          { name: 'side', type: '"buy" | "sell"', desc: 'Buy YES tokens or sell (short)', required: true },
          { name: 'outcomeIndex', type: 'number', desc: '0 = first outcome, 1 = second, etc.', required: true },
          { name: 'price', type: 'number', desc: 'Price per share (0–1). Ignored for market orders.', required: true },
          { name: 'quantity', type: 'number', desc: 'Number of shares', required: true },
          { name: 'type', type: '"limit" | "market" | "ioc" | "fok"', desc: 'Order type', required: true },
        ],
        response: `{
  "order": { "id": "uuid", "status": "open", ... },
  "trades": [{ "price": 0.42, "quantity": 10, ... }],
  "status": "filled",
  "message": "Order filled"
}`,
      },
      {
        method: 'DELETE',
        path: '/api/markets/:id/orders/:orderId',
        description: 'Cancel an open order. Locked collateral is returned to your available balance.',
        params: [
          { name: 'id', type: 'string', desc: 'Market UUID' },
          { name: 'orderId', type: 'string', desc: 'Order UUID' },
        ],
      },
    ],
  },
  {
    title: 'Orderbook',
    description: 'View the live order book for any market outcome.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/markets/:id/orderbook/:outcomeIndex',
        description: 'Get bids and asks for a specific outcome. Returns price levels aggregated by price.',
        params: [
          { name: 'id', type: 'string', desc: 'Market UUID' },
          { name: 'outcomeIndex', type: 'number', desc: 'Outcome index (0, 1, ...)' },
        ],
        response: `{
  "bids": [{ "price": 0.40, "quantity": 25 }],
  "asks": [{ "price": 0.45, "quantity": 15 }]
}`,
      },
    ],
  },
  {
    title: 'Trades',
    description: 'View recent trade history for any market.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/markets/:id/trades',
        description: 'Get recent trades. Defaults to 100, max 1000.',
        params: [
          { name: 'id', type: 'string', desc: 'Market UUID' },
          { name: 'limit', type: 'number (query)', desc: 'Max trades to return (default 100)' },
        ],
      },
    ],
  },
  {
    title: 'Users',
    description: 'User balances, positions, and order history.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/users/:userId/balances',
        description: 'Get available and locked USDC balance for a user.',
        params: [{ name: 'userId', type: 'string', desc: 'Wallet address' }],
        response: `{
  "userId": "GDWJK...",
  "available": 35.00,
  "locked": 10.00
}`,
      },
      {
        method: 'GET',
        path: '/api/users/:userId/positions',
        description: 'Get all positions (token holdings) for a user across all markets.',
        params: [{ name: 'userId', type: 'string', desc: 'Wallet address' }],
      },
      {
        method: 'GET',
        path: '/api/users/:userId/orders',
        description: 'Get all orders (open, filled, cancelled) for a user.',
        params: [{ name: 'userId', type: 'string', desc: 'Wallet address' }],
      },
    ],
  },
  {
    title: 'Deposits & Withdrawals',
    description: 'On-chain USDC deposits and withdrawals via the Stellar network. Withdrawals require wallet signature verification.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/deposit/check-trustline/:accountId',
        description: 'Check if a Stellar account has the USDC trustline set up.',
        params: [{ name: 'accountId', type: 'string', desc: 'Stellar public key' }],
      },
      {
        method: 'POST',
        path: '/api/deposit/build-trustline',
        description: 'Build an unsigned changeTrust XDR for the frontend to sign with Freighter.',
        body: [{ name: 'sourceAccount', type: 'string', desc: 'Stellar public key', required: true }],
      },
      {
        method: 'POST',
        path: '/api/deposit/build-tx',
        description: 'Build an unsigned USDC deposit payment XDR for Freighter signing.',
        body: [
          { name: 'sourceAccount', type: 'string', desc: 'Stellar public key', required: true },
          { name: 'amount', type: 'number', desc: 'USDC amount to deposit', required: true },
        ],
      },
      {
        method: 'POST',
        path: '/api/users/:userId/deposit-onchain',
        description: 'Verify an on-chain USDC payment and credit the internal balance.',
        body: [{ name: 'transactionHash', type: 'string', desc: 'Stellar transaction hash', required: true }],
      },
      {
        method: 'GET',
        path: '/api/auth/nonce/:userId',
        description: 'Get a nonce and unsigned auth transaction for withdrawal verification. The frontend signs this with Freighter.',
        params: [{ name: 'userId', type: 'string', desc: 'Wallet address' }],
      },
      {
        method: 'POST',
        path: '/api/users/:userId/withdraw',
        description: 'Withdraw USDC on-chain to your Stellar wallet. Requires a signed nonce for verification.',
        body: [
          { name: 'amount', type: 'number', desc: 'USDC amount to withdraw', required: true },
          { name: 'nonce', type: 'string', desc: 'Nonce from /api/auth/nonce', required: true },
          { name: 'signature', type: 'string', desc: 'Signed XDR from Freighter', required: true },
        ],
      },
    ],
  },
  {
    title: 'Misc',
    description: 'Health checks and leaderboard.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/health',
        description: 'Health check. Returns { status: "ok" }.',
      },
      {
        method: 'GET',
        path: '/api/leaderboard',
        description: 'Get the trading leaderboard ranked by profit.',
      },
    ],
  },
]

const methodColors: Record<string, string> = {
  GET: 'bg-blue-900/50 text-blue-300 border-blue-700',
  POST: 'bg-green-900/50 text-green-300 border-green-700',
  DELETE: 'bg-red-900/50 text-red-300 border-red-700',
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative mt-3">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-slate-700 hover:bg-slate-600 transition"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
      </button>
      <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 transition text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />}
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${methodColors[endpoint.method]}`}>
          {endpoint.method}
        </span>
        <code className="text-sm text-white font-mono">{endpoint.path}</code>
        <span className="text-sm text-slate-400 ml-auto hidden sm:block">{endpoint.description.slice(0, 60)}{endpoint.description.length > 60 ? '…' : ''}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-slate-700/50 pt-3 space-y-3">
          <p className="text-sm text-slate-300">{endpoint.description}</p>

          {endpoint.params && endpoint.params.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Path Parameters</h4>
              <div className="space-y-1">
                {endpoint.params.map(p => (
                  <div key={p.name} className="flex gap-3 text-sm">
                    <code className="text-green-400 font-mono">{p.name}</code>
                    <span className="text-slate-500">{p.type}</span>
                    <span className="text-slate-400">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {endpoint.body && endpoint.body.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Request Body (JSON)</h4>
              <div className="space-y-1">
                {endpoint.body.map(p => (
                  <div key={p.name} className="flex gap-3 text-sm flex-wrap">
                    <code className="text-green-400 font-mono">{p.name}</code>
                    <span className="text-slate-500">{p.type}</span>
                    {p.required && <span className="text-red-400 text-xs">required</span>}
                    <span className="text-slate-400">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {endpoint.response && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Example Response</h4>
              <CodeBlock code={endpoint.response} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DocsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-white mb-4">API Documentation</h1>
        <p className="text-lg text-slate-400 mb-6">
          Every endpoint that powers the Stellar (H)edge frontend is available to you.
          Build bots, dashboards, or integrations on top of our prediction markets.
        </p>
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">Base URL</h3>
          <code className="text-green-400 font-mono text-sm">{API_BASE}</code>
          <p className="text-xs text-slate-500 mt-2">All endpoints return JSON. Prices are decimals in [0, 1] representing probability.</p>
        </div>
      </div>

      <nav className="mb-12">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Sections</h2>
        <div className="flex flex-wrap gap-2">
          {sections.map(s => (
            <a
              key={s.title}
              href={`#${s.title.toLowerCase().replace(/[^a-z]/g, '-')}`}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white hover:border-slate-600 transition"
            >
              {s.title}
            </a>
          ))}
        </div>
      </nav>

      <div className="space-y-12">
        {sections.map(section => (
          <div key={section.title} id={section.title.toLowerCase().replace(/[^a-z]/g, '-')}>
            <h2 className="text-2xl font-bold text-white mb-2">{section.title}</h2>
            <p className="text-slate-400 mb-4">{section.description}</p>
            <div className="space-y-3">
              {section.endpoints.map((ep, i) => (
                <EndpointCard key={i} endpoint={ep} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16 bg-blue-900/20 border border-blue-800 rounded-xl p-6 text-center">
        <p className="text-blue-300 mb-2">
          <span className="font-semibold">Need help?</span> Reach out with your integration questions.
        </p>
        <a href="/contact" className="text-blue-400 hover:text-blue-300 underline text-sm">
          Contact the team
        </a>
      </div>
    </div>
  )
}
