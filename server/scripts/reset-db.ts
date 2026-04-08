/**
 * Reset the database — wipes ALL tables clean.
 * Run with: npx ts-node scripts/reset-db.ts
 */
import { Database } from '../src/db/database';

async function main() {
  const db = new Database('./data.db');
  await db.init();

  const tables = ['settlements', 'positions', 'trades', 'orders', 'balances', 'markets'];

  console.log('🗑️  Wiping all tables...');
  for (const table of tables) {
    (db as any).run(`DELETE FROM ${table}`, []);
    console.log(`  ✓ ${table} cleared`);
  }

  db.close();
  console.log('\n✅ Database reset complete. Ready for fresh seed.');
}

main().catch(console.error);
