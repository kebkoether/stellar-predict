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
                <linearGradient id="nb" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#4ADE80"/>
                  <stop offset="100%" stopColor="#166534"/>
                </linearGradient>
                <linearGradient id="ng" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#FDE68A"/>
                  <stop offset="100%" stopColor="#F59E0B"/>
                </linearGradient>
              </defs>
              <rect width="256" height="256" rx="48" fill="#0F172A"/>
              <ellipse cx="128" cy="195" rx="100" ry="45" fill="#166534"/>
              <ellipse cx="75" cy="170" rx="60" ry="50" fill="url(#nb)"/>
              <ellipse cx="180" cy="165" rx="60" ry="55" fill="url(#nb)"/>
              <ellipse cx="128" cy="155" rx="65" ry="48" fill="#22C55E"/>
              <ellipse cx="128" cy="140" rx="45" ry="30" fill="#4ADE80"/>
              <text x="80" y="105" fontFamily="Arial" fontSize="48" fontWeight="900" fill="url(#ng)" opacity="0.95">$</text>
              <text x="128" y="78" fontFamily="Arial" fontSize="56" fontWeight="900" fill="url(#ng)">$</text>
              <text x="168" y="100" fontFamily="Arial" fontSize="40" fontWeight="900" fill="url(#ng)" opacity="0.85">$</text>
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
