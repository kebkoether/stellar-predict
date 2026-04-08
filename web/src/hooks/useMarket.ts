'use client'

import useSWR from 'swr'
import { markets } from '@/lib/api'

interface Market {
  id: string
  question: string
  description: string
  category: string
  yesPrice: number
  noPrice: number
  volume: number
  resolutionDate: string
  status: 'active' | 'resolved' | 'paused'
  createdAt: number
  yesProbability: number
  creator: string
}

export function useMarkets(params?: Record<string, string | number>) {
  const { data, error, isLoading, mutate } = useSWR(
    ['markets', params],
    () => markets.list(params)
  )

  return {
    markets: (Array.isArray(data) ? data : (data as any)?.markets || []) as Market[],
    loading: isLoading,
    error,
    refetch: mutate,
  }
}

export function useMarket(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? ['market', id] : null,
    () => markets.get(id)
  )

  return {
    market: data as Market | undefined,
    loading: isLoading,
    error,
    refetch: mutate,
  }
}

export function useFeaturedMarkets() {
  return useMarkets({ featured: 'true', limit: 5 })
}

export function useMarketsByCategory(category: string) {
  return useMarkets({ category, limit: 50 })
}
