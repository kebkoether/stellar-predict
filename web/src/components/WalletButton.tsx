'use client'

import { useState } from 'react'
import { Wallet, LogOut, Copy, Check, ChevronDown, DollarSign, ExternalLink, ArrowDownToLine } from 'lucide-react'
import { useWalletContext } from '@/context/WalletContext'
import DepositWithdrawModal from './DepositWithdrawModal'

export default function WalletButton() {
  const { connected, publicKey, loading, error, balance, onChainBalance, connect, disconnect } = useWalletContext()
  const [copied, setCopied] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [showFundsModal, setShowFundsModal] = useState(false)

  const truncateKey = (key: string | null) => {
    if (!key) return ''
    return `${key.slice(0, 4)}...${key.slice(-4)}`
  }

  const handleCopyKey = async () => {
    if (publicKey) {
      await navigator.clipboard.writeText(publicKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <button disabled className="btn-secondary flex items-center space-x-2 opacity-60">
        <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Checking...</span>
      </button>
    )
  }

  if (!connected) {
    return (
      <div>
        <button
          onClick={connect}
          className="btn-primary flex items-center space-x-2"
        >
          <Wallet className="w-4 h-4" />
          <span>Connect Freighter</span>
        </button>
        {error && (
          <p className="text-xs text-red-400 mt-1 max-w-[200px]">{error}</p>
        )}
      </div>
    )
  }

  return (
    <>
    <div className="relative">
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="btn-secondary flex items-center space-x-2"
      >
        <div className="w-2 h-2 bg-green-500 rounded-full" />
        <span className="text-sm font-mono">{truncateKey(publicKey)}</span>
        {balance && (
          <span className="text-xs text-green-400 font-semibold">
            ${balance.available.toFixed(2)}
          </span>
        )}
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {isDropdownOpen && (
        <>
          {/* Click-outside overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsDropdownOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
            {/* Address */}
            <div className="p-4 border-b border-slate-700">
              <p className="text-xs text-slate-400 mb-1">Wallet Address</p>
              <p className="text-xs font-mono text-slate-200 break-all">{publicKey}</p>
            </div>

            {/* Platform Balance */}
            <div className="p-4 border-b border-slate-700">
              <p className="text-xs text-slate-400 mb-2">Platform Balance</p>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-bold text-white">
                  ${balance?.available.toFixed(2) ?? '0.00'}
                </span>
                <span className="text-xs text-slate-400">available</span>
              </div>
              {balance && balance.locked > 0 && (
                <p className="text-xs text-yellow-400 mt-1">
                  ${balance.locked.toFixed(2)} locked in orders
                </p>
              )}
            </div>

            {/* On-chain Balance */}
            {onChainBalance && (
              <div className="px-4 py-3 border-b border-slate-700">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">On-chain USDC</span>
                  <span className="text-sm font-mono text-slate-200">
                    ${parseFloat(onChainBalance).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            <button
              onClick={() => {
                setShowFundsModal(true)
                setIsDropdownOpen(false)
              }}
              className="w-full text-left px-4 py-3 hover:bg-slate-700 transition flex items-center space-x-2 text-sm text-green-400"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>Deposit / Withdraw</span>
            </button>

            <button
              onClick={handleCopyKey}
              className="w-full text-left px-4 py-3 hover:bg-slate-700 transition flex items-center space-x-2 text-sm"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>Copy Address</span>
                </>
              )}
            </button>

            <a
              href={`https://stellar.expert/explorer/testnet/account/${publicKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-left px-4 py-3 hover:bg-slate-700 transition flex items-center space-x-2 text-sm"
            >
              <ExternalLink className="w-4 h-4 text-slate-400" />
              <span>View on Stellar Expert</span>
            </a>

            <button
              onClick={() => {
                disconnect()
                setIsDropdownOpen(false)
              }}
              className="w-full text-left px-4 py-3 hover:bg-slate-700 transition flex items-center space-x-2 text-sm text-red-400 border-t border-slate-700"
            >
              <LogOut className="w-4 h-4" />
              <span>Disconnect</span>
            </button>
          </div>
        </>
      )}
    </div>

    {/* Deposit/Withdraw Modal */}
    <DepositWithdrawModal
      isOpen={showFundsModal}
      onClose={() => setShowFundsModal(false)}
    />
    </>
  )
}
