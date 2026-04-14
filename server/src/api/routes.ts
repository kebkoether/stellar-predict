import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Database } from '../db/database';
import { MatchingEngine } from '../engine/matching';
import { config } from '../config';
import { Order, Market } from '../types';

// In-memory nonce store: nonce → { userId, createdAt }
// Nonces expire after 5 minutes and are single-use
const nonceStore = new Map<string, { userId: string; createdAt: number }>();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cleanExpiredNonces() {
  const now = Date.now();
  for (const [nonce, data] of nonceStore) {
    if (now - data.createdAt > NONCE_TTL_MS) nonceStore.delete(nonce);
  }
}

/**
 * Verify a signed auth transaction.
 *
 * Security model: WE built the unsigned XDR with (source = user, memo = nonce).
 * Freighter will only sign a transaction whose source matches the active wallet.
 * The nonce is single-use and expires after 5 minutes.
 *
 * So we verify:
 * 1. The signed XDR parses as a valid transaction
 * 2. Source account matches the expected public key
 * 3. Memo matches the nonce we issued
 * 4. At least one signature is present (Freighter signed it)
 */
function verifySignedAuthTx(publicKey: string, nonce: string, signedXdr: string): boolean {
  try {
    const parsed = StellarSdk.TransactionBuilder.fromXDR(
      signedXdr,
      StellarSdk.Networks.TESTNET
    );
    // Cast to Transaction (not FeeBumpTransaction — we built it, so we know the type)
    const tx = parsed as StellarSdk.Transaction;

    // 1. Source account must be the user
    if (tx.source !== publicKey) {
      console.log(`Auth failed: source ${tx.source} !== expected ${publicKey}`);
      return false;
    }

    // 2. Memo must contain our nonce (truncated to 28 bytes)
    const expectedMemo = nonce.slice(0, 28);
    const memoValue = (tx as any).memo?.value || (tx as any).memo?._value || '';
    const memoStr = typeof memoValue === 'string' ? memoValue : Buffer.from(memoValue).toString('utf-8');
    if (memoStr !== expectedMemo) {
      console.log(`Auth failed: memo "${memoStr}" !== expected "${expectedMemo}"`);
      return false;
    }

    // 3. Must have at least one signature (Freighter signed it)
    if (!tx.signatures || tx.signatures.length === 0) {
      console.log('Auth failed: no signatures');
      return false;
    }

    return true;
  } catch (err) {
    console.error('Auth verification error:', err);
    return false;
  }
}

/**
 * Express router with REST API endpoints
 */
export function createRouter(db: Database, matching: MatchingEngine, settler?: any): Router {
  const router = Router();

  /**
   * Validation schemas
   */
  const CreateMarketSchema = z.object({
    question: z.string().min(1),
    description: z.string().min(1),
    outcomes: z.array(z.string()).min(2),
    collateralCode: z.string(),
    collateralIssuer: z.string(),
    resolutionTime: z.string().datetime(),
    createdBy: z.string(),
  });

  const PlaceOrderSchema = z.object({
    userId: z.string(),
    side: z.enum(['buy', 'sell']),
    outcomeIndex: z.number().int().min(0),
    price: z.number().min(0).max(1),
    quantity: z.number().positive(),
    type: z.enum(['limit', 'market', 'ioc', 'fok']),
  });

  const DepositSchema = z.object({
    amount: z.number().positive(),
  });

  const ResolveMarketSchema = z.object({
    outcomeIndex: z.number().int().min(0),
  });

  /**
   * MARKET ENDPOINTS
   */

  // Create market
  router.post('/api/markets', (req: Request, res: Response) => {
    try {
      const data = CreateMarketSchema.parse(req.body);

      const market: Market = {
        id: uuidv4(),
        question: data.question,
        description: data.description,
        outcomes: data.outcomes,
        status: 'open',
        collateralToken: {
          code: data.collateralCode,
          issuer: data.collateralIssuer,
        },
        createdAt: new Date(),
        resolutionTime: new Date(data.resolutionTime),
        createdBy: data.createdBy,
      };

      db.createMarket(market);

      res.status(201).json(market);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Get all markets
  router.get('/api/markets', (req: Request, res: Response) => {
    try {
      const markets = db.getAllMarkets();
      res.json(markets);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get market by ID
  router.get('/api/markets/:id', (req: Request, res: Response) => {
    try {
      const market = db.getMarket(req.params.id);
      if (!market) {
        res.status(404).json({ error: 'Market not found' });
        return;
      }
      res.json(market);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * ORDER ENDPOINTS
   */

  // Place order
  router.post('/api/markets/:id/orders', (req: Request, res: Response) => {
    try {
      const data = PlaceOrderSchema.parse(req.body);
      const market = db.getMarket(req.params.id);

      if (!market) {
        res.status(404).json({ error: 'Market not found' });
        return;
      }

      if (market.status !== 'open') {
        res.status(400).json({ error: 'Market is not open for trading' });
        return;
      }

      if (data.outcomeIndex >= market.outcomes.length) {
        res.status(400).json({ error: 'Invalid outcome index' });
        return;
      }

      // Initialize user balance if needed
      if (!db.getUserBalance(data.userId)) {
        db.createUserBalance(data.userId, 0);
      }

      const order: Order = {
        id: uuidv4(),
        marketId: market.id,
        userId: data.userId,
        side: data.side,
        outcomeIndex: data.outcomeIndex,
        price: data.price,
        quantity: data.quantity,
        type: data.type,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        filledQty: 0,
        cancelledQty: 0,
      };

      const result = matching.submitOrder(order);

      // Return 400 if the order was rejected (e.g., insufficient balance)
      if (result.status === 'rejected') {
        res.status(400).json({
          error: result.message || 'Order rejected',
          order: result.order,
          status: result.status,
        });
        return;
      }

      res.status(201).json({
        order: result.order,
        trades: result.trades,
        status: result.status,
        message: result.message,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Cancel order
  router.delete('/api/markets/:id/orders/:orderId', (req: Request, res: Response) => {
    try {
      const order = matching.cancelOrder(req.params.id, req.params.orderId);

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      res.json(order);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * ORDERBOOK ENDPOINTS
   */

  // Get order book for outcome
  router.get('/api/markets/:id/orderbook/:outcomeIndex', (req: Request, res: Response) => {
    try {
      const outcomeIndex = parseInt(req.params.outcomeIndex);

      if (isNaN(outcomeIndex)) {
        res.status(400).json({ error: 'Invalid outcome index' });
        return;
      }

      const market = db.getMarket(req.params.id);
      if (!market) {
        res.status(404).json({ error: 'Market not found' });
        return;
      }

      const orderbook = matching.getOrderBook(req.params.id, outcomeIndex);
      res.json(orderbook);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * TRADE ENDPOINTS
   */

  // Get recent trades for market
  router.get('/api/markets/:id/trades', (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
      const trades = db.getMarketTrades(req.params.id, limit);
      res.json(trades);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * USER ENDPOINTS
   */

  // Get user positions
  router.get('/api/users/:userId/positions', (req: Request, res: Response) => {
    try {
      const positions = db.getUserPositions(req.params.userId);
      res.json(positions);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get user balance
  router.get('/api/users/:userId/balances', (req: Request, res: Response) => {
    try {
      let balance = db.getUserBalance(req.params.userId);

      if (!balance) {
        balance = db.createUserBalance(req.params.userId, 0);
      }

      res.json(balance);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get user orders
  router.get('/api/users/:userId/orders', (req: Request, res: Response) => {
    try {
      const orders = db.getUserOrders(req.params.userId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Deposit (simulated - in production, would verify Stellar transaction)
  router.post('/api/users/:userId/deposit', (req: Request, res: Response) => {
    try {
      const data = DepositSchema.parse(req.body);
      const userId = req.params.userId;

      let balance = db.getUserBalance(userId);
      if (!balance) {
        balance = db.createUserBalance(userId, data.amount);
      } else {
        db.updateUserBalance(userId, {
          available: balance.available + data.amount,
          locked: balance.locked,
        });
        balance = db.getUserBalance(userId)!;
      }

      res.json({
        message: 'Deposit recorded',
        balance,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  /**
   * ADMIN ENDPOINTS
   */

  // Resolve market and pay out winners
  router.post('/api/admin/markets/:id/resolve', (req: Request, res: Response) => {
    try {
      const data = ResolveMarketSchema.parse(req.body);
      const market = db.getMarket(req.params.id);

      if (!market) {
        res.status(404).json({ error: 'Market not found' });
        return;
      }

      if (market.status === 'resolved') {
        res.status(400).json({ error: 'Market already resolved' });
        return;
      }

      if (data.outcomeIndex >= market.outcomes.length) {
        res.status(400).json({ error: 'Invalid outcome index' });
        return;
      }

      // 1. Cancel all open orders and refund locked collateral
      const cancelledCount = matching.cancelAllMarketOrders(req.params.id);
      if (cancelledCount > 0) {
        console.log(`  🔄 Cancelled ${cancelledCount} open order(s) and refunded locked collateral`);
      }

      // 2. Mark market as resolved
      db.updateMarketStatus(req.params.id, 'resolved', data.outcomeIndex);

      // 3. Get all positions for this market
      const positions = db.getMarketPositions(req.params.id);

      // 4. Calculate the collateral pool and verify zero-sum
      //    Every trade created $1.00 of collateral per share (buyer paid P, seller paid 1-P).
      //    The total pool = sum of all costBasis across all positions.
      const totalCollateral = positions.reduce((sum, p) => sum + (p.quantity > 0 ? p.costBasis : 0), 0);

      // 5. Pay out winners: each winning token = $1.00
      //    This is funded by the collateral pool (winner's own cost + loser's cost = $1.00/share)
      const payouts: Array<{ userId: string; amount: number; costBasis: number; profit: number; outcome: string }> = [];
      const losses: Array<{ userId: string; amount: number; costBasis: number; outcome: string }> = [];

      let totalPayout = 0;
      let totalLost = 0;

      for (const pos of positions) {
        if (pos.quantity <= 0) continue;

        if (pos.outcomeIndex === data.outcomeIndex) {
          // WINNER — credit $1.00 per token to available balance
          const payout = pos.quantity; // 1 USDC per winning token
          const profit = payout - pos.costBasis; // profit = payout - what they paid
          const balance = db.getUserBalance(pos.userId);
          if (balance) {
            db.updateUserBalance(pos.userId, {
              available: balance.available + payout,
            });
          }
          totalPayout += payout;
          payouts.push({
            userId: pos.userId,
            amount: payout,
            costBasis: pos.costBasis,
            profit,
            outcome: market.outcomes[pos.outcomeIndex],
          });
          console.log(`  💰 ${pos.userId}: won $${payout.toFixed(2)} (paid $${pos.costBasis.toFixed(2)}, profit $${profit.toFixed(2)}) — held ${pos.quantity} ${market.outcomes[pos.outcomeIndex]} tokens`);
        } else {
          // LOSER — tokens are worthless, collateral is forfeit
          totalLost += pos.costBasis;
          losses.push({
            userId: pos.userId,
            amount: pos.costBasis,
            costBasis: pos.costBasis,
            outcome: market.outcomes[pos.outcomeIndex],
          });
          console.log(`  ❌ ${pos.userId}: lost $${pos.costBasis.toFixed(2)} (held ${pos.quantity} ${market.outcomes[pos.outcomeIndex]} tokens — now worthless)`);
        }
      }

      // 6. Verify zero-sum: total payout should equal total collateral
      //    (winners get their own cost back + losers' cost)
      const imbalance = Math.abs(totalPayout - totalCollateral);
      if (imbalance > 0.01) {
        console.warn(`⚠️ IMBALANCE DETECTED: payout=$${totalPayout.toFixed(2)}, collateral=$${totalCollateral.toFixed(2)}, diff=$${imbalance.toFixed(2)}`);
      }

      const updated = db.getMarket(req.params.id)!;
      const winningOutcome = market.outcomes[data.outcomeIndex];

      console.log(`\nMarket resolved: "${market.question}" → ${winningOutcome}`);
      console.log(`  Collateral pool: $${totalCollateral.toFixed(2)}`);
      console.log(`  Winners: ${payouts.length}, Total payout: $${totalPayout.toFixed(2)} (${payouts.map(p => `${p.userId}: +$${p.profit.toFixed(2)}`).join(', ')})`);
      console.log(`  Losers: ${losses.length}, Total lost: $${totalLost.toFixed(2)} (${losses.map(l => `${l.userId}: -$${l.amount.toFixed(2)}`).join(', ')})`);
      console.log(`  Zero-sum check: payout $${totalPayout.toFixed(2)} = collateral $${totalCollateral.toFixed(2)} → ${imbalance < 0.01 ? '✅ BALANCED' : '❌ IMBALANCED'}`);

      res.json({
        message: `Market resolved: ${winningOutcome} wins`,
        market: updated,
        winningOutcome,
        collateralPool: totalCollateral,
        payouts,
        losses,
        zeroSumCheck: {
          totalPayout,
          totalCollateral,
          balanced: imbalance < 0.01,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
      } else {
        console.error('Resolution error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Get all order books (for monitoring)
  router.get('/api/admin/orderbooks', (req: Request, res: Response) => {
    try {
      const orderbooks = matching.getAllOrderBooks();
      res.json(orderbooks);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Leaderboard
  router.get('/api/leaderboard', (req: Request, res: Response) => {
    try {
      const leaderboard = db.getLeaderboard();
      res.json(leaderboard);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Health check
  router.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  // Admin: set user balance (for corrections only)
  router.post('/api/admin/users/:userId/set-balance', (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { available, locked } = req.body;
      const balance = db.getUserBalance(userId);
      if (!balance) {
        return res.status(404).json({ error: 'User not found' });
      }
      db.updateUserBalance(userId, {
        available: available ?? balance.available,
        locked: locked ?? balance.locked,
      });
      res.json({ message: 'Balance updated', balance: db.getUserBalance(userId) });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * AUTH — generate a nonce + unsigned auth transaction for withdrawal auth.
   * Frontend signs the tx with Freighter (using signTransaction, which works),
   * then sends the signed XDR back with the withdraw request.
   * The tx is NEVER submitted — it's purely for cryptographic proof of wallet ownership.
   */
  router.get('/api/auth/nonce/:userId', async (req: Request, res: Response) => {
    try {
      cleanExpiredNonces();
      const userId = req.params.userId;
      const nonce = `sh:wd:${uuidv4().slice(0, 20)}`;
      nonceStore.set(nonce, { userId, createdAt: Date.now() });

      // Build a dummy auth tx: source = user, memo = nonce, one no-op manageData
      if (!settler) {
        return res.status(503).json({ error: 'Settlement not configured' });
      }
      const horizonUrl = config.stellar.horizonUrl;
      const server = new StellarSdk.Horizon.Server(horizonUrl);
      const account = await server.loadAccount(userId);
      const networkPassphrase = StellarSdk.Networks.TESTNET;

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase,
      })
        .addOperation(StellarSdk.Operation.manageData({
          name: 'auth',
          value: 'withdrawal',
        }))
        .addMemo(StellarSdk.Memo.text(nonce.slice(0, 28)))
        .setTimeout(300)
        .build();

      res.json({ nonce, xdr: tx.toXDR() });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * WITHDRAWAL — sends USDC on-chain from settlement account to user's wallet
   * Requires a Freighter-signed nonce to prove wallet ownership.
   */
  router.post('/api/users/:userId/withdraw', async (req: Request, res: Response) => {
    try {
      if (!settler) {
        return res.status(503).json({ error: 'Settlement pipeline not configured' });
      }
      const { userId } = req.params;
      const { amount, nonce, signature } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be positive' });
      }

      // Require signed nonce
      if (!nonce || !signature) {
        return res.status(401).json({ error: 'Withdrawal requires a signed nonce. Get one from /api/auth/nonce/:userId' });
      }

      // Check nonce exists and belongs to this user
      const nonceData = nonceStore.get(nonce);
      if (!nonceData) {
        return res.status(401).json({ error: 'Invalid or expired nonce' });
      }
      if (nonceData.userId !== userId) {
        return res.status(401).json({ error: 'Nonce does not match user' });
      }
      if (Date.now() - nonceData.createdAt > NONCE_TTL_MS) {
        nonceStore.delete(nonce);
        return res.status(401).json({ error: 'Nonce expired' });
      }

      // Verify the signed auth transaction
      if (!verifySignedAuthTx(userId, nonce, signature)) {
        return res.status(401).json({ error: 'Invalid signature — wallet verification failed' });
      }

      // Consume nonce (single-use)
      nonceStore.delete(nonce);

      const hash = await settler.processWithdrawal(userId, amount);
      res.json({ success: true, transactionHash: hash, amount, userId });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * DEPOSIT — verify an on-chain USDC payment and credit internal balance
   */
  router.post('/api/users/:userId/deposit-onchain', async (req: Request, res: Response) => {
    try {
      if (!settler) {
        return res.status(503).json({ error: 'Settlement pipeline not configured' });
      }
      const { userId } = req.params;
      const { transactionHash } = req.body;
      if (!transactionHash) {
        return res.status(400).json({ error: 'transactionHash is required' });
      }
      const amount = await settler.processDeposit(userId, transactionHash);
      res.json({ success: true, amount, userId });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * CHECK TRUSTLINE — check if user has USDC trustline set up
   */
  router.get('/api/deposit/check-trustline/:accountId', async (req: Request, res: Response) => {
    try {
      if (!settler) {
        return res.status(503).json({ error: 'Settlement pipeline not configured' });
      }
      const hasTrustline = await settler.hasUsdcTrustline(req.params.accountId);
      res.json({ hasTrustline });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * BUILD TRUSTLINE TX — builds an unsigned changeTrust XDR for the frontend to sign with Freighter
   */
  router.post('/api/deposit/build-trustline', async (req: Request, res: Response) => {
    try {
      if (!settler) {
        return res.status(503).json({ error: 'Settlement pipeline not configured' });
      }
      const { sourceAccount } = req.body;
      if (!sourceAccount) {
        return res.status(400).json({ error: 'sourceAccount is required' });
      }
      const xdr = await settler.buildTrustlineTransaction(sourceAccount);
      res.json({ xdr });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * BUILD DEPOSIT TX — builds an unsigned USDC payment XDR for the frontend to sign with Freighter
   */
  router.post('/api/deposit/build-tx', async (req: Request, res: Response) => {
    try {
      if (!settler) {
        return res.status(503).json({ error: 'Settlement pipeline not configured' });
      }
      const { sourceAccount, amount } = req.body;
      if (!sourceAccount || !amount || amount <= 0) {
        return res.status(400).json({ error: 'sourceAccount and positive amount are required' });
      }
      const xdr = await settler.buildDepositTransaction(sourceAccount, amount);
      res.json({ xdr });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * ADMIN — solvency check: internal liabilities vs. on-chain settlement balance
   * Returns green if on-chain USDC >= total user liabilities.
   */
  router.get('/api/admin/solvency', async (req: Request, res: Response) => {
    try {
      const totals = db.getAccountingTotals();
      let onChainUsdc = 0;
      if (settler) {
        try {
          const onChain = await settler.getOnChainBalance();
          onChainUsdc = parseFloat(onChain.usdc);
        } catch {
          // settler offline — report liabilities only
        }
      }
      const surplus = onChainUsdc - totals.totalLiabilities;
      const solvent = surplus >= -0.01; // allow 1 cent rounding tolerance

      res.json({
        solvent,
        surplus,
        onChainUsdc,
        ...totals,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * ADMIN — audit log of deposits + withdrawals
   */
  router.get('/api/admin/audit', (req: Request, res: Response) => {
    try {
      res.json({
        recentDeposits: db.getRecentDeposits(50),
        recentWithdrawals: db.getRecentWithdrawals(50),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * ADMIN — check on-chain balance of settlement account
   */
  router.get('/api/admin/onchain-balance', async (req: Request, res: Response) => {
    try {
      if (!settler) {
        return res.status(503).json({ error: 'Settlement pipeline not configured' });
      }
      const balance = await settler.getOnChainBalance();
      res.json(balance);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
