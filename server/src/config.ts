import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

/**
 * Application configuration from environment variables
 */
export const config = {
  // Server
  server: {
    port: parseInt(process.env.SERVER_PORT || process.env.PORT || '3000'),
    wsPort: parseInt(process.env.WS_PORT || '3001'),
    env: (process.env.NODE_ENV || 'development') as 'development' | 'production',
  },

  // Database
  database: {
    path: process.env.DB_PATH || path.join(process.cwd(), 'data.db'),
  },

  // Stellar
  stellar: {
    network: (process.env.STELLAR_NETWORK || 'testnet') as 'testnet' | 'mainnet',
    horizonUrl:
      process.env.STELLAR_HORIZON_URL ||
      'https://horizon-testnet.stellar.org',
    settlementKeypair: process.env.SETTLEMENT_KEYPAIR,
  },

  // USDC Asset
  usdc: {
    code: process.env.USDC_ASSET_CODE || 'USDC',
    issuer:
      process.env.USDC_ISSUER ||
      'GA5ZSEJYB37JRC5AVCIA5MOP4IYCGVS53UJVQ7RKSTD4P2WZDTAB47Z', // testnet issuer
  },

  // Settlement
  settlement: {
    batchSize: parseInt(process.env.SETTLEMENT_BATCH_SIZE || '100'),
    processingIntervalMs: parseInt(process.env.SETTLEMENT_INTERVAL_MS || '10000'), // 10 seconds
    retryIntervalMs: parseInt(process.env.SETTLEMENT_RETRY_INTERVAL_MS || '30000'), // 30 seconds
    maxRetries: parseInt(process.env.SETTLEMENT_MAX_RETRIES || '5'),
  },

  // Logging
  logging: {
    level: (process.env.LOG_LEVEL || 'info') as
      | 'debug'
      | 'info'
      | 'warn'
      | 'error',
  },
};

/**
 * Validate critical configuration
 */
export function validateConfig(): void {
  const errors: string[] = [];

  const key = config.stellar.settlementKeypair;
  if (!key || key.startsWith('<') || key.includes('XXXX')) {
    console.warn('WARNING: SETTLEMENT_KEYPAIR not set — settlement pipeline disabled (trading still works)');
    config.stellar.settlementKeypair = undefined;
  }

  if (config.stellar.network === 'mainnet' && !process.env.USDC_ISSUER) {
    errors.push('USDC_ISSUER must be specified for mainnet');
  }

  if (errors.length > 0) {
    console.error('Configuration validation failed:');
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log('Configuration validated successfully');
}
