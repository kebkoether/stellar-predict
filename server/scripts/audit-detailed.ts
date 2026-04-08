/**
 * Detailed dollar-by-dollar audit of every balance change.
 * Run with: npx ts-node scripts/audit-detailed.ts
 */
import { Database } from '../src/db/database';

async function main() {
  const db = new Database('./data.db');
  await db.init();

  // Get ALL users
  const allBalances = (db as any).getAll('SELECT * FROM balances', []);

  console.log(`\n${'='.repeat(70)}`);
  console.log('ALL USERS CURRENT STATE');
  console.log(`${'='.repeat(70)}`);

  let systemTotal = 0;
  for (const b of allBalances) {
    const total = b.available + b.locked;
    systemTotal += total;
    console.log(`  ${b.user_id.slice(0, 14).padEnd(16)} avail=$${b.available.toFixed(2).padStart(10)} locked=$${b.locked.toFixed(2).padStart(10)} total=$${total.toFixed(2).padStart(10)}`);
  }
  console.log(`  ${''.padEnd(16)} ${''.padEnd(28)} SYSTEM=$${systemTotal.toFixed(2).padStart(10)}`);

  // Get all positions grouped by market
  const markets = (db as any).getAll('SELECT * FROM markets ORDER BY created_at ASC', []);

  for (const m of markets) {
    const outcomes = JSON.parse(m.outcomes);
    const positions = (db as any).getAll('SELECT * FROM positions WHERE market_id = ? AND quantity > 0', [m.id]);
    const trades = (db as any).getAll('SELECT * FROM trades WHERE market_id = ? ORDER BY timestamp ASC', [m.id]);
    const orders = (db as any).getAll('SELECT * FROM orders WHERE market_id = ?', [m.id]);

    if (positions.length === 0 && trades.length === 0) continue;

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`MARKET: "${m.question.slice(0, 60)}"`);
    console.log(`Status: ${m.status} | Winner: ${m.resolved_outcome_index !== null ? outcomes[m.resolved_outcome_index] : 'N/A'}`);

    console.log(`\n  Trades (${trades.length}):`);
    let totalCollateral = 0;
    for (const t of trades) {
      const buyerCost = t.price * t.quantity;
      const sellerCost = (1 - t.price) * t.quantity;
      totalCollateral += buyerCost + sellerCost;
      console.log(`    Buyer=${t.buy_user_id.slice(0, 10)}... paid $${buyerCost.toFixed(2)} | Seller=${t.sell_user_id.slice(0, 10)}... paid $${sellerCost.toFixed(2)} | ${t.quantity} shares @ ${(t.price * 100).toFixed(1)}c | collateral=$${(buyerCost + sellerCost).toFixed(2)}`);
    }
    console.log(`    Total collateral in market: $${totalCollateral.toFixed(2)}`);

    console.log(`\n  Positions (${positions.length}):`);
    let totalCostBasis = 0;
    for (const p of positions) {
      const outcomeName = outcomes[p.outcome_index] ?? `Outcome ${p.outcome_index}`;
      totalCostBasis += p.cost_basis;

      let resolution = '';
      if (m.status === 'resolved') {
        const won = p.outcome_index === m.resolved_outcome_index;
        const payout = won ? p.quantity : 0;
        resolution = won ? ` -> WON $${payout.toFixed(2)}` : ` -> LOST $${p.cost_basis.toFixed(2)}`;
      }
      console.log(`    ${p.user_id.slice(0, 10)}... holds ${p.quantity} ${outcomeName} | cost=$${p.cost_basis.toFixed(2)}${resolution}`);
    }
    console.log(`    Total cost basis: $${totalCostBasis.toFixed(2)} (should = collateral $${totalCollateral.toFixed(2)})`);
    if (Math.abs(totalCostBasis - totalCollateral) > 0.01) {
      console.log(`    ⚠️  MISMATCH: diff = $${(totalCostBasis - totalCollateral).toFixed(2)}`);
    }

    console.log(`\n  Orders (${orders.length}):`);
    for (const o of orders) {
      const costPerShare = o.side === 'buy' ? o.price : (1 - o.price);
      const totalCost = costPerShare * o.quantity;
      const remaining = o.quantity - o.filled_qty;
      const stillLocked = costPerShare * remaining;
      console.log(`    [${o.status.padEnd(16)}] ${o.user_id.slice(0, 10)}... ${o.side.padEnd(4)} ${o.quantity} @ ${(o.price * 100).toFixed(1)}c | cost=$${totalCost.toFixed(2)} filled=${o.filled_qty}/${o.quantity} locked_remaining=$${(o.status === 'open' || o.status === 'partially_filled' ? stillLocked : 0).toFixed(2)}`);
    }
  }

  // Cross-check: for each user, sum up what their balance SHOULD be
  console.log(`\n${'='.repeat(70)}`);
  console.log('PER-USER BALANCE RECONSTRUCTION');
  console.log(`${'='.repeat(70)}`);

  for (const bal of allBalances) {
    const userId = bal.user_id;

    // Money IN: deposits (we don't track deposits explicitly, so we infer)
    // Money OUT: cost of positions in open markets (consumed from locked into market)
    // Money BACK: resolution payouts

    const positions = (db as any).getAll(
      'SELECT p.*, m.status as mkt_status, m.resolved_outcome_index FROM positions p JOIN markets m ON p.market_id = m.id WHERE p.user_id = ? AND p.quantity > 0',
      [userId]
    );

    let moneyInMarkets = 0;  // cost basis of positions in open markets
    let moneyWon = 0;        // payouts from resolved markets
    let moneyLostInResolved = 0;

    for (const p of positions) {
      if (p.mkt_status === 'resolved') {
        const won = p.outcome_index === p.resolved_outcome_index;
        if (won) {
          moneyWon += p.quantity;  // $1 per winning share
        }
        // Cost basis was consumed when trade happened, payout already credited
      } else {
        moneyInMarkets += p.cost_basis;
      }
    }

    // Open orders still locking money
    const openOrders = (db as any).getAll(
      "SELECT * FROM orders WHERE user_id = ? AND status IN ('open', 'partially_filled')",
      [userId]
    );
    let moneyInOrders = 0;
    for (const o of openOrders) {
      const remaining = o.quantity - o.filled_qty;
      const costPerShare = o.side === 'buy' ? o.price : (1 - o.price);
      moneyInOrders += costPerShare * remaining;
    }

    // Inferred deposit = balance + money in markets + money in orders
    // (minus winnings that were already added back to balance)
    const inferredDeposit = bal.available + bal.locked + moneyInMarkets;

    console.log(`\n  ${userId.slice(0, 14)}...`);
    console.log(`    Available:           $${bal.available.toFixed(2)}`);
    console.log(`    Locked:              $${bal.locked.toFixed(2)}`);
    console.log(`    In open markets:     $${moneyInMarkets.toFixed(2)}`);
    console.log(`    In open orders:      $${moneyInOrders.toFixed(2)}`);
    console.log(`    Won from resolved:   $${moneyWon.toFixed(2)}`);
    console.log(`    Inferred deposit:    $${inferredDeposit.toFixed(2)}`);
    console.log(`    Balance (avail+lock):$${(bal.available + bal.locked).toFixed(2)}`);
  }

  db.close();
  console.log('\nDetailed audit complete.');
}

main().catch(console.error);
