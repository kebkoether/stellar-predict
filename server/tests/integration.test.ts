/**
 * Comprehensive integration test suite for Stellar Prediction Market Platform
 *
 * Tests the full flow:
 * - Server initialization
 * - Market creation
 * - User account setup with deposits
 * - Order placement and matching
 * - Trade execution and settlement
 * - Position and balance updates
 * - Order book state verification
 * - Market resolution
 * - Order cancellation
 * - Edge cases
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import { Database } from '../src/db/database';
import { MatchingEngine } from '../src/engine/matching';
import { Market, Order, Trade } from '../src/types';

// Constants
const TEST_DB_PATH = path.join(__dirname, '../../test-data/integration-test.db');
const TEST_PORT = 3333;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Test data
const USER_A = 'user-a-12345';
const USER_B = 'user-b-67890';
const MARKET_CREATOR = 'market-creator-00000';

let db: Database;
let matching: MatchingEngine;
let httpServer: any;
let serverUrl: string;

/**
 * Helper function to create test database directory
 */
function ensureTestDataDir(): void {
  const dir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Clean up old test db if exists
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
}

/**
 * HTTP helper to make requests
 */
async function request(method: string, endpoint: string, body?: any): Promise<any> {
  const url = `${BASE_URL}${endpoint}`;
  const options: any = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return {
      status: response.status,
      data,
    };
  } catch (error: any) {
    throw new Error(`Request failed: ${error.message}`);
  }
}

/**
 * Setup: Initialize database and matching engine
 */
beforeAll(async () => {
  ensureTestDataDir();

  // Initialize database
  db = new Database(TEST_DB_PATH);
  matching = new MatchingEngine(db);

  // Create and start Express server
  const express = await import('express');
  const { createRouter } = await import('../src/api/routes');

  const app = express.default();
  app.use(express.json());
  app.use(createRouter(db, matching));

  // Health check endpoint for test readiness
  app.get('/health', (req: any, res: any) => {
    res.json({ status: 'ok' });
  });

  // Error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  });

  await new Promise<void>((resolve) => {
    httpServer = app.listen(TEST_PORT, () => {
      console.log(`Test server listening on port ${TEST_PORT}`);
      resolve();
    });
  });

  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 500));
});

/**
 * Cleanup: Close database and server
 */
afterAll(async () => {
  if (httpServer) {
    httpServer.close();
  }
  if (db) {
    db.close();
  }
  // Clean up test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

describe('Stellar Prediction Market - Integration Tests', () => {
  describe('Server Initialization', () => {
    it('should start the server successfully', async () => {
      const response = await request('GET', '/api/health');
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('ok');
    });
  });

  describe('Market Creation', () => {
    let marketId: string;

    it('should create a binary market', async () => {
      const marketData = {
        question: 'Will BTC hit $200k by end of 2026?',
        description: 'Bitcoin price prediction market',
        outcomes: ['YES', 'NO'],
        collateralCode: 'USDC',
        collateralIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        resolutionTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: MARKET_CREATOR,
      };

      const response = await request('POST', '/api/markets', marketData);
      expect(response.status).toBe(201);
      expect(response.data.id).toBeDefined();
      expect(response.data.question).toBe('Will BTC hit $200k by end of 2026?');
      expect(response.data.outcomes).toEqual(['YES', 'NO']);
      expect(response.data.status).toBe('open');

      marketId = response.data.id;
      expect(marketId).toMatch(/^[0-9a-f-]+$/);
    });

    it('should retrieve created market', async () => {
      const response = await request('GET', `/api/markets/${marketId}`);
      expect(response.status).toBe(200);
      expect(response.data.id).toBe(marketId);
      expect(response.data.status).toBe('open');
    });

    it('should list all markets', async () => {
      const response = await request('GET', '/api/markets');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThan(0);
    });
  });

  describe('User Account Setup', () => {
    it('should create user A with balance', async () => {
      const response = await request('POST', `/api/users/${USER_A}/deposit`, {
        amount: 10000,
      });
      expect(response.status).toBe(200);
      expect(response.data.balance.available).toBe(10000);
      expect(response.data.balance.locked).toBe(0);
    });

    it('should create user B with balance', async () => {
      const response = await request('POST', `/api/users/${USER_B}/deposit`, {
        amount: 10000,
      });
      expect(response.status).toBe(200);
      expect(response.data.balance.available).toBe(10000);
      expect(response.data.balance.locked).toBe(0);
    });

    it('should retrieve user A balance', async () => {
      const response = await request('GET', `/api/users/${USER_A}/balances`);
      expect(response.status).toBe(200);
      expect(response.data.userId).toBe(USER_A);
      expect(response.data.available).toBe(10000);
    });

    it('should retrieve user B balance', async () => {
      const response = await request('GET', `/api/users/${USER_B}/balances`);
      expect(response.status).toBe(200);
      expect(response.data.userId).toBe(USER_B);
      expect(response.data.available).toBe(10000);
    });
  });

  describe('Order Placement & Matching', () => {
    let marketId: string;
    let userABuyOrderId: string;

    beforeAll(async () => {
      // Create market for order tests
      const marketData = {
        question: 'Will Ethereum reach $10k by 2026?',
        description: 'Ethereum price prediction',
        outcomes: ['YES', 'NO'],
        collateralCode: 'USDC',
        collateralIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        resolutionTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: MARKET_CREATOR,
      };

      const response = await request('POST', '/api/markets', marketData);
      marketId = response.data.id;
    });

    it('should place buy YES order from user A at $0.60', async () => {
      const response = await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_A,
        side: 'buy',
        outcomeIndex: 0, // YES
        price: 0.6,
        quantity: 100,
        type: 'limit',
      });

      expect(response.status).toBe(201);
      expect(response.data.order.id).toBeDefined();
      expect(response.data.order.side).toBe('buy');
      expect(response.data.order.price).toBe(0.6);
      expect(response.data.order.quantity).toBe(100);
      expect(response.data.trades.length).toBe(0); // No match yet

      userABuyOrderId = response.data.order.id;
    });

    it('should NOT match sell YES at $0.55 (price does not cross)', async () => {
      const response = await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_B,
        side: 'sell',
        outcomeIndex: 0, // YES
        price: 0.55,
        quantity: 100,
        type: 'limit',
      });

      expect(response.status).toBe(201);
      expect(response.data.trades.length).toBe(0); // Should not match
      expect(response.data.order.status).toBe('open');
    });

    it('should MATCH sell YES at $0.60 with user A buy order', async () => {
      const response = await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_B,
        side: 'sell',
        outcomeIndex: 0, // YES
        price: 0.6,
        quantity: 100,
        type: 'limit',
      });

      expect(response.status).toBe(201);
      expect(response.data.trades.length).toBe(1); // Should match
      expect(response.data.trades[0].price).toBe(0.6);
      expect(response.data.trades[0].quantity).toBe(100);
      expect(response.data.trades[0].buyUserId).toBe(USER_A);
      expect(response.data.trades[0].sellUserId).toBe(USER_B);
    });

    it('should verify trade was created via GET /api/markets/:id/trades', async () => {
      const response = await request('GET', `/api/markets/${marketId}/trades`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThan(0);

      const trade = response.data[0];
      expect(trade.marketId).toBe(marketId);
      expect(trade.outcomeIndex).toBe(0);
      expect(trade.price).toBe(0.6);
      expect(trade.quantity).toBe(100);
    });
  });

  describe('Position Updates', () => {
    let marketId: string;

    beforeAll(async () => {
      // Create market and execute trade
      const marketData = {
        question: 'Will Solana reach $500 by 2026?',
        description: 'Solana price prediction',
        outcomes: ['YES', 'NO'],
        collateralCode: 'USDC',
        collateralIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        resolutionTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: MARKET_CREATOR,
      };

      const response = await request('POST', '/api/markets', marketData);
      marketId = response.data.id;

      // Execute a trade
      await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_A,
        side: 'buy',
        outcomeIndex: 0,
        price: 0.5,
        quantity: 50,
        type: 'limit',
      });

      await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_B,
        side: 'sell',
        outcomeIndex: 0,
        price: 0.5,
        quantity: 50,
        type: 'limit',
      });
    });

    it('should show user A long YES position', async () => {
      const response = await request('GET', `/api/users/${USER_A}/positions`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      // Find YES position (outcomeIndex 0)
      const yesPosition = response.data.find((p: any) => p.outcomeIndex === 0);
      if (yesPosition) {
        expect(yesPosition.quantity).toBeGreaterThan(0);
      }
    });

    it('should show user B short YES position', async () => {
      const response = await request('GET', `/api/users/${USER_B}/positions`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      // Find YES position (outcomeIndex 0)
      const yesPosition = response.data.find((p: any) => p.outcomeIndex === 0);
      if (yesPosition) {
        expect(yesPosition.quantity).toBeLessThanOrEqual(0);
      }
    });
  });

  describe('Balance Updates', () => {
    let marketId: string;
    const INITIAL_BALANCE = 5000;
    const ORDER_SIZE = 100;
    const TRADE_PRICE = 0.7;

    beforeAll(async () => {
      // Create fresh users with known balances
      await request('POST', `/api/users/user-c-balance-test/deposit`, {
        amount: INITIAL_BALANCE,
      });

      await request('POST', `/api/users/user-d-balance-test/deposit`, {
        amount: INITIAL_BALANCE,
      });

      // Create market
      const marketData = {
        question: 'Will Cardano reach $2 by 2026?',
        description: 'Cardano price prediction',
        outcomes: ['YES', 'NO'],
        collateralCode: 'USDC',
        collateralIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        resolutionTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: MARKET_CREATOR,
      };

      const response = await request('POST', '/api/markets', marketData);
      marketId = response.data.id;

      // Execute trade
      await request('POST', `/api/markets/${marketId}/orders`, {
        userId: 'user-c-balance-test',
        side: 'buy',
        outcomeIndex: 0,
        price: TRADE_PRICE,
        quantity: ORDER_SIZE,
        type: 'limit',
      });

      await request('POST', `/api/markets/${marketId}/orders`, {
        userId: 'user-d-balance-test',
        side: 'sell',
        outcomeIndex: 0,
        price: TRADE_PRICE,
        quantity: ORDER_SIZE,
        type: 'limit',
      });
    });

    it('should deduct cost from buyer balance', async () => {
      const response = await request('GET', `/api/users/user-c-balance-test/balances`);
      expect(response.status).toBe(200);
      const expectedCost = ORDER_SIZE * TRADE_PRICE;
      expect(response.data.available).toBeLessThan(INITIAL_BALANCE);
    });

    it('should credit proceeds to seller balance', async () => {
      const response = await request('GET', `/api/users/user-d-balance-test/balances`);
      expect(response.status).toBe(200);
      const expectedProceeds = ORDER_SIZE * TRADE_PRICE;
      expect(response.data.available).toBeGreaterThanOrEqual(
        INITIAL_BALANCE - expectedProceeds
      );
    });
  });

  describe('Order Book State', () => {
    let marketId: string;

    beforeAll(async () => {
      const marketData = {
        question: 'Will XRP reach $5 by 2026?',
        description: 'XRP price prediction',
        outcomes: ['YES', 'NO'],
        collateralCode: 'USDC',
        collateralIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        resolutionTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: MARKET_CREATOR,
      };

      const response = await request('POST', '/api/markets', marketData);
      marketId = response.data.id;

      // Place some orders
      await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_A,
        side: 'buy',
        outcomeIndex: 0,
        price: 0.5,
        quantity: 100,
        type: 'limit',
      });

      await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_B,
        side: 'buy',
        outcomeIndex: 0,
        price: 0.49,
        quantity: 50,
        type: 'limit',
      });
    });

    it('should return order book for outcome', async () => {
      const response = await request('GET', `/api/markets/${marketId}/orderbook/0`);
      expect(response.status).toBe(200);
      expect(response.data.marketId).toBe(marketId);
      expect(response.data.outcomeIndex).toBe(0);
      expect(response.data.bids).toBeDefined();
      expect(response.data.asks).toBeDefined();
    });

    it('should show correct bids and asks in order book', async () => {
      const response = await request('GET', `/api/markets/${marketId}/orderbook/0`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.bids)).toBe(true);
      expect(Array.isArray(response.data.asks)).toBe(true);
    });
  });

  describe('Market Resolution', () => {
    let marketId: string;

    beforeAll(async () => {
      const marketData = {
        question: 'Will Apple stock reach $300 by 2026?',
        description: 'Apple stock price prediction',
        outcomes: ['YES', 'NO'],
        collateralCode: 'USDC',
        collateralIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        resolutionTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: MARKET_CREATOR,
      };

      const response = await request('POST', '/api/markets', marketData);
      marketId = response.data.id;
    });

    it('should resolve market to YES outcome', async () => {
      const response = await request('POST', `/api/admin/markets/${marketId}/resolve`, {
        outcomeIndex: 0, // YES
      });

      expect(response.status).toBe(200);
      expect(response.data.market.status).toBe('resolved');
      expect(response.data.market.resolvedOutcomeIndex).toBe(0);
    });

    it('should prevent orders on resolved market', async () => {
      const response = await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_A,
        side: 'buy',
        outcomeIndex: 0,
        price: 0.5,
        quantity: 100,
        type: 'limit',
      });

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('not open');
    });

    it('should verify market status is resolved', async () => {
      const response = await request('GET', `/api/markets/${marketId}`);
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('resolved');
      expect(response.data.resolvedOutcomeIndex).toBe(0);
    });
  });

  describe('Order Cancellation', () => {
    let marketId: string;
    let orderId: string;

    beforeAll(async () => {
      const marketData = {
        question: 'Will Tesla reach $500 by 2026?',
        description: 'Tesla stock prediction',
        outcomes: ['YES', 'NO'],
        collateralCode: 'USDC',
        collateralIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        resolutionTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: MARKET_CREATOR,
      };

      const response = await request('POST', '/api/markets', marketData);
      marketId = response.data.id;

      // Create an order to cancel
      const orderResponse = await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_A,
        side: 'buy',
        outcomeIndex: 0,
        price: 0.5,
        quantity: 100,
        type: 'limit',
      });

      orderId = orderResponse.data.order.id;
    });

    it('should cancel an open order', async () => {
      const response = await request(
        'DELETE',
        `/api/markets/${marketId}/orders/${orderId}`
      );

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('cancelled');
    });

    it('should fail to cancel already cancelled order', async () => {
      const response = await request(
        'DELETE',
        `/api/markets/${marketId}/orders/${orderId}`
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Edge Cases', () => {
    let marketId: string;

    beforeAll(async () => {
      const marketData = {
        question: 'Will Ethereum reach $50k by 2026?',
        description: 'Ethereum extreme price prediction',
        outcomes: ['YES', 'NO'],
        collateralCode: 'USDC',
        collateralIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        resolutionTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: MARKET_CREATOR,
      };

      const response = await request('POST', '/api/markets', marketData);
      marketId = response.data.id;
    });

    it('should accept order at price 0 (certain NO)', async () => {
      const response = await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_A,
        side: 'buy',
        outcomeIndex: 1, // NO
        price: 0,
        quantity: 100,
        type: 'limit',
      });

      expect(response.status).toBe(201);
      expect(response.data.order.price).toBe(0);
    });

    it('should accept order at price 1 (certain YES)', async () => {
      const response = await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_B,
        side: 'buy',
        outcomeIndex: 0, // YES
        price: 1,
        quantity: 100,
        type: 'limit',
      });

      expect(response.status).toBe(201);
      expect(response.data.order.price).toBe(1);
    });

    it('should reject order with price > 1', async () => {
      const response = await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_A,
        side: 'buy',
        outcomeIndex: 0,
        price: 1.5,
        quantity: 100,
        type: 'limit',
      });

      expect(response.status).toBe(400);
    });

    it('should reject order with price < 0', async () => {
      const response = await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_A,
        side: 'buy',
        outcomeIndex: 0,
        price: -0.5,
        quantity: 100,
        type: 'limit',
      });

      expect(response.status).toBe(400);
    });

    it('should reject order with invalid outcome index', async () => {
      const response = await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_A,
        side: 'buy',
        outcomeIndex: 999,
        quantity: 100,
        price: 0.5,
        type: 'limit',
      });

      expect(response.status).toBe(400);
    });

    it('should reject order on non-existent market', async () => {
      const response = await request('POST', `/api/markets/fake-market-id/orders`, {
        userId: USER_A,
        side: 'buy',
        outcomeIndex: 0,
        quantity: 100,
        price: 0.5,
        type: 'limit',
      });

      expect(response.status).toBe(404);
    });

    it('should handle missing required fields', async () => {
      const response = await request('POST', `/api/markets/${marketId}/orders`, {
        userId: USER_A,
        side: 'buy',
        // Missing other required fields
      });

      expect(response.status).toBe(400);
    });

    it('should retrieve user orders', async () => {
      const response = await request('GET', `/api/users/${USER_A}/orders`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  describe('Admin Functions', () => {
    it('should list all order books', async () => {
      const response = await request('GET', '/api/admin/orderbooks');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });
  });
});
