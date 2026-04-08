/**
 * Seed script — populates the prediction market with demo markets and trades
 * Includes a zero-sum resolution test to verify the collateral model works.
 *
 * Run with: npx ts-node scripts/seed.ts
 */

const API = 'http://localhost:3000/api';

interface Market {
  question: string;
  description: string;
  outcomes: string[];
  collateralCode: string;
  collateralIssuer: string;
  resolutionTime: string;
  createdBy: string;
}

const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4IYCGVS53UJVQ7RKSTD4P2WZDTAB47Z';

const MARKETS: Market[] = [
  {
    question: 'Will BTC exceed $200k by end of 2026?',
    description: 'Resolves YES if Bitcoin reaches $200,000 USD on any major exchange (Coinbase, Binance, Kraken) before January 1, 2027.',
    outcomes: ['Yes', 'No'],
    collateralCode: 'USDC',
    collateralIssuer: USDC_ISSUER,
    resolutionTime: '2026-12-31T00:00:00Z',
    createdBy: 'admin',
  },
  {
    question: 'Will ETH flip BTC in market cap by 2027?',
    description: 'Resolves YES if Ethereum market capitalization exceeds Bitcoin market capitalization at any point before January 1, 2027.',
    outcomes: ['Yes', 'No'],
    collateralCode: 'USDC',
    collateralIssuer: USDC_ISSUER,
    resolutionTime: '2027-01-01T00:00:00Z',
    createdBy: 'admin',
  },
  {
    question: 'Will the US pass a stablecoin regulation bill in 2026?',
    description: 'Resolves YES if the US Congress passes and the President signs a comprehensive stablecoin regulation bill during 2026.',
    outcomes: ['Yes', 'No'],
    collateralCode: 'USDC',
    collateralIssuer: USDC_ISSUER,
    resolutionTime: '2026-12-31T00:00:00Z',
    createdBy: 'admin',
  },
  {
    question: 'Will Stellar (XLM) reach $1.00 in 2026?',
    description: 'Resolves YES if XLM/USD reaches $1.00 on CoinGecko at any point during 2026.',
    outcomes: ['Yes', 'No'],
    collateralCode: 'USDC',
    collateralIssuer: USDC_ISSUER,
    resolutionTime: '2026-12-31T00:00:00Z',
    createdBy: 'admin',
  },
  {
    question: 'Will OpenAI release GPT-5 before July 2026?',
    description: 'Resolves YES if OpenAI publicly releases (general availability, not limited preview) a model officially named GPT-5 before July 1, 2026.',
    outcomes: ['Yes', 'No'],
    collateralCode: 'USDC',
    collateralIssuer: USDC_ISSUER,
    resolutionTime: '2026-07-01T00:00:00Z',
    createdBy: 'admin',
  },
  {
    question: 'Will a spot Solana ETF be approved in the US in 2026?',
    description: 'Resolves YES if the SEC approves at least one spot Solana ETF for trading on US exchanges during 2026.',
    outcomes: ['Yes', 'No'],
    collateralCode: 'USDC',
    collateralIssuer: USDC_ISSUER,
    resolutionTime: '2026-12-31T00:00:00Z',
    createdBy: 'admin',
  },
  {
    question: 'Will global crypto market cap exceed $10 trillion in 2026?',
    description: 'Resolves YES if total cryptocurrency market capitalization (per CoinGecko) exceeds $10 trillion at any point during 2026.',
    outcomes: ['Yes', 'No'],
    collateralCode: 'USDC',
    collateralIssuer: USDC_ISSUER,
    resolutionTime: '2026-12-31T00:00:00Z',
    createdBy: 'admin',
  },
  {
    question: 'Will there be a major CEX collapse (top 20) in 2026?',
    description: 'Resolves YES if any top-20 crypto exchange by volume (per CoinGecko ranking as of Jan 1 2026) halts withdrawals for >7 days or files for bankruptcy during 2026.',
    outcomes: ['Yes', 'No'],
    collateralCode: 'USDC',
    collateralIssuer: USDC_ISSUER,
    resolutionTime: '2026-12-31T00:00:00Z',
    createdBy: 'admin',
  },
];

const USERS = ['alice', 'bob', 'charlie', 'diana', 'evan'];

async function post(endpoint: string, body: any) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${endpoint} failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function get(endpoint: string) {
  const res = await fetch(`${API}${endpoint}`);
  if (!res.ok) throw new Error(`GET ${endpoint} failed: ${res.status}`);
  return res.json();
}

async function seed() {
  console.log('🌱 Seeding prediction markets...\n');

  // 1. Create user balances
  console.log('💰 Creating user balances...');
  for (const user of USERS) {
    try {
      await post(`/users/${user}/deposit`, { amount: 10000 });
      console.log(`  ✓ ${user}: $10,000 deposited`);
    } catch (e: any) {
      console.log(`  ⚠ ${user}: ${e.message}`);
    }
  }

  // 2. Create markets
  console.log('\n📊 Creating markets...');
  const marketIds: string[] = [];
  for (const market of MARKETS) {
    try {
      const result: any = await post('/markets', market);
      marketIds.push(result.id);
      console.log(`  ✓ "${market.question}" → ${result.id.slice(0, 8)}...`);
    } catch (e: any) {
      console.log(`  ⚠ "${market.question}": ${e.message}`);
    }
  }

  // 3. Place orders to create activity
  console.log('\n📈 Placing orders to generate trading activity...');

  for (let i = 0; i < marketIds.length; i++) {
    const marketId = marketIds[i];
    const fairPrice = 0.3 + Math.random() * 0.4;

    const orders = [
      // Bids below fair price
      { userId: 'alice', side: 'buy', outcomeIndex: 0, price: Math.round((fairPrice - 0.05) * 100) / 100, quantity: Math.floor(5 + Math.random() * 20), type: 'limit' },
      { userId: 'bob', side: 'buy', outcomeIndex: 0, price: Math.round((fairPrice - 0.10) * 100) / 100, quantity: Math.floor(10 + Math.random() * 30), type: 'limit' },
      { userId: 'charlie', side: 'buy', outcomeIndex: 0, price: Math.round((fairPrice - 0.15) * 100) / 100, quantity: Math.floor(5 + Math.random() * 15), type: 'limit' },
      // Asks above fair price
      { userId: 'diana', side: 'sell', outcomeIndex: 0, price: Math.round((fairPrice + 0.05) * 100) / 100, quantity: Math.floor(5 + Math.random() * 20), type: 'limit' },
      { userId: 'evan', side: 'sell', outcomeIndex: 0, price: Math.round((fairPrice + 0.10) * 100) / 100, quantity: Math.floor(10 + Math.random() * 30), type: 'limit' },
      { userId: 'alice', side: 'sell', outcomeIndex: 0, price: Math.round((fairPrice + 0.15) * 100) / 100, quantity: Math.floor(5 + Math.random() * 15), type: 'limit' },
    ];

    // Place a crossing trade to generate an actual matched trade
    orders.push(
      { userId: 'bob', side: 'buy', outcomeIndex: 0, price: Math.round(fairPrice * 100) / 100, quantity: 5, type: 'limit' },
      { userId: 'diana', side: 'sell', outcomeIndex: 0, price: Math.round(fairPrice * 100) / 100, quantity: 5, type: 'limit' },
    );

    for (const order of orders) {
      try {
        await post(`/markets/${marketId}/orders`, order);
      } catch (e: any) {
        // Some orders might fail (balance), that's ok
      }
    }
    console.log(`  ✓ Market ${i + 1}/${marketIds.length}: orders placed, fair price ~${(fairPrice * 100).toFixed(0)}¢`);
  }

  // 4. Run a zero-sum resolution test on market 1 (BTC $200k)
  console.log('\n' + '='.repeat(60));
  console.log('🧪 ZERO-SUM RESOLUTION TEST');
  console.log('='.repeat(60));

  if (marketIds.length > 0) {
    const testMarketId = marketIds[0];

    // Check positions before resolution
    console.log('\nPositions in BTC $200k market:');
    for (const user of USERS) {
      const positions: any = await get(`/users/${user}/positions`);
      const marketPositions = positions.filter((p: any) => p.marketId === testMarketId && p.quantity > 0);
      for (const pos of marketPositions) {
        const outcomeLabel = pos.outcomeIndex === 0 ? 'YES' : 'NO';
        console.log(`  ${user}: ${pos.quantity} ${outcomeLabel} tokens (cost basis: $${pos.costBasis.toFixed(2)})`);
      }
    }

    // Check balances before resolution
    console.log('\nBalances BEFORE resolution:');
    const balancesBefore: Record<string, number> = {};
    for (const user of USERS) {
      const bal: any = await get(`/users/${user}/balances`);
      balancesBefore[user] = bal.available + bal.locked;
      console.log(`  ${user}: $${bal.available.toFixed(2)} available + $${bal.locked.toFixed(2)} locked = $${(bal.available + bal.locked).toFixed(2)} total`);
    }

    // Resolve: YES wins (outcome 0)
    console.log('\n🏁 Resolving BTC $200k market → YES wins...');
    const resolution: any = await post(`/admin/markets/${testMarketId}/resolve`, { outcomeIndex: 0 });
    console.log(`  Result: ${resolution.message}`);
    console.log(`  Collateral pool: $${resolution.collateralPool?.toFixed(2)}`);
    console.log(`  Zero-sum check: ${resolution.zeroSumCheck?.balanced ? '✅ BALANCED' : '❌ IMBALANCED'}`);

    if (resolution.payouts) {
      console.log('\n  Winners:');
      for (const p of resolution.payouts) {
        console.log(`    ${p.userId}: paid $${p.costBasis.toFixed(2)}, received $${p.amount.toFixed(2)}, profit $${p.profit.toFixed(2)} (${p.outcome})`);
      }
    }
    if (resolution.losses) {
      console.log('  Losers:');
      for (const l of resolution.losses) {
        console.log(`    ${l.userId}: lost $${l.costBasis.toFixed(2)} (${l.outcome} tokens now worthless)`);
      }
    }

    // Check balances after resolution
    // NOTE: Collateral consumed during trading leaves balances and enters the market pool.
    // On resolution, the pool pays winners. So the correct check is:
    //   (balances_before + collateral_in_market) should equal (balances_after)
    const collateralPool = resolution.collateralPool ?? 0;

    console.log('\nBalances AFTER resolution:');
    let totalBefore = 0;
    let totalAfter = 0;
    for (const user of USERS) {
      const bal: any = await get(`/users/${user}/balances`);
      const after = bal.available + bal.locked;
      const diff = after - balancesBefore[user];
      totalBefore += balancesBefore[user];
      totalAfter += after;
      const sign = diff >= 0 ? '+' : '';
      console.log(`  ${user}: $${after.toFixed(2)} (${sign}$${diff.toFixed(2)})`);
    }

    // The correct zero-sum check: balances_before + collateral_pool = balances_after
    // Because the collateral was already OUT of balances (consumed during trading),
    // and resolution puts it BACK to winners.
    const expectedAfter = totalBefore + collateralPool;
    const diff = Math.abs(totalAfter - expectedAfter);

    console.log('\n  === ZERO-SUM AUDIT ===');
    console.log(`  Balances before resolution:    $${totalBefore.toFixed(2)}`);
    console.log(`  + Collateral pool in market:   $${collateralPool.toFixed(2)}`);
    console.log(`  = Total money in system:       $${expectedAfter.toFixed(2)}`);
    console.log(`  Balances after resolution:     $${totalAfter.toFixed(2)}`);
    console.log(`  Winner profit: $${resolution.payouts?.reduce((s: number, p: any) => s + p.profit, 0).toFixed(2)}`);
    console.log(`  Loser losses:  $${resolution.losses?.reduce((s: number, l: any) => s + l.amount, 0).toFixed(2)}`);
    console.log(`  ${diff < 0.01 ? '✅ PERFECT ZERO-SUM — no money created or destroyed!' : '❌ IMBALANCED — money leak detected'}`);
  }

  // 5. Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Seeding complete!\n');

  const allMarkets = await get('/markets');
  console.log(`Markets created: ${Array.isArray(allMarkets) ? allMarkets.length : 0}`);

  for (const user of USERS) {
    try {
      const balance: any = await get(`/users/${user}/balances`);
      console.log(`${user}: $${balance.available?.toFixed(2)} available, $${balance.locked?.toFixed(2)} locked`);
    } catch {
      console.log(`${user}: no balance`);
    }
  }

  console.log('\n🚀 Open http://localhost:3002 to see your markets!');
}

seed().catch(console.error);
