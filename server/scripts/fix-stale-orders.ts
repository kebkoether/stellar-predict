/**
 * Fix stale open orders for resolved markets.
 * Cancels them and refunds locked collateral.
 * Run with: npx ts-node scripts/fix-stale-orders.ts
 */
import { Database } from '../src/db/database';

async function main() {
  const db = new Database('./data.db');
  await db.init();

  // Get all open/partially_filled orders
  const orders = (db as any).getAll(
    "SELECT * FROM orders WHERE status IN ('open', 'partially_filled')",
    []
  );

  console.log(`Found ${orders.length} open/partially_filled orders`);

  let fixedCount = 0;
  let totalRefunded = 0;

  for (const o of orders) {
    const mkt = (db as any).getOne('SELECT * FROM markets WHERE id = ?', [o.market_id]);

    console.log(`  Order ${o.id.slice(0, 8)}... market=${o.market_id.slice(0, 8)}... status=${mkt?.status ?? 'unknown'} side=${o.side} price=${o.price} qty=${o.quantity} filled=${o.filled_qty}`);

    if (mkt && mkt.status === 'resolved') {
      const remaining = o.quantity - o.filled_qty;
      const costPerShare = o.side === 'buy' ? o.price : (1 - o.price);
      const refund = costPerShare * remaining;

      const bal = (db as any).getOne('SELECT * FROM balances WHERE user_id = ?', [o.user_id]);
      if (bal) {
        // Only refund up to what's actually in locked — never create money
        const actualRefund = Math.min(refund, bal.locked);
        if (actualRefund < refund) {
          console.log(`    ⚠️  Can only refund $${actualRefund.toFixed(2)} of $${refund.toFixed(2)} (locked balance too low — collateral may have already been consumed)`);
        }
        const newAvailable = bal.available + actualRefund;
        const newLocked = bal.locked - actualRefund;

        console.log(`    -> Refunding $${actualRefund.toFixed(2)} to ${o.user_id.slice(0, 10)}...`);
        console.log(`       Balance: available $${bal.available.toFixed(2)} -> $${newAvailable.toFixed(2)}, locked $${bal.locked.toFixed(2)} -> $${newLocked.toFixed(2)}`);

        (db as any).run(
          'UPDATE balances SET available = ?, locked = ?, updated_at = ? WHERE user_id = ?',
          [newAvailable, newLocked, new Date().toISOString(), o.user_id]
        );
        totalRefunded += actualRefund;
      }

      (db as any).run(
        "UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?",
        [new Date().toISOString(), o.id]
      );

      console.log(`    -> Order cancelled`);
      fixedCount++;
    }
  }

  // Show final balances
  const balances = (db as any).getAll('SELECT * FROM balances', []);
  console.log(`\n--- Final Balances ---`);
  for (const b of balances) {
    console.log(`  ${b.user_id.slice(0, 10)}... available=$${b.available.toFixed(2)} locked=$${b.locked.toFixed(2)}`);
  }

  console.log(`\nFixed ${fixedCount} orders, refunded $${totalRefunded.toFixed(2)} total`);

  db.close();
  console.log('Done!');
}

main().catch(console.error);
