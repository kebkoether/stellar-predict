'use client'

import { useState, useEffect } from 'react'
import { X, ArrowDownToLine, ArrowUpFromLine, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useWalletContext } from '@/context/WalletContext'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

interface DepositWithdrawModalProps {
  isOpen: boolean
  onClose: () => void
  defaultTab?: 'deposit' | 'withdraw'
}

export default function DepositWithdrawModal({
  isOpen,
  onClose,
  defaultTab = 'deposit',
}: DepositWithdrawModalProps) {
  const { publicKey, balance, onChainBalance, refreshBalance } = useWalletContext()
  const [tab, setTab] = useState<'deposit' | 'withdraw'>(defaultTab)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [hasTrustline, setHasTrustline] = useState<boolean | null>(null)
  const [checkingTrustline, setCheckingTrustline] = useState(false)

  // Check trustline status when modal opens or publicKey changes
  useEffect(() => {
    if (isOpen && publicKey) {
      checkTrustline()
    }
  }, [isOpen, publicKey])

  const checkTrustline = async () => {
    if (!publicKey) return
    setCheckingTrustline(true)
    try {
      const res = await fetch(`${API_BASE}/deposit/check-trustline/${publicKey}`)
      if (res.ok) {
        const data = await res.json()
        setHasTrustline(data.hasTrustline)
      }
    } catch {
      // If check fails, assume no trustline and let them try
      setHasTrustline(null)
    } finally {
      setCheckingTrustline(false)
    }
  }

  const handleSetupTrustline = async () => {
    if (!publicKey) return
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      // Step 1: Build unsigned changeTrust XDR
      setSuccess('Building trustline transaction...')
      const buildRes = await fetch(`${API_BASE}/deposit/build-trustline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceAccount: publicKey }),
      })

      if (!buildRes.ok) {
        const data = await buildRes.json()
        throw new Error(data.error || 'Failed to build trustline transaction')
      }

      const { xdr } = await buildRes.json()

      // Step 2: Sign with Freighter
      setSuccess('Please approve the trustline in Freighter...')
      const freighterApi = await import('@stellar/freighter-api')
      const signedXdr = await freighterApi.signTransaction(xdr, {
        networkPassphrase: 'Test SDF Network ; September 2015',
      })

      // Step 3: Submit to Horizon
      setSuccess('Submitting to Stellar network...')
      const submitRes = await fetch('https://horizon-testnet.stellar.org/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `tx=${encodeURIComponent(signedXdr)}`,
      })

      const submitData = await submitRes.json()
      if (!submitRes.ok || !submitData.successful) {
        const codes = submitData?.extras?.result_codes
        throw new Error(`Transaction failed: ${JSON.stringify(codes) || submitData.detail || 'Unknown error'}`)
      }

      setHasTrustline(true)
      setSuccess('USDC trustline established! You can now receive USDC and make deposits.')
    } catch (err: any) {
      if (err?.message?.includes('User declined')) {
        setError('Transaction cancelled — you declined in Freighter')
      } else {
        setError(err instanceof Error ? err.message : 'Trustline setup failed')
      }
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const handleDeposit = async () => {
    if (!publicKey || !amount) return
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const depositAmount = parseFloat(amount)
      if (isNaN(depositAmount) || depositAmount <= 0) {
        throw new Error('Please enter a valid amount')
      }

      // Check on-chain balance is sufficient
      if (onChainBalance && depositAmount > parseFloat(onChainBalance)) {
        throw new Error(`Insufficient on-chain USDC. You have $${parseFloat(onChainBalance).toFixed(2)} in your wallet.`)
      }

      // Step 1: Ask the backend to build an unsigned USDC payment XDR
      setSuccess('Building transaction...')
      const buildRes = await fetch(`${API_BASE}/deposit/build-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceAccount: publicKey, amount: depositAmount }),
      })

      if (!buildRes.ok) {
        const data = await buildRes.json()
        throw new Error(data.error || 'Failed to build transaction')
      }

      const { xdr } = await buildRes.json()

      // Step 2: Sign with Freighter (this pops up the wallet for user approval)
      setSuccess('Please approve the transaction in Freighter...')
      const freighterApi = await import('@stellar/freighter-api')
      const signedXdr = await freighterApi.signTransaction(xdr, {
        networkPassphrase: 'Test SDF Network ; September 2015',
      })

      // Step 3: Submit signed transaction to Horizon
      setSuccess('Submitting transaction to Stellar network...')
      const submitRes = await fetch('https://horizon-testnet.stellar.org/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `tx=${encodeURIComponent(signedXdr)}`,
      })

      const submitData = await submitRes.json()
      if (!submitRes.ok || !submitData.successful) {
        const codes = submitData?.extras?.result_codes
        throw new Error(`Transaction failed: ${JSON.stringify(codes) || submitData.detail || 'Unknown error'}`)
      }

      const txHash = submitData.hash

      // Step 4: Verify on the backend and credit internal balance
      setSuccess('Verifying deposit...')
      const verifyRes = await fetch(`${API_BASE}/users/${publicKey}/deposit-onchain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionHash: txHash }),
      })

      if (!verifyRes.ok) {
        const data = await verifyRes.json()
        throw new Error(data.error || 'Deposit verification failed')
      }

      setSuccess(`Deposited $${depositAmount.toFixed(2)} USDC — confirmed on-chain (tx: ${txHash.slice(0, 8)}...)`)
      setAmount('')
      await refreshBalance()
    } catch (err: any) {
      // User rejected in Freighter
      if (err?.message?.includes('User declined')) {
        setError('Transaction cancelled — you declined in Freighter')
      } else {
        setError(err instanceof Error ? err.message : 'Deposit failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleWithdraw = async () => {
    if (!publicKey || !amount) return
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const withdrawAmount = parseFloat(amount)
      if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
        throw new Error('Please enter a valid amount')
      }
      if (balance && withdrawAmount > balance.available) {
        throw new Error(`Insufficient balance. You have $${balance.available.toFixed(2)} available`)
      }

      // Step 1: Get a nonce from the backend
      setSuccess('Requesting authorization...')
      const nonceRes = await fetch(`${API_BASE}/auth/nonce/${publicKey}`)
      if (!nonceRes.ok) throw new Error('Failed to get authorization nonce')
      const { nonce } = await nonceRes.json()

      // Step 2: Sign the nonce with Freighter (proves wallet ownership)
      setSuccess('Please approve the withdrawal in Freighter...')
      const freighterApi = await import('@stellar/freighter-api')

      // signMessage returns a base64-encoded signature
      let signature: string
      try {
        const signResult = await (freighterApi as any).signMessage(nonce, {
          networkPassphrase: 'Test SDF Network ; September 2015',
          address: publicKey,
        })
        // Handle both old (string) and new (object) Freighter API responses
        signature = typeof signResult === 'string' ? signResult : signResult?.signedMessage || signResult?.signature || signResult
      } catch (signErr: any) {
        if (signErr?.message?.includes('User declined') || signErr?.message?.includes('cancelled')) {
          throw new Error('Withdrawal cancelled — you declined in Freighter')
        }
        throw signErr
      }

      // Step 3: Submit withdrawal with signed nonce
      setSuccess('Processing withdrawal...')
      const res = await fetch(`${API_BASE}/users/${publicKey}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: withdrawAmount, nonce, signature }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Withdrawal failed')
      }

      const result = await res.json()
      setSuccess(`Withdrew $${withdrawAmount.toFixed(2)} to your wallet${result.transactionHash ? ` (tx: ${result.transactionHash.slice(0, 8)}...)` : ''}`)
      setAmount('')
      await refreshBalance()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed')
    } finally {
      setLoading(false)
    }
  }

  // Show trustline setup banner when on deposit tab and no trustline
  const needsTrustline = tab === 'deposit' && hasTrustline === false

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-700">
            <h2 className="text-xl font-bold text-white">Manage Funds</h2>
            <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg transition">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-2 gap-2 p-4">
            <button
              onClick={() => { setTab('deposit'); setError(''); setSuccess('') }}
              className={`py-2.5 px-4 rounded-lg font-semibold transition flex items-center justify-center space-x-2 ${
                tab === 'deposit'
                  ? 'bg-green-900/40 border border-green-600 text-green-400'
                  : 'bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>Deposit</span>
            </button>
            <button
              onClick={() => { setTab('withdraw'); setError(''); setSuccess('') }}
              className={`py-2.5 px-4 rounded-lg font-semibold transition flex items-center justify-center space-x-2 ${
                tab === 'withdraw'
                  ? 'bg-blue-900/40 border border-blue-600 text-blue-400'
                  : 'bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <ArrowUpFromLine className="w-4 h-4" />
              <span>Withdraw</span>
            </button>
          </div>

          {/* Trustline Setup Banner */}
          {needsTrustline && !loading && (
            <div className="px-4 pb-2">
              <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4 space-y-3">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-300">USDC Trustline Required</p>
                    <p className="text-xs text-amber-400/80 mt-1">
                      Your wallet needs to opt in to the USDC token before you can receive or deposit USDC.
                      This is a one-time Stellar network requirement.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSetupTrustline}
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg font-semibold bg-amber-600 hover:bg-amber-500 text-white transition flex items-center justify-center space-x-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Setup USDC Trustline</span>
                </button>
                <p className="text-xs text-amber-400/60 text-center">
                  Freighter will ask you to approve a changeTrust operation. After this, visit{' '}
                  <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="underline text-amber-300 hover:text-amber-200">
                    faucet.circle.com
                  </a>
                  {' '}to get testnet USDC.
                </p>
              </div>
            </div>
          )}

          {/* Trustline check loading */}
          {tab === 'deposit' && checkingTrustline && (
            <div className="px-4 pb-2">
              <div className="bg-slate-700/50 rounded-lg p-3 flex items-center justify-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                <span className="text-xs text-slate-400">Checking USDC trustline...</span>
              </div>
            </div>
          )}

          {/* Balance Info */}
          <div className="px-4 pb-2">
            <div className="bg-slate-700/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Platform Balance</span>
                <span className="font-semibold text-white">${balance?.available.toFixed(2) ?? '0.00'}</span>
              </div>
              {onChainBalance && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">On-chain USDC</span>
                  <span className="font-mono text-slate-200">${parseFloat(onChainBalance).toFixed(2)}</span>
                </div>
              )}
              {tab === 'deposit' && hasTrustline === true && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">USDC Trustline</span>
                  <span className="text-green-400 flex items-center space-x-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Active</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Amount Input */}
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Amount (USDC)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white text-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-600"
                  placeholder="0.00"
                />
              </div>
              {/* Quick amounts */}
              <div className="flex gap-2 mt-2">
                {[5, 10, 20, 50].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setAmount(amt.toString())}
                    className="flex-1 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-slate-300 transition"
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Error/Success */}
            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-green-900/30 border border-green-700 rounded-lg p-3">
                <p className="text-sm text-green-300">{success}</p>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={tab === 'deposit' ? handleDeposit : handleWithdraw}
              disabled={loading || !amount || needsTrustline}
              className={`w-full py-3 px-4 rounded-lg text-lg font-semibold transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                tab === 'deposit'
                  ? 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-500 hover:to-green-600'
                  : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-500 hover:to-blue-600'
              }`}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : tab === 'deposit' ? (
                <>
                  <ArrowDownToLine className="w-5 h-5" />
                  <span>Deposit</span>
                </>
              ) : (
                <>
                  <ArrowUpFromLine className="w-5 h-5" />
                  <span>Withdraw</span>
                </>
              )}
            </button>

            {tab === 'deposit' && !needsTrustline && (
              <p className="text-xs text-slate-500 text-center">
                USDC will be sent from your Freighter wallet to the platform settlement account on Stellar testnet.
              </p>
            )}
            {tab === 'withdraw' && (
              <p className="text-xs text-slate-500 text-center">
                USDC will be sent to your connected Stellar wallet on testnet.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
