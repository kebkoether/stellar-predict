'use client'

import { useState, useCallback, useEffect } from 'react'
import { isConnected, getPublicKey, signTransaction } from '@stellar/freighter-api'

export function useWallet() {
  const [connected, setConnected] = useState(false)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkConnection()
  }, [])

  const checkConnection = async () => {
    try {
      setLoading(true)
      const isWalletConnected = await isConnected()

      if (isWalletConnected) {
        const key = await getPublicKey()
        setPublicKey(key)
        setConnected(true)
      }
    } catch (err) {
      console.error('Failed to check wallet connection:', err)
    } finally {
      setLoading(false)
    }
  }

  const connect = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const key = await getPublicKey()
      setPublicKey(key)
      setConnected(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet'
      setError(errorMessage)
      console.error('Wallet connection failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setPublicKey(null)
    setConnected(false)
    setError(null)
  }, [])

  const sign = useCallback(
    async (transaction: string) => {
      if (!connected || !publicKey) {
        throw new Error('Wallet not connected')
      }

      try {
        const signedTx = await signTransaction(transaction, {
          networkPassphrase: process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'Test SDF Network ; September 2015',
        })
        return signedTx
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to sign transaction'
        throw new Error(errorMessage)
      }
    },
    [connected, publicKey]
  )

  return {
    connected,
    publicKey,
    loading,
    error,
    connect,
    disconnect,
    sign,
  }
}
