'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface WalletState {
  connected: boolean
  publicKey: string | null
  loading: boolean
  error: string | null
  balance: { available: number; locked: number } | null
  onChainBalance: string | null
  connect: () => Promise<void>
  disconnect: () => void
  refreshBalance: () => Promise<void>
}

const WalletContext = createContext<WalletState | null>(null)

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

export function WalletProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState<{ available: number; locked: number } | null>(null)
  const [onChainBalance, setOnChainBalance] = useState<string | null>(null)

  // Check if Freighter is already connected on mount
  useEffect(() => {
    checkExistingConnection()
  }, [])

  // Refresh balance when publicKey changes
  useEffect(() => {
    if (publicKey) {
      refreshBalance()
      fetchOnChainBalance()
    }
  }, [publicKey])

  async function checkExistingConnection() {
    try {
      setLoading(true)
      // Dynamic import to avoid SSR issues
      const freighterApi = await import('@stellar/freighter-api')

      const isInstalled = await freighterApi.isConnected()
      if (!isInstalled) {
        setLoading(false)
        return
      }

      // Try to get existing authorization (won't prompt the user)
      try {
        const isAllowed = await freighterApi.isAllowed()
        if (isAllowed) {
          const key = await freighterApi.getPublicKey()
          if (key && key.startsWith('G')) {
            await handleConnected(key)
          }
        }
      } catch {
        // Not yet authorized — that's fine, user hasn't clicked connect
      }
    } catch (err) {
      console.error('Freighter check failed:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleConnected(key: string) {
    setPublicKey(key)
    setConnected(true)

    // Auto-register the wallet as a user on the server (GET /balances auto-creates zero balance)
    try {
      await fetch(`${API_BASE}/users/${key}/balances`)
    } catch {
      // Balance might already exist, that's fine
    }
  }

  const connect = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const freighterApi = await import('@stellar/freighter-api')

      const isInstalled = await freighterApi.isConnected()
      if (!isInstalled) {
        setError('Freighter wallet not found. Please install it from freighter.app')
        return
      }

      // Request access — this prompts the user in Freighter
      await freighterApi.requestAccess()

      // After approval, get the public key
      let key: string | null = null
      try {
        const publicKey = await freighterApi.getPublicKey()
        if (publicKey && publicKey.startsWith('G')) {
          key = publicKey
        }
      } catch {
        // getPublicKey failed
      }

      if (!key) {
        setError('Could not get wallet address. Please try again.')
        return
      }

      await handleConnected(key)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect wallet'
      setError(msg)
      console.error('Wallet connection failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setPublicKey(null)
    setConnected(false)
    setBalance(null)
    setOnChainBalance(null)
    setError(null)
  }, [])

  const refreshBalance = useCallback(async () => {
    if (!publicKey) return
    try {
      const res = await fetch(`${API_BASE}/users/${publicKey}/balances`)
      if (res.ok) {
        const data = await res.json()
        setBalance({ available: data.available ?? 0, locked: data.locked ?? 0 })
      }
    } catch (err) {
      console.error('Failed to fetch balance:', err)
    }
    // Also refresh on-chain balance
    fetchOnChainBalance()
  }, [publicKey])

  async function fetchOnChainBalance() {
    if (!publicKey) return
    try {
      const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${publicKey}`)
      if (res.ok) {
        const data = await res.json()
        const usdc = data.balances?.find(
          (b: any) => b.asset_code === 'USDC'
        )
        setOnChainBalance(usdc?.balance ?? '0')
      }
    } catch {
      // Account might not exist on-chain yet
    }
  }

  return (
    <WalletContext.Provider
      value={{
        connected,
        publicKey,
        loading,
        error,
        balance,
        onChainBalance,
        connect,
        disconnect,
        refreshBalance,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function useWalletContext() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWalletContext must be used within WalletProvider')
  return ctx
}
