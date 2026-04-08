/**
 * Audit a user's full account history: deposits, trades, resolutions, balance.
 * Run with: npx ts-node scripts/audit-account.ts
 */
import { Database } from '../src/db/database';

async function main() {
  const db = new Database('./data.db');
  await db.init();

  // Get all users
  const balances = (db as any).getAll('SELECT * FROM balances', []);

  for (const bal of balances) {
    const userId = bal.user_id;
    const shortId = userId.slice(0, 12) + '...';

    console.log(`\n${'='.repeat(70)}`);
    console.log(`USER: ${shortId}`);
    console.log(`${'='.repeat(70)}`);

    // Current balance
    console.log(`\nCurrent Balance:`);
    console.log(`  Available: $${bal.available.toFixed(2)}`);
    console.log(`  Locked:    $${bal.locked.toFixed(2)}`);
    console.log(`  Total:     $${(bal.available + bal.locked).toFixed(2)}`);

    // All orders
    const orders = (db as any).getAll(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at ASC',
      [userId]
    );

    console.log(`\nOrders (${orders.length}):`);
    for (const o of orders) {
      const mkt = (db as any).getOne('SELECT question, status, resolved_outcome_index FROM markets WHERE id = ?', [o.market_id]);
      const costPerShare = o.side === 'buy' ? o.price : (1 - o.price);
      const totalLocked = costPerShare * o.quantity;
      console.log(`  [${o.status.padEnd(16)}] ${o.side.padEnd(4)} ${o.quantity} shares @ ${(o.price * 100).toFixed(1)}c = $${totalLocked.toFixed(2)} locked | filled=${o.filled_qty}/${o.quantity} | "${mkt?.question?.slice(0, 40) ?? o.market_id.slice(0, 8)}..." (mkt ${mkt?.status})`);
    }

    // All trades (as buyer or seller)
    const trades = (db as any).getAll(
      'SELECT * FROM trades WHERE buy_user_id = ? OR sell_user_id = ? ORDER BY timestamp ASC',
      [userId, userId]
    );

    console.log(`\nTrades (${trades.length}):`);
    let totalBuyCost = 0;
    let totalSellCost = 0;
    for (const t of trades) {
      const mkt = (db as any).getOne('SELECT question, outcomes, status, resolved_outcome_index FROM markets WHERE id = ?', [t.market_id]);
      const isBuyer = t.buy_user_id === userId;
      const role = isBuyer ? 'BUYER (YES)' : 'SELLER (NO)';
      const cost = isBuyer ? t.price * t.quantity : (1 - t.price) * t.quantity;
      if (isBuyer) totalBuyCost += cost; else totalSellCost += cost;
      console.log(`  ${role.padEnd(12)} ${t.quantity} shares @ ${(t.price * 100).toFixed(1)}c = $${cost.toFixed(2)} | "${mkt?.question?.slice(0, 40) ?? t.market_id.slice(0, 8)}..." (mkt ${mkt?.status})`);
    }

    // All positions
    const positions = (db as any).getAll(
      'SELECT p.*, m.question, m.outcomes, m.status as mkt_status, m.resolved_outcome_index FROM positions p JOIN markets m ON p.market_id = m.id WHERE p.user_id = ?',
      [userId]
    );

    console.log(`\nPositions (${positions.length}):`);
    let totalWon = 0;
    let totalLost = 0;
    for (const p of positions) {
      if (p.quantity <= 0) continue;
      const outcomes = JSON.parse(p.outcomes);
      const outcomeName = outcomes[p.outcome_index] ?? `Outcome ${p.outcome_index}`;
      const isResolved = p.mkt_status === 'resolved';
      let resultStr = 'OPEN';
      if (isResolved) {
        const won = p.outcome_index === p.resolved_outcome_index;
        const payout = won ? p.quantity : 0;
        const pnl = payout - p.cost_basis;
        resultStr = won ? `WON +$${pnl.toFixed(2)} (payout $${payout.toFixed(2)})` : `LOST -$${p.cost_basis.toFixed(2)}`;
        if (won) totalWon += payout; else totalLost += p.cost_basis;
      }
      console.log(`  ${outcomeName.padEnd(6)} ${p.quantity} shares, cost $${p.cost_basis.toFixed(2)} | "${p.question?.slice(0, 40)}..." | ${resultStr}`);
    }

    // Money flow summary
    console.log(`\n--- Money Flow ---`);
    console.log(`  Total cost as buyer (YES positions):  $${totalBuyCost.toFixed(2)}`);
    console.log(`  Total cost as seller (NO positions):  $${totalSellCost.toFixed(2)}`);
    console.log(`  Total cost in trades:                 $${(totalBuyCost + totalSellCost).toFixed(2)}`);
    console.log(`  Won back from resolutions:            $${totalWon.toFixed(2)}`);
    console.log(`  Lost in resolutions:                  $${totalLost.toFixed(2)}`);
    console.log(`  Net P&L from resolved:                $${(totalWon - totalLost - totalBuyCost - totalSellCost + totalWon + totalLost).toFixed(2)}`);

    // What balance SHOULD be
    // Initial deposit = current available + locked + all cost_basis in open positions - winnings received
    // Actually let's just check: deposits - cost of trades + winnings = expected balance
    const openPositionCost = positions
      .filter((p: any) => p.mkt_status !== 'resolved' && p.quantity > 0)
      .reduce((s: number, p: any) => s + p.cost_basis, 0);
    const resolvedPositionCost = positions
      .filter((p: any) => p.mkt_status === 'resolved' && p.quantity > 0)
      .reduce((s: number, p: any) => s + p.cost_basis, 0);

    const expectedBalance = bal.available + bal.locked;
    const accountedFor = bal.available + bal.locked + openPositionCost + resolvedPositionCost - totalWon;

    console.log(`\n--- Balance Check ---`);
    console.log(`  Available + Locked:          $${(bal.available + bal.locked).toFixed(2)}`);
    console.log(`  + open position cost basis:  $${openPositionCost.toFixed(2)}`);
    console.log(`  + resolved position costs:   $${resolvedPositionCost.toFixed(2)}`);
    console.log(`  - resolution winnings:       $${totalWon.toFixed(2)}`);
    console.log(`  = Total deposited (approx):  $${accountedFor.toFixed(2)}`);
  }

  // Also check all markets
  const markets = (db as any).getAll('SELECT * FROM markets ORDER BY created_at ASC', []);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`ALL MARKETS (${markets.length})`);
  console.log(`${'='.repeat(70)}`);
  for (const m of markets) {
    const outcomes = JSON.parse(m.outcomes);
    const winner = m.resolved_outcome_index !== null ? outcomes[m.resolved_outcome_index] : 'N/A';
    console.log(`  [${m.status.padEnd(8)}] "${m.question.slice(0, 50)}" winner=${winner}`);
  }

  db.close();
  console.log('\nAudit complete.');
}

main().catch(console.error);
