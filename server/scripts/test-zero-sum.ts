/**
 * Quick test to verify zero-sum collateral math.
 * Run with: npx ts-node scripts/test-zero-sum.ts
 *
 * This creates an in-memory database, runs trades through the matching engine,
 * resolves the market, and checks that total money in = total money out.
 */

import { Database } from '../src/db/database';
import { MatchingEngine } from '../src/engine/matching';
import { Market } from '../src/types';
import { v4 as uuidv4 } from 'uuid';

async function test() {
  console.log('🧪 Zero-Sum Collateral Test\n');

  // In-memory database
  const db = new Database(':memory:');
  await db.init();
  const engine = new MatchingEngine(db);

  // Create a binary market
  const market: Market = {
    id: uuidv4(),
    question: 'Test market: Will it rain tomorrow?',
    description: 'Test',
    outcomes: ['Yes', 'No'],
    status: 'open',
    collateralToken: { code: 'USDC', issuer: 'test' },
    createdAt: new Date(),
    resolutionTime: new Date('2030-01-01'),
    createdBy: 'admin',
  };
  db.createMarket(market);

  // Fund users
  db.createUserBalance('alice', 1000);
  db.createUserBalance('bob', 1000);
  db.createUserBalance('charlie', 1000);

  const totalDeposited = 3000;
  console.log(`Deposited: alice=$1000, bob=$1000, charlie=$1000 (total: $${totalDeposited})\n`);

  // =============================
  // SCENARIO: Trade at 60¢
  // Alice buys 10 YES at 60¢ → costs $6.00
  // Bob sells 10 YES at 60¢ → costs $4.00 (he gets NO tokens)
  // =============================

  console.log('--- Trade 1: Alice buys 10 YES at 60¢, Bob sells 10 YES at 60¢ ---');

  // Alice places buy
  const r1 = engine.submitOrder({
    id: uuidv4(),
    marketId: market.id,
    userId: 'alice',
    side: 'buy',
    outcomeIndex: 0,
    price: 0.60,
    quantity: 10,
    type: 'limit',
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date(),
    filledQty: 0,
    cancelledQty: 0,
  });
  console.log(`  Alice buy: ${r1.status}, trades: ${r1.trades.length}`);

  // Bob places sell (crosses Alice's bid)
  const r2 = engine.submitOrder({
    id: uuidv4(),
    marketId: market.id,
    userId: 'bob',
    side: 'sell',
    outcomeIndex: 0,
    price: 0.60,
    quantity: 10,
    type: 'limit',
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date(),
    filledQty: 0,
    cancelledQty: 0,
  });
  console.log(`  Bob sell: ${r2.status}, trades: ${r2.trades.length}`);

  // =============================
  // SCENARIO: Another trade at 70¢
  // Charlie buys 5 YES at 70¢ from Alice who sells at 70¢
  // =============================

  console.log('\n--- Trade 2: Charlie buys 5 YES at 70¢, Alice sells 5 YES at 70¢ ---');

  const r3 = engine.submitOrder({
    id: uuidv4(),
    marketId: market.id,
    userId: 'charlie',
    side: 'buy',
    outcomeIndex: 0,
    price: 0.70,
    quantity: 5,
    type: 'limit',
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date(),
    filledQty: 0,
    cancelledQty: 0,
  });
  console.log(`  Charlie buy: ${r3.status}, trades: ${r3.trades.length}`);

  const r4 = engine.submitOrder({
    id: uuidv4(),
    marketId: market.id,
    userId: 'alice',
    side: 'sell',
    outcomeIndex: 0,
    price: 0.70,
    quantity: 5,
    type: 'limit',
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date(),
    filledQty: 0,
    cancelledQty: 0,
  });
  console.log(`  Alice sell: ${r4.status}, trades: ${r4.trades.length}`);

  // Check positions
  console.log('\n--- Positions ---');
  const positions = db.getMarketPositions(market.id);
  for (const pos of positions) {
    const label = pos.outcomeIndex === 0 ? 'YES' : 'NO';
    console.log(`  ${pos.userId}: ${pos.quantity} ${label} (cost: $${pos.costBasis.toFixed(2)})`);
  }

  // Check balances
  console.log('\n--- Balances before resolution ---');
  let totalInSystem = 0;
  for (const user of ['alice', 'bob', 'charlie']) {
    const bal = db.getUserBalance(user)!;
    const total = bal.available + bal.locked;
    totalInSystem += total;
    console.log(`  ${user}: $${bal.available.toFixed(2)} available + $${bal.locked.toFixed(2)} locked = $${total.toFixed(2)}`);
  }
  // Add collateral in positions (money that left balances and is now in the market)
  const totalCostBasis = positions.reduce((s, p) => s + (p.quantity > 0 ? p.costBasis : 0), 0);
  totalInSystem += totalCostBasis;
  console.log(`  Collateral in market: $${totalCostBasis.toFixed(2)}`);
  console.log(`  Total in system: $${totalInSystem.toFixed(2)} (should be $${totalDeposited.toFixed(2)})`);
  console.log(`  ${Math.abs(totalInSystem - totalDeposited) < 0.01 ? '✅ Accounting balanced' : '❌ ACCOUNTING ERROR'}`);

  // =============================
  // RESOLVE: YES wins (outcome 0)
  // =============================
  console.log('\n--- Resolving: YES wins ---');

  // Expected:
  // Alice: has 10 YES (cost $6.00) + 5 NO (cost $1.50) → 10 YES win = $10.00, 5 NO lose
  // Bob: has 10 NO (cost $4.00) → loses $4.00
  // Charlie: has 5 YES (cost $3.50) → 5 YES win = $5.00

  db.updateMarketStatus(market.id, 'resolved', 0);
  const resolvedPositions = db.getMarketPositions(market.id);

  let totalPayout = 0;
  let totalLossAmount = 0;

  for (const pos of resolvedPositions) {
    if (pos.quantity <= 0) continue;
    if (pos.outcomeIndex === 0) {
      // Winner
      const payout = pos.quantity;
      const profit = payout - pos.costBasis;
      totalPayout += payout;
      const bal = db.getUserBalance(pos.userId)!;
      db.updateUserBalance(pos.userId, { available: bal.available + payout });
      console.log(`  💰 ${pos.userId}: ${pos.quantity} YES → $${payout.toFixed(2)} (profit: $${profit.toFixed(2)})`);
    } else {
      // Loser
      totalLossAmount += pos.costBasis;
      console.log(`  ❌ ${pos.userId}: ${pos.quantity} NO → $0.00 (lost: $${pos.costBasis.toFixed(2)})`);
    }
  }

  console.log(`\n  Total payout: $${totalPayout.toFixed(2)}`);
  console.log(`  Total losses: $${totalLossAmount.toFixed(2)}`);
  console.log(`  Collateral pool: $${totalCostBasis.toFixed(2)}`);
  console.log(`  Payout = Collateral? ${Math.abs(totalPayout - totalCostBasis) < 0.01 ? '✅ YES' : '❌ NO'}`);

  // Final balances
  console.log('\n--- Final balances ---');
  let finalTotal = 0;
  for (const user of ['alice', 'bob', 'charlie']) {
    const bal = db.getUserBalance(user)!;
    const total = bal.available + bal.locked;
    finalTotal += total;
    console.log(`  ${user}: $${total.toFixed(2)} (available: $${bal.available.toFixed(2)})`);
  }

  console.log(`\n  Total deposited: $${totalDeposited.toFixed(2)}`);
  console.log(`  Total final:     $${finalTotal.toFixed(2)}`);
  console.log(`  ${Math.abs(finalTotal - totalDeposited) < 0.01 ? '✅ PERFECT ZERO-SUM: No money created or destroyed!' : '❌ MONEY LEAK: System is not zero-sum!'}`);

  db.close();
}

test().catch(console.error);
