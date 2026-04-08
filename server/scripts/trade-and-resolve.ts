/**
 * Random trading + market resolution script.
 *
 * Phase 1: Aggressive random trades across all open markets using seed users
 * Phase 2: Resolve 4 markets (2 YES, 2 NO) to test full payout cycle
 * Phase 3: Accounting audit — verify zero-sum across entire system
 *
 * Run with: npx ts-node scripts/trade-and-resolve.ts
 */

const API = 'http://localhost:3000/api';

const SEED_USERS = [
  'alice', 'bob', 'charlie', 'diana', 'evan',
  'frank', 'grace', 'hank', 'iris', 'jake',
];

async function post(endpoint: string, body: any) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${endpoint}: ${res.status} ${text}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function get(endpoint: string) {
  const res = await fetch(`${API}${endpoint}`);
  if (!res.ok) throw new Error(`GET ${endpoint}: ${res.status}`);
  return res.json();
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randPrice(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function randQty(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

async function main() {
  console.log('🎲 STELLAR PREDICT — RANDOM TRADING + RESOLUTION');
  console.log('='.repeat(60));

  // ─── Get current state ───
  const markets = (await get('/markets')) as any[];
  const openMarkets = markets.filter((m: any) => m.status === 'open');
  console.log(`\n📊 Found ${markets.length} markets (${openMarkets.length} open)\n`);

  if (openMarkets.length === 0) {
    console.log('No open markets to trade on. Run seed-onchain.ts first.');
    return;
  }

  // Show starting balances
  console.log('💰 Starting balances:');
  let startingTotal = 0;
  for (const user of SEED_USERS) {
    try {
      const bal: any = await get(`/users/${user}/balances`);
      const total = bal.available + bal.locked;
      startingTotal += total;
      console.log(`  ${user.padEnd(10)} avail=$${bal.available.toFixed(2).padStart(6)}  locked=$${bal.locked.toFixed(2).padStart(6)}  total=$${total.toFixed(2).padStart(6)}`);
    } catch {
      console.log(`  ${user.padEnd(10)} no balance`);
    }
  }

  // Also check for Keb's wallet (the real user)
  const leaderboard = (await get('/leaderboard')) as any[];
  const realUsers = leaderboard.filter((u: any) => u.userId.startsWith('G'));
  for (const u of realUsers) {
    startingTotal += u.available + u.locked;
    console.log(`  ${u.userId.slice(0, 10).padEnd(10)} avail=$${u.available.toFixed(2).padStart(6)}  locked=$${(u.locked || 0).toFixed(2).padStart(6)}  total=$${(u.available + (u.locked || 0)).toFixed(2).padStart(6)} (real user)`);
  }
  console.log(`  ${'─'.repeat(55)}`);
  console.log(`  System total: $${startingTotal.toFixed(2)}\n`);

  // ═════════════════════════════════════════════════════════
  // PHASE 1: Random trading
  // ═════════════════════════════════════════════════════════
  console.log('🎯 Phase 1: Random trading across all markets...\n');

  let totalTrades = 0;
  let totalOrders = 0;
  let failedOrders = 0;

  // 5 rounds of trading across all open markets
  for (let round = 1; round <= 5; round++) {
    console.log(`  Round ${round}/5:`);
    let roundTrades = 0;

    for (const market of openMarkets) {
      // Each round: 3-6 random orders per market
      const numOrders = randQty(3, 6);

      for (let i = 0; i < numOrders; i++) {
        const user = pick(SEED_USERS);
        const side = Math.random() > 0.5 ? 'buy' : 'sell';

        // Price ranges that create crossing (trades) — not just resting orders
        let price: number;
        if (side === 'buy') {
          price = randPrice(0.20, 0.80); // Aggressive buys that will cross sells
        } else {
          price = randPrice(0.15, 0.75); // Aggressive sells that will cross buys
        }

        const quantity = randQty(1, 5);

        try {
          const result: any = await post(`/markets/${market.id}/orders`, {
            userId: user,
            side,
            outcomeIndex: 0,
            price,
            quantity,
            type: 'limit',
          });
          totalOrders++;

          if (result.trades && result.trades.length > 0) {
            roundTrades += result.trades.length;
            totalTrades += result.trades.length;
          }
        } catch {
          failedOrders++;
          // Usually insufficient balance — expected
        }
      }
    }
    console.log(`    ${roundTrades} trades executed this round`);
  }

  console.log(`\n  Summary: ${totalOrders} orders placed, ${totalTrades} trades, ${failedOrders} insufficient balance\n`);

  // ═════════════════════════════════════════════════════════
  // PHASE 2: Mid-trading balance check
  // ═════════════════════════════════════════════════════════
  console.log('📊 Phase 2: Mid-trading balance check...\n');

  let midTotal = 0;
  for (const user of SEED_USERS) {
    try {
      const bal: any = await get(`/users/${user}/balances`);
      midTotal += bal.available + bal.locked;
    } catch { /* skip */ }
  }
  for (const u of realUsers) {
    try {
      const bal: any = await get(`/users/${u.userId}/balances`);
      midTotal += bal.available + bal.locked;
    } catch { /* skip */ }
  }
  console.log(`  System total (available + locked): $${midTotal.toFixed(2)}`);
  console.log(`  Starting total was: $${startingTotal.toFixed(2)}`);
  console.log(`  ${Math.abs(midTotal - startingTotal) < 0.02 ? '✅ Still balanced' : `⚠️ Drift: $${(midTotal - startingTotal).toFixed(4)}`}\n`);

  // ═════════════════════════════════════════════════════════
  // PHASE 3: Resolve 4 markets
  // ═════════════════════════════════════════════════════════
  console.log('⚖️  Phase 3: Resolving markets...\n');

  // Pick up to 4 markets to resolve: first 2 as YES (outcome 0), next 2 as NO (outcome 1)
  const toResolve = openMarkets.slice(0, Math.min(4, openMarkets.length));

  const resolutionResults: any[] = [];
  for (let i = 0; i < toResolve.length; i++) {
    const market = toResolve[i];
    const outcomeIndex = i < 2 ? 0 : 1; // First 2 → YES, next 2 → NO
    const outcomeName = outcomeIndex === 0 ? 'YES' : 'NO';

    try {
      const result: any = await post(`/admin/markets/${market.id}/resolve`, { outcomeIndex });
      resolutionResults.push(result);

      console.log(`  ✅ "${market.question.slice(0, 50)}..." → ${outcomeName}`);
      console.log(`     Collateral pool: $${result.zeroSumCheck?.totalCollateral?.toFixed(2) ?? '?'}`);
      console.log(`     Payout: $${result.zeroSumCheck?.totalPayout?.toFixed(2) ?? '?'}`);
      console.log(`     Zero-sum: ${result.zeroSumCheck?.balanced ? '✅ Balanced' : '❌ IMBALANCED'}`);
      console.log(`     Winners: ${result.payouts?.length ?? 0}, Losers: ${result.losses?.length ?? 0}`);
      console.log('');
    } catch (err: any) {
      console.log(`  ❌ "${market.question.slice(0, 50)}...": ${err.message}\n`);
    }
  }

  // ═════════════════════════════════════════════════════════
  // PHASE 4: Post-resolution accounting audit
  // ═════════════════════════════════════════════════════════
  console.log('🔍 Phase 4: Post-resolution accounting audit...\n');

  // Collect all user balances
  let finalTotal = 0;
  const allUsers = [...SEED_USERS];
  for (const u of realUsers) {
    allUsers.push(u.userId);
  }

  console.log('  Final balances:');
  for (const user of allUsers) {
    try {
      const bal: any = await get(`/users/${user}/balances`);
      const total = bal.available + bal.locked;
      finalTotal += total;
      const displayName = user.startsWith('G') ? user.slice(0, 10) + '...' : user;
      console.log(`    ${displayName.padEnd(14)} avail=$${bal.available.toFixed(2).padStart(7)}  locked=$${bal.locked.toFixed(2).padStart(6)}  total=$${total.toFixed(2).padStart(7)}`);
    } catch {
      const displayName = user.startsWith('G') ? user.slice(0, 10) + '...' : user;
      console.log(`    ${displayName.padEnd(14)} no balance`);
    }
  }

  // Check remaining open markets for locked collateral
  const updatedMarkets = (await get('/markets')) as any[];
  const stillOpen = updatedMarkets.filter((m: any) => m.status === 'open');

  console.log(`\n  ${'─'.repeat(55)}`);
  console.log(`  Final system total:    $${finalTotal.toFixed(2)}`);
  console.log(`  Starting system total: $${startingTotal.toFixed(2)}`);
  console.log(`  Markets still open:    ${stillOpen.length} (collateral still locked in positions)`);
  console.log(`  Markets resolved:      ${toResolve.length}`);

  const drift = Math.abs(finalTotal - startingTotal);
  if (drift < 0.02) {
    console.log(`\n  ✅ ACCOUNTING VERIFIED — Zero-sum preserved (drift: $${drift.toFixed(4)})`);
  } else {
    console.log(`\n  ⚠️  DRIFT DETECTED: $${drift.toFixed(4)}`);
    console.log(`     This may be expected if money is locked in open market positions.`);
  }

  // Verify all resolved markets were zero-sum
  const allBalanced = resolutionResults.every(r => r.zeroSumCheck?.balanced);
  console.log(`  ${allBalanced ? '✅' : '❌'} All ${resolutionResults.length} resolved markets: ${allBalanced ? 'zero-sum verified' : 'IMBALANCE FOUND'}`);

  // Check for any users with negative balances (should never happen)
  let hasNegative = false;
  for (const user of allUsers) {
    try {
      const bal: any = await get(`/users/${user}/balances`);
      if (bal.available < -0.001 || bal.locked < -0.001) {
        console.log(`  ❌ NEGATIVE BALANCE: ${user} → avail=${bal.available}, locked=${bal.locked}`);
        hasNegative = true;
      }
    } catch { /* skip */ }
  }
  if (!hasNegative) {
    console.log(`  ✅ No negative balances detected`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Done! Check http://localhost:3002 to see the results.\n');
}

main().catch(console.error);
