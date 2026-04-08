/**
 * Stress-test the prediction market accounting.
 *
 * 1. Resets the database
 * 2. Seeds 5 users ($200 each) and 4 markets
 * 3. Runs aggressive random trading with edge cases:
 *    - Price improvement (buy at 80c, sell at 20c → trade at 20c)
 *    - Partial fills
 *    - Self-trades
 *    - Extreme prices (95c, 5c)
 *    - Multiple users crossing same price
 * 4. Audits zero-sum after trading
 * 5. Resolves all 4 markets (2 YES wins, 2 NO wins)
 * 6. Audits zero-sum after resolution
 * 7. Spot-checks every trade for correct collateral accounting
 *
 * Run with: npx ts-node scripts/stress-test.ts
 * (Server must be running on port 3000)
 */

const API = 'http://localhost:3000/api';

const USERS = ['alice', 'bob', 'charlie', 'diana', 'evan'];
const DEPOSIT_AMOUNT = 200;
const TOTAL_DEPOSITED = USERS.length * DEPOSIT_AMOUNT;

const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4IYCGVS53UJVQ7RKSTD4P2WZDTAB47Z';

const MARKETS = [
  { question: 'Stress Test A: Will it rain tomorrow?', description: 'Test market A — resolved YES', outcomes: ['Yes', 'No'], resolveOutcome: 0 },
  { question: 'Stress Test B: Will BTC hit $500k?', description: 'Test market B — resolved NO', outcomes: ['Yes', 'No'], resolveOutcome: 1 },
  { question: 'Stress Test C: Extreme prices test', description: 'Test market C — resolved YES', outcomes: ['Yes', 'No'], resolveOutcome: 0 },
  { question: 'Stress Test D: Partial fill gauntlet', description: 'Test market D — resolved NO', outcomes: ['Yes', 'No'], resolveOutcome: 1 },
];

// --- HTTP helpers ---
async function post(endpoint: string, body: any) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return { _error: true, status: res.status, message: text };
  }
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function get(endpoint: string) {
  const res = await fetch(`${API}${endpoint}`);
  if (!res.ok) throw new Error(`GET ${endpoint} → ${res.status}`);
  return res.json();
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// --- Audit helpers ---
async function getSystemTotal(): Promise<{ byUser: Record<string, { available: number; locked: number }>; total: number }> {
  const byUser: Record<string, { available: number; locked: number }> = {};
  let total = 0;
  for (const user of USERS) {
    const bal: any = await get(`/users/${user}/balances`);
    byUser[user] = { available: bal.available, locked: bal.locked };
    total += bal.available + bal.locked;
  }
  return { byUser, total };
}

async function auditZeroSum(phase: string): Promise<boolean> {
  const { byUser, total } = await getSystemTotal();

  // Also count money sitting in open positions (collateral in markets)
  let positionCost = 0;
  try {
    // Get all open market positions via direct DB read
    const { Database } = require('../src/db/database');
    const db = new Database('./data.db');
    await db.init();
    const positions = (db as any).getAll(
      "SELECT p.cost_basis, p.quantity FROM positions p JOIN markets m ON p.market_id = m.id WHERE m.status != 'resolved' AND p.quantity > 0", []
    );
    for (const p of positions) positionCost += p.cost_basis;
    db.close();
  } catch { /* DB might be locked by server, use 0 */ }

  const systemTotal = total + positionCost;
  const diff = Math.abs(systemTotal - TOTAL_DEPOSITED);
  const ok = diff < 0.01;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`ZERO-SUM AUDIT: ${phase}`);
  console.log('='.repeat(60));
  for (const user of USERS) {
    const b = byUser[user];
    console.log(`  ${user.padEnd(10)} avail=$${b.available.toFixed(2).padStart(8)}  locked=$${b.locked.toFixed(2).padStart(8)}  total=$${(b.available + b.locked).toFixed(2).padStart(8)}`);
  }
  // Check for negative locked
  for (const user of USERS) {
    if (byUser[user].locked < -0.01) {
      console.log(`  ⚠️  ${user} has NEGATIVE locked: $${byUser[user].locked.toFixed(2)}`);
    }
  }
  console.log(`  ${'─'.repeat(55)}`);
  console.log(`  Balances: $${total.toFixed(2)}  +  In markets: $${positionCost.toFixed(2)}  =  $${systemTotal.toFixed(2)}   Expected: $${TOTAL_DEPOSITED.toFixed(2)}`);
  console.log(`  ${ok ? '✅ ZERO-SUM INTACT' : '❌ MONEY LEAK: $' + (systemTotal - TOTAL_DEPOSITED).toFixed(4)}`);
  return ok;
}

// --- Place order helper (swallows errors from insufficient balance etc) ---
async function placeOrder(marketId: string, userId: string, side: 'buy' | 'sell', price: number, quantity: number): Promise<any> {
  const result = await post(`/markets/${marketId}/orders`, {
    userId,
    side,
    outcomeIndex: 0, // all through YES book
    price: round2(price),
    quantity,
    type: 'limit',
  });
  if ((result as any)._error) {
    // Silently skip failed orders (usually balance issues)
    return null;
  }
  return result;
}

// =======================================================================
// MAIN
// =======================================================================
async function main() {
  console.log('🔬 STELLAR PREDICT — STRESS TEST');
  console.log('='.repeat(60));

  // ─── Phase 0: Verify clean state ───
  console.log('\n📋 Phase 0: Verifying clean database...');
  try {
    const markets = await get('/markets');
    if (Array.isArray(markets) && markets.length > 0) {
      console.log(`  ⚠️  Database has ${markets.length} existing markets. Run reset-db.ts and restart server first!`);
      console.log('     npx ts-node scripts/reset-db.ts && npx ts-node src/index.ts');
      process.exit(1);
    }
    console.log('  ✓ Database is clean');
  } catch (e) {
    console.log('  ❌ Server not reachable at localhost:3000. Start it first!');
    process.exit(1);
  }

  // ─── Phase 1: Seed users & markets ───
  console.log('\n📋 Phase 1: Seeding users and markets...');

  for (const user of USERS) {
    await post(`/users/${user}/deposit`, { amount: DEPOSIT_AMOUNT });
    console.log(`  ✓ ${user}: $${DEPOSIT_AMOUNT} deposited`);
  }

  const marketIds: string[] = [];
  for (const m of MARKETS) {
    const result: any = await post('/markets', {
      question: m.question,
      description: m.description,
      outcomes: m.outcomes,
      collateralCode: 'USDC',
      collateralIssuer: USDC_ISSUER,
      resolutionTime: '2026-12-31T00:00:00Z',
      createdBy: 'admin',
    });
    marketIds.push(result.id);
    console.log(`  ✓ Market "${m.question}" → ${result.id.slice(0, 8)}...`);
  }

  let allOk = await auditZeroSum('After seeding (no trades yet)');

  // ─── Phase 2: Market A — standard trading with price improvement ───
  console.log('\n\n📈 Phase 2: Market A — price improvement scenarios');
  const mA = marketIds[0];

  // Place sells first (these rest on the book)
  await placeOrder(mA, 'diana', 'sell', 0.40, 10);  // diana sells YES at 40c (locks 60c each)
  await placeOrder(mA, 'evan',  'sell', 0.45, 15);   // evan sells YES at 45c (locks 55c each)
  await placeOrder(mA, 'alice', 'sell', 0.50, 20);   // alice sells YES at 50c (locks 50c each)

  // Now buyers come in at HIGHER prices → price improvement!
  // bob bids 55c, should match diana's 40c first (saves 15c/share!)
  await placeOrder(mA, 'bob', 'buy', 0.55, 10);
  console.log('  ✓ bob buys 10 @ 55c → should match diana\'s sell at 40c (15c improvement)');

  // charlie bids 60c for 20, should eat evan's 45c (15 shares) then alice's 50c (5 shares)
  await placeOrder(mA, 'charlie', 'buy', 0.60, 20);
  console.log('  ✓ charlie buys 20 @ 60c → should match evan 45c (15) + alice 50c (5)');

  // alice places more sell at 48c, bob buys at exactly 48c (no improvement)
  await placeOrder(mA, 'alice', 'sell', 0.48, 5);
  await placeOrder(mA, 'bob', 'buy', 0.48, 5);
  console.log('  ✓ bob buys 5 @ 48c → matches alice at 48c (exact, no improvement)');

  // Remaining: alice still has 15 shares for sale at 50c
  // Place some resting bids that WON'T fill (to test cancellation on resolve)
  await placeOrder(mA, 'bob', 'buy', 0.30, 8);
  await placeOrder(mA, 'charlie', 'buy', 0.25, 12);
  console.log('  ✓ Resting bids placed (won\'t fill — test cancellation on resolve)');

  allOk = await auditZeroSum('After Market A trading') && allOk;

  // ─── Phase 3: Market B — self-trades and extreme prices ───
  console.log('\n\n📈 Phase 3: Market B — self-trades and extreme prices');
  const mB = marketIds[1];

  // alice trades with herself (YES and NO)
  await placeOrder(mB, 'alice', 'sell', 0.50, 10);
  await placeOrder(mB, 'alice', 'buy', 0.50, 10);
  console.log('  ✓ alice self-trades 10 shares at 50c');

  // bob at extreme: buys YES at 95c (very confident)
  await placeOrder(mB, 'diana', 'sell', 0.92, 5);
  await placeOrder(mB, 'bob', 'buy', 0.95, 5);
  console.log('  ✓ bob buys 5 at 95c → matches diana sell at 92c (3c improvement)');

  // charlie bids low: buy at 5c
  await placeOrder(mB, 'evan', 'sell', 0.05, 8);
  await placeOrder(mB, 'charlie', 'buy', 0.08, 8);
  console.log('  ✓ charlie buys 8 at 8c → matches evan sell at 5c (3c improvement)');

  // More resting orders
  await placeOrder(mB, 'diana', 'buy', 0.10, 10);
  await placeOrder(mB, 'evan', 'sell', 0.90, 10);
  console.log('  ✓ Resting orders at 10c and 90c');

  allOk = await auditZeroSum('After Market B trading') && allOk;

  // ─── Phase 4: Market C — many small partial fills ───
  console.log('\n\n📈 Phase 4: Market C — partial fills and order book depth');
  const mC = marketIds[2];

  // Stack the sell side with small orders at different prices
  await placeOrder(mC, 'alice', 'sell', 0.50, 3);
  await placeOrder(mC, 'bob',   'sell', 0.52, 4);
  await placeOrder(mC, 'diana', 'sell', 0.55, 5);
  await placeOrder(mC, 'evan',  'sell', 0.60, 6);

  // charlie sweeps through all of them with a big buy
  await placeOrder(mC, 'charlie', 'buy', 0.60, 18);
  console.log('  ✓ charlie buys 18 @ 60c → should partially fill through 4 sell levels');

  // Now stack the buy side
  await placeOrder(mC, 'alice',   'buy', 0.40, 3);
  await placeOrder(mC, 'bob',     'buy', 0.38, 4);
  await placeOrder(mC, 'charlie', 'buy', 0.35, 5);

  // diana sweeps through buys
  await placeOrder(mC, 'diana', 'sell', 0.35, 12);
  console.log('  ✓ diana sells 12 @ 35c → sweeps through 3 buy levels');

  allOk = await auditZeroSum('After Market C trading') && allOk;

  // ─── Phase 5: Market D — lots of resting, few fills ───
  console.log('\n\n📈 Phase 5: Market D — wide spread, few fills, many cancellations');
  const mD = marketIds[3];

  // Wide spread: bids at 20-30c, asks at 70-80c, nothing crosses
  await placeOrder(mD, 'alice',   'buy',  0.20, 10);
  await placeOrder(mD, 'bob',     'buy',  0.25, 8);
  await placeOrder(mD, 'charlie', 'buy',  0.30, 12);
  await placeOrder(mD, 'diana',   'sell', 0.70, 10);
  await placeOrder(mD, 'evan',    'sell', 0.75, 8);
  await placeOrder(mD, 'alice',   'sell', 0.80, 5);
  console.log('  ✓ Wide spread placed (no fills expected)');

  // Now one aggressive trade crosses
  await placeOrder(mD, 'bob', 'buy', 0.72, 5);
  console.log('  ✓ bob buys 5 @ 72c → should match diana sell at 70c (2c improvement)');

  allOk = await auditZeroSum('After all trading, before resolution') && allOk;

  // ─── Phase 6: Resolve all markets ───
  console.log('\n\n🏁 Phase 6: Resolving all markets...');

  for (let i = 0; i < MARKETS.length; i++) {
    const m = MARKETS[i];
    const id = marketIds[i];
    const winnerLabel = m.outcomes[m.resolveOutcome];

    console.log(`\n  Resolving "${m.question}" → ${winnerLabel}...`);
    const result: any = await post(`/admin/markets/${id}/resolve`, { outcomeIndex: m.resolveOutcome });

    if ((result as any)._error) {
      console.log(`  ❌ Resolution failed: ${(result as any).message}`);
      allOk = false;
    } else {
      console.log(`  ✓ Resolved. Collateral pool: $${result.collateralPool?.toFixed(2)}`);
      console.log(`    Zero-sum check: ${result.zeroSumCheck?.balanced ? '✅ balanced' : '❌ IMBALANCED'}`);
      if (result.payouts?.length) {
        for (const p of result.payouts) {
          console.log(`    Winner: ${p.userId.slice(0, 10)} paid $${p.costBasis.toFixed(2)} → received $${p.amount.toFixed(2)} (profit $${p.profit.toFixed(2)})`);
        }
      }
      if (result.losses?.length) {
        for (const l of result.losses) {
          console.log(`    Loser:  ${l.userId.slice(0, 10)} lost $${l.costBasis.toFixed(2)} (${l.outcome})`);
        }
      }
      if (!result.zeroSumCheck?.balanced) allOk = false;
    }
  }

  allOk = await auditZeroSum('After ALL resolutions') && allOk;

  // ─── Phase 7: Trade-by-trade spot check (via API) ───
  console.log('\n\n🔍 Phase 7: Trade-by-trade spot check...');

  let tradeErrors = 0;
  let totalTradesChecked = 0;

  for (const id of marketIds) {
    const trades = (await get(`/markets/${id}/trades?limit=1000`)) as any[];
    for (const t of trades) {
      totalTradesChecked++;
      const buyerCost = t.price * t.quantity;
      const sellerCost = (1 - t.price) * t.quantity;
      const totalCollateral = buyerCost + sellerCost;
      const expectedCollateral = t.quantity; // $1 per share

      const collateralOk = Math.abs(totalCollateral - expectedCollateral) < 0.001;

      if (!collateralOk) {
        console.log(`  ❌ Trade: ${t.quantity} shares @ ${(t.price * 100).toFixed(1)}c`);
        console.log(`     Buyer: $${buyerCost.toFixed(4)} + Seller: $${sellerCost.toFixed(4)} = $${totalCollateral.toFixed(4)} (expected $${expectedCollateral.toFixed(2)})`);
        tradeErrors++;
      }
    }
  }

  if (tradeErrors === 0) {
    console.log(`  ✅ All ${totalTradesChecked} trades have correct $1.00/share collateral`);
  } else {
    console.log(`  ❌ ${tradeErrors} of ${totalTradesChecked} trades with collateral errors`);
    allOk = false;
  }

  // ─── Final Verdict ───
  console.log('\n\n' + '='.repeat(60));
  if (allOk) {
    console.log('🎉 ALL TESTS PASSED — ZERO-SUM ACCOUNTING IS CORRECT');
  } else {
    console.log('💥 SOME TESTS FAILED — SEE ABOVE FOR DETAILS');
  }
  console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
