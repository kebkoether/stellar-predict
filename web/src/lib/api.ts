const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

interface ApiError extends Error {
  status?: number
  data?: unknown
}

async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = new Error(`API Error: ${response.statusText}`) as ApiError
    error.status = response.status
    try {
      error.data = await response.json()
    } catch {
      error.data = { message: response.statusText }
    }
    throw error
  }

  return response.json()
}

// Market endpoints
export const markets = {
  list: (params?: Record<string, string | number>) => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''
    return apiCall(`/markets${query}`)
  },

  get: (id: string) => apiCall(`/markets/${id}`),

  create: (data: {
    question: string
    description: string
    category: string
    resolutionDate: string
  }) => apiCall('/markets', { method: 'POST', body: JSON.stringify(data) }),
}

// Order endpoints
export const orders = {
  place: (data: {
    marketId: string
    type: 'buy' | 'sell'
    outcome: 'yes' | 'no'
    price: number
    quantity: number
    orderType: 'limit' | 'market'
  }) => apiCall('/orders', { method: 'POST', body: JSON.stringify(data) }),

  cancel: (id: string) =>
    apiCall(`/orders/${id}`, { method: 'DELETE' }),

  list: (params?: Record<string, string | number>) => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''
    return apiCall(`/orders${query}`)
  },

  get: (id: string) => apiCall(`/orders/${id}`),
}

// Order book endpoints
export const orderBook = {
  get: (marketId: string) => apiCall(`/orderbook/${marketId}`),
}

// Trade endpoints
export const trades = {
  list: (params?: Record<string, string | number>) => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''
    return apiCall(`/trades${query}`)
  },

  getByMarket: (marketId: string) =>
    apiCall(`/markets/${marketId}/trades`),
}

// Position endpoints
export const positions = {
  list: (params?: Record<string, string | number>) => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''
    return apiCall(`/positions${query}`)
  },

  get: (id: string) => apiCall(`/positions/${id}`),
}

// User endpoints
export const user = {
  getProfile: () => apiCall('/user/profile'),

  getBalance: () => apiCall('/user/balance'),

  deposit: (data: { amount: number; transactionHash: string }) =>
    apiCall('/user/deposit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  withdraw: (data: { amount: number; destinationAddress: string }) =>
    apiCall('/user/withdraw', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getTransactionHistory: (params?: Record<string, string | number>) => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''
    return apiCall(`/user/transactions${query}`)
  },
}

// Price history endpoints
export const priceHistory = {
  get: (marketId: string, params?: Record<string, string | number>) => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''
    return apiCall(`/markets/${marketId}/price-history${query}`)
  },
}

export default {
  markets,
  orders,
  orderBook,
  trades,
  positions,
  user,
  priceHistory,
}
