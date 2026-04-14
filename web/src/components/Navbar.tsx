'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import WalletButton from '@/components/WalletButton'

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <Link href="/" className="text-xl font-bold text-white hover:text-slate-100 transition flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 256 256" className="flex-shrink-0">
              <defs>
                <linearGradient id="ng" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366F1"/>
                  <stop offset="50%" stopColor="#8B5CF6"/>
                  <stop offset="100%" stopColor="#EC4899"/>
                </linearGradient>
                <linearGradient id="nb" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#22C55E"/>
                  <stop offset="100%" stopColor="#166534"/>
                </linearGradient>
              </defs>
              <rect width="256" height="256" rx="48" fill="#0F172A"/>
              <ellipse cx="128" cy="180" rx="90" ry="50" fill="url(#nb)" opacity="0.9"/>
              <ellipse cx="90" cy="160" rx="50" ry="40" fill="url(#nb)"/>
              <ellipse cx="166" cy="155" rx="55" ry="45" fill="url(#nb)"/>
              <ellipse cx="128" cy="145" rx="45" ry="35" fill="#22C55E"/>
              <path d="M128 28 L138 68 L178 68 L146 90 L158 130 L128 108 L98 130 L110 90 L78 68 L118 68 Z" fill="url(#ng)"/>
            </svg>
            <span>Stellar <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">(H)edge</span></span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <Link href="/" className="text-slate-300 hover:text-white transition duration-200">
              Markets
            </Link>
            <Link href="/portfolio" className="text-slate-300 hover:text-white transition duration-200">
              Portfolio
            </Link>
            <Link href="/leaderboard" className="text-slate-300 hover:text-white transition duration-200">
              Leaderboard
            </Link>
            <Link href="/create" className="text-green-400 hover:text-green-300 transition duration-200 font-semibold">
              + Create
            </Link>
          </div>

          {/* Right Side — Wallet */}
          <div className="hidden md:flex items-center">
            <WalletButton />
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-slate-800 transition"
          >
            {isOpen ? (
              <X className="w-6 h-6 text-slate-300" />
            ) : (
              <Menu className="w-6 h-6 text-slate-300" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden pb-4 border-t border-slate-800">
            <div className="space-y-2 py-4">
              <Link
                href="/"
                className="block px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
                onClick={() => setIsOpen(false)}
              >
                Markets
              </Link>
              <Link
                href="/portfolio"
                className="block px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
                onClick={() => setIsOpen(false)}
              >
                Portfolio
              </Link>
              <Link
                href="/leaderboard"
                className="block px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
                onClick={() => setIsOpen(false)}
              >
                Leaderboard
              </Link>
              <Link
                href="/create"
                className="block px-4 py-2 text-green-400 hover:text-green-300 hover:bg-slate-800 rounded transition font-semibold"
                onClick={() => setIsOpen(false)}
              >
                + Create Market
              </Link>
            </div>
            <div className="px-4 pt-4 border-t border-slate-800">
              <WalletButton />
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
