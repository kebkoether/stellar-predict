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
          <Link href="/" className="text-xl font-bold text-white hover:text-slate-100 transition">
            Stellar Foresure
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
