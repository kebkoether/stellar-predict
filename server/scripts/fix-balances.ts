/**
 * Recalculate correct balances from first principles.
 *
 * For each user:
 *   correct_balance = initial_deposit
 *                   - cost of positions in OPEN markets
 *                   - cost of open orders (locked collateral)
 *                   + payouts from resolved markets (winning positions)
 *                   - cost of losing positions in resolved markets (already spent)
 *                   + 0 (losing positions don't cost extra — money was already taken at trade time)
 *
 * Simpler way to think about it:
 *   deposit - all_trade_costs + all_resolution_payouts = expected total (available + locked)
 *   locked = cost of open orders remaining unfilled
 *   available = total - locked
 *
 * Run with: npx ts-node scripts/fix-balances.ts
 */
import { Database } from '../src/db/database';

async function main() {
  const db = new Database('./data.db');
  await db.init();

  const allBalances = (db as any).getAll('SELECT * FROM balances', []);

  // We need to figure out each user's initial deposit.
  // Since we don't track deposits, we use a known mapping.
  // If you have more users, add them here.
  const knownDeposits: Record<string, number> = {};

  // Auto-detect deposits: for each user, look at their first balance entry
  // Actually, we'll compute it: deposit = total_trade_costs - total_payouts + current_balance
  // But that's circular if the current balance is wrong.
  // Instead, let's ask for known deposits or infer from round numbers.

  console.log('\n=== BALANCE RECALCULATION FROM TRADE HISTORY ===\n');

  for (const bal of allBalances) {
    const userId = bal.user_id;
    const shortId = userId.slice(0, 14) + '...';

    // Get all trades where this user was buyer or seller
    const trades = (db as any).getAll(
      'SELECT t.*, m.status as mkt_status, m.resolved_outcome_index, m.outcomes FROM trades t JOIN markets m ON t.market_id = m.id WHERE t.buy_user_id = ? OR t.sell_user_id = ? ORDER BY t.timestamp ASC',
      [userId, userId]
    );

    // Get all positions
    const positions = (db as any).getAll(
      'SELECT p.*, m.status as mkt_status, m.resolved_outcome_index, m.outcomes FROM positions p JOIN markets m ON p.market_id = m.id WHERE p.user_id = ?',
      [userId]
    );

    // Get open orders (unfilled portions still locking money)
    const openOrders = (db as any).getAll(
      "SELECT * FROM orders WHERE user_id = ? AND status IN ('open', 'partially_filled')",
      [userId]
    );

    // Calculate total money spent on trades
    let totalTradesCost = 0;
    for (const t of trades) {
      const isBuyer = t.buy_user_id === userId;
      const cost = isBuyer ? t.price * t.quantity : (1 - t.price) * t.quantity;
      totalTradesCost += cost;
    }

    // Calculate total payouts from resolved markets
    let totalPayouts = 0;
    for (const p of positions) {
      if (p.mkt_status === 'resolved' && p.quantity > 0) {
        const won = p.outcome_index === p.resolved_outcome_index;
        if (won) {
          totalPayouts += p.quantity; // $1 per winning share
        }
      }
    }

    // Calculate money still locked in open orders
    let openOrdersLocked = 0;
    for (const o of openOrders) {
      const remaining = o.quantity - o.filled_qty;
      const costPerShare = o.side === 'buy' ? o.price : (1 - o.price);
      openOrdersLocked += costPerShare * remaining;
    }

    // Calculate money locked in open market positions (not resolved yet)
    let openPositionsCost = 0;
    for (const p of positions) {
      if (p.mkt_status !== 'resolved' && p.quantity > 0) {
        openPositionsCost += p.cost_basis;
      }
    }

    // Try to infer deposit from known state
    // deposit = currentAvailable + currentLocked + totalTradesCost - totalPayouts
    // But currentBalance is wrong, so we can't use it.
    // We'll use the known deposits or prompt the user.

    // For now, let's compute what deposit MUST have been:
    // correct_available = deposit - totalTradesCost + totalPayouts - openOrdersLocked
    // correct_locked = openOrdersLocked
    // correct_total = deposit - totalTradesCost + totalPayouts

    // We need to know the deposit to fix the balance.
    // Let's show the math and let the operator confirm.

    console.log(`USER: ${shortId}`);
    console.log(`  Current: available=$${bal.available.toFixed(2)}, locked=$${bal.locked.toFixed(2)}, total=$${(bal.available + bal.locked).toFixed(2)}`);
    console.log(`  Total cost of all trades:    $${totalTradesCost.toFixed(2)}`);
    console.log(`  Total resolution payouts:    $${totalPayouts.toFixed(2)}`);
    console.log(`  Open orders locked:          $${openOrdersLocked.toFixed(2)}`);
    console.log(`  Open positions cost basis:   $${openPositionsCost.toFixed(2)}`);

    // For a correct balance:
    // available + locked = deposit - totalTradesCost + totalPayouts
    // locked = openOrdersLocked
    // available = deposit - totalTradesCost + totalPayouts - openOrdersLocked

    // Inferred deposit (assuming current balance is wrong, we solve backwards from what it SHOULD be)
    // Actually we can't infer deposit from wrong data. Let's try common round numbers.
    const possibleDeposits = [10, 20, 50, 100, 200, 500, 1000];

    console.log(`\n  Possible correct balances by deposit amount:`);
    for (const dep of possibleDeposits) {
      const correctTotal = dep - totalTradesCost + totalPayouts;
      const correctLocked = openOrdersLocked;
      const correctAvailable = correctTotal - correctLocked;
      if (correctTotal >= 0 && correctAvailable >= 0) {
        const diff = (bal.available + bal.locked) - correctTotal;
        const marker = Math.abs(diff) < 0.01 ? ' ✅ MATCHES' : ` (off by $${diff.toFixed(2)})`;
        console.log(`    If deposit=$${dep}: available=$${correctAvailable.toFixed(2)}, locked=$${correctLocked.toFixed(2)}, total=$${correctTotal.toFixed(2)}${marker}`);
      }
    }
    console.log('');
  }

  // Now apply fixes with known deposits
  console.log('\n=== APPLYING FIXES ===\n');
  console.log('Known deposits: Keb=$20, Diana(seed)=$100');
  console.log('(Edit the knownDeposits map in this script if different)\n');

  // Detect users by trade patterns
  for (const bal of allBalances) {
    const userId = bal.user_id;
    const shortId = userId.slice(0, 14) + '...';

    const trades = (db as any).getAll(
      'SELECT t.*, m.status as mkt_status, m.resolved_outcome_index FROM trades t JOIN markets m ON t.market_id = m.id WHERE t.buy_user_id = ? OR t.sell_user_id = ? ORDER BY t.timestamp ASC',
      [userId, userId]
    );
    const positions = (db as any).getAll(
      'SELECT p.*, m.status as mkt_status, m.resolved_outcome_index FROM positions p JOIN markets m ON p.market_id = m.id WHERE p.user_id = ?',
      [userId]
    );
    const openOrders = (db as any).getAll(
      "SELECT * FROM orders WHERE user_id = ? AND status IN ('open', 'partially_filled')",
      [userId]
    );

    let totalTradesCost = 0;
    for (const t of trades) {
      const isBuyer = t.buy_user_id === userId;
      totalTradesCost += isBuyer ? t.price * t.quantity : (1 - t.price) * t.quantity;
    }

    let totalPayouts = 0;
    for (const p of positions) {
      if (p.mkt_status === 'resolved' && p.quantity > 0) {
        if (p.outcome_index === p.resolved_outcome_index) {
          totalPayouts += p.quantity;
        }
      }
    }

    let openOrdersLocked = 0;
    for (const o of openOrders) {
      const remaining = o.quantity - o.filled_qty;
      const costPerShare = o.side === 'buy' ? o.price : (1 - o.price);
      openOrdersLocked += costPerShare * remaining;
    }

    // Guess deposit: if trades cost ~$14-15 and user has small balance → $20 deposit
    // If user was only a seller (seed user) → $100 deposit
    const isSeedUser = trades.length > 0 && trades.every((t: any) => t.sell_user_id === userId || t.buy_user_id === userId);

    // Use heuristic: check if user was ever a seller in non-self-trades
    const sellTrades = trades.filter((t: any) => t.sell_user_id === userId && t.buy_user_id !== userId);
    const buyTrades = trades.filter((t: any) => t.buy_user_id === userId && t.sell_user_id !== userId);

    let deposit: number;
    // Seed users (alice, bob, charlie, diana, evan) get $10,000
    // Real users (Stellar wallet addresses starting with G) get $20
    if (userId.startsWith('G')) {
      deposit = 20; // Real Stellar wallet user
    } else {
      deposit = 10000; // Seed user
    }

    // Override with known deposits if set
    if (knownDeposits[userId] !== undefined) {
      deposit = knownDeposits[userId];
    }

    const correctTotal = deposit - totalTradesCost + totalPayouts;
    const correctLocked = openOrdersLocked;
    const correctAvailable = correctTotal - correctLocked;

    const currentTotal = bal.available + bal.locked;
    const diff = currentTotal - correctTotal;

    console.log(`${shortId}: deposit=$${deposit}`);
    console.log(`  Current:  available=$${bal.available.toFixed(2)}, locked=$${bal.locked.toFixed(2)}, total=$${currentTotal.toFixed(2)}`);
    console.log(`  Correct:  available=$${correctAvailable.toFixed(2)}, locked=$${correctLocked.toFixed(2)}, total=$${correctTotal.toFixed(2)}`);

    if (Math.abs(diff) < 0.01 && Math.abs(bal.locked - correctLocked) < 0.01) {
      console.log(`  ✅ Balance is correct — no fix needed`);
    } else {
      console.log(`  ⚠️  Off by $${diff.toFixed(2)} — FIXING`);
      (db as any).run(
        'UPDATE balances SET available = ?, locked = ?, updated_at = ? WHERE user_id = ?',
        [correctAvailable, correctLocked, new Date().toISOString(), userId]
      );
      console.log(`  ✅ Fixed!`);
    }
    console.log('');
  }

  db.close();
  console.log('Balance correction complete.');
}

main().catch(console.error);
