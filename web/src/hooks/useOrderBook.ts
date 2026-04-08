'use client'

import { useEffect, useState, useCallback } from 'react'
import useSWR from 'swr'
import { orderBook as orderBookAPI } from '@/lib/api'
import { getWebSocketClient } from '@/lib/websocket'

interface OrderBookLevel {
  price: number
  quantity: number
  total: number
}

interface OrderBookData {
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  midPrice: number
  timestamp: number
}

export function useOrderBook(marketId: string) {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Initial fetch
  const { data: initialData } = useSWR(
    marketId ? ['orderbook', marketId] : null,
    () => orderBookAPI.get(marketId)
  )

  const setupWebSocket = useCallback(() => {
    try {
      const wsClient = getWebSocketClient()

      wsClient
        .connect()
        .then(() => {
          wsClient.subscribe(`orderbook:${marketId}`, (data: unknown) => {
            setOrderBook(data as OrderBookData)
            setLoading(false)
          })
        })
        .catch((err) => {
          console.error('WebSocket connection failed:', err)
          setError(err)
          setLoading(false)
        })

      return () => {
        wsClient.unsubscribe(`orderbook:${marketId}`)
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      setLoading(false)
      return () => {}
    }
  }, [marketId])

  useEffect(() => {
    if (initialData) {
      setOrderBook(initialData as any)
      setLoading(false)
    }
  }, [initialData])

  useEffect(() => {
    const unsubscribe = setupWebSocket()
    return unsubscribe
  }, [setupWebSocket])

  return {
    orderBook,
    bids: orderBook?.bids || [],
    asks: orderBook?.asks || [],
    midPrice: orderBook?.midPrice || 0,
    loading,
    error,
  }
}
