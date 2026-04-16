'use client'

import { Shield, TrendingUp, Globe, Zap, Users, Lock } from 'lucide-react'
import Link from 'next/link'

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Hero */}
      <div className="mb-16">
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6">
          Hedge What Matters
        </h1>
        <p className="text-xl text-slate-300 leading-relaxed max-w-3xl">
          Stellar (H)edge is a prediction market built on the Stellar blockchain. We believe
          everyone — from small business owners to global enterprises — should be able to
          hedge against the real-world events that affect their lives and livelihoods.
        </p>
      </div>

      {/* Mission */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-white mb-4">Our Mission</h2>
        <p className="text-slate-300 leading-relaxed mb-4">
          Traditional insurance is slow, expensive, and riddled with gatekeepers. Prediction
          markets offer a fundamentally better primitive: transparent, peer-to-peer contracts
          that pay out based on observable outcomes. No claims adjusters, no exclusions,
          no waiting.
        </p>
        <p className="text-slate-300 leading-relaxed mb-4">
          Imagine a coffee farmer hedging against drought, a startup founder insuring against
          a regulatory change, or an event organizer protecting revenue against a cancellation.
          These are the use cases we're building toward — insurance and hedging against
          real-world concerns and business viability variables, accessible to anyone with
          a Stellar wallet.
        </p>
        <p className="text-slate-300 leading-relaxed">
          We start with high-profile events like elections and championships to prove the
          mechanism, then expand into the long tail of risks that traditional markets ignore.
        </p>
      </div>

      {/* Values Grid */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-white mb-8">What We Stand For</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            {
              icon: Shield,
              title: 'Zero-Sum Integrity',
              desc: 'Every dollar in has a dollar out. No house edge inflating prices, no unbacked positions. Buyer locks price, seller locks the complement — total always equals $1.00.',
            },
            {
              icon: Globe,
              title: 'On-Chain Settlement',
              desc: 'Trades settle in USDC on the Stellar network. Fast, cheap, transparent. Your funds are never locked in an opaque off-chain ledger.',
            },
            {
              icon: TrendingUp,
              title: 'Price Discovery',
              desc: 'Markets aggregate information better than any pundit or poll. Oracle reference prices from Polymarket seed fair value — real users set the real price.',
            },
            {
              icon: Users,
              title: 'Peer-to-Peer',
              desc: 'No market maker minting fake money. Every order is backed by a real person with real capital on the other side of the trade.',
            },
            {
              icon: Lock,
              title: 'Non-Custodial',
              desc: 'Connect your Freighter wallet, deposit USDC, trade. Withdraw anytime. We never hold your private keys.',
            },
            {
              icon: Zap,
              title: 'Open API',
              desc: 'Every endpoint that powers the frontend is available to you. Build bots, dashboards, or integrations on top of Stellar (H)edge.',
            },
          ].map((item, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
              <item.icon className="w-8 h-8 text-green-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-white mb-4">How It Works</h2>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8">
          <ol className="space-y-4 text-slate-300">
            <li className="flex gap-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-900/40 border border-green-700/50 flex items-center justify-center text-green-400 font-bold text-sm">1</span>
              <div><span className="font-semibold text-white">Connect</span> — Link your Freighter wallet and deposit USDC via the Stellar network.</div>
            </li>
            <li className="flex gap-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-900/40 border border-green-700/50 flex items-center justify-center text-green-400 font-bold text-sm">2</span>
              <div><span className="font-semibold text-white">Trade</span> — Buy YES or NO shares on any outcome. Market orders fill instantly; limit orders rest until matched.</div>
            </li>
            <li className="flex gap-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-900/40 border border-green-700/50 flex items-center justify-center text-green-400 font-bold text-sm">3</span>
              <div><span className="font-semibold text-white">Settle</span> — When the event resolves, winning shares pay $1.00 each. USDC is credited to your balance automatically.</div>
            </li>
            <li className="flex gap-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-900/40 border border-green-700/50 flex items-center justify-center text-green-400 font-bold text-sm">4</span>
              <div><span className="font-semibold text-white">Withdraw</span> — Pull your USDC back to your Stellar wallet anytime. On-chain, verifiable, yours.</div>
            </li>
          </ol>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center">
        <p className="text-slate-400 mb-6">
          Questions? Reach out or dive into the docs.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/contact" className="btn-primary px-6 py-3">
            Contact Us
          </Link>
          <Link href="/docs" className="px-6 py-3 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 transition">
            API Docs
          </Link>
        </div>
      </div>
    </div>
  )
}
