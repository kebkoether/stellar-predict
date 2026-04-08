/**
 * Stellar utility functions for the frontend.
 * Uses direct Horizon API calls to avoid bundling the full Stellar SDK.
 * Transaction building/signing happens via Freighter and the backend API.
 */

const STELLAR_HORIZON_URL = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'

interface StellarConfig {
  networkPassphrase: string
  horizonUrl: string
  usdc: {
    issuer: string
    code: string
  }
}

const config: StellarConfig = {
  networkPassphrase: 'Test SDF Network ; September 2015',
  horizonUrl: STELLAR_HORIZON_URL,
  usdc: {
    issuer: process.env.NEXT_PUBLIC_USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    code: 'USDC',
  },
}

export async function getUSDCBalance(publicKey: string): Promise<string> {
  try {
    const response = await fetch(`${config.horizonUrl}/accounts/${publicKey}`)

    if (!response.ok) {
      return '0'
    }

    const accountData = await response.json()

    const usdcBalance = accountData.balances.find(
      (balance: { asset_code?: string; asset_issuer?: string }) =>
        balance.asset_code === config.usdc.code &&
        balance.asset_issuer === config.usdc.issuer
    )

    return usdcBalance?.balance || '0'
  } catch (error) {
    console.error('Failed to get USDC balance:', error)
    return '0'
  }
}

export async function getTransactionStatus(hash: string): Promise<{
  status: 'success' | 'pending' | 'failed'
  result?: unknown
}> {
  try {
    const response = await fetch(`${config.horizonUrl}/transactions/${hash}`)

    if (response.status === 404) {
      return { status: 'pending' }
    }

    if (!response.ok) {
      return { status: 'failed' }
    }

    const txData = await response.json()

    return {
      status: txData.successful ? 'success' : 'failed',
      result: txData,
    }
  } catch (error) {
    console.error('Failed to check transaction status:', error)
    return { status: 'failed' }
  }
}

export async function getAccountInfo(publicKey: string): Promise<any | null> {
  try {
    const response = await fetch(`${config.horizonUrl}/accounts/${publicKey}`)
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

export { config as stellarConfig }
