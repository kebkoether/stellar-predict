/**
 * Seed script using REAL on-chain USDC deposits.
 *
 * Each seed user sends their testnet USDC to the settlement account on-chain,
 * then the deposit is verified via the deposit-onchain API endpoint.
 * No fake balances — every dollar is backed by a real Stellar transaction.
 *
 * Prerequisites:
 *   - All seed wallets funded with testnet USDC via Circle faucet
 *   - Settlement account has USDC trustline
 *   - Server running on localhost:3000
 *
 * Run with: npx ts-node scripts/seed-onchain.ts
 */

import * as StellarSdk from '@stellar/stellar-sdk';
const { Keypair, TransactionBuilder, Networks, Operation, Asset, Horizon, BASE_FEE } = StellarSdk;

const API = 'http://localhost:3000/api';
const HORIZON = 'https://horizon-testnet.stellar.org';
const server = new Horizon.Server(HORIZON);

// Settlement account (receives all deposits)
const SETTLEMENT_SECRET = 'SAXOL3A54X3C4D2UMXAMLYSN7JG74VP2PHRCEFOPQF45XNR3PEUV2K3N';
const SETTLEMENT_PUBKEY = Keypair.fromSecret(SETTLEMENT_SECRET).publicKey();

// Circle testnet USDC
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC = new Asset('USDC', USDC_ISSUER);

// All 10 seed users with their secret keys
const USERS: Record<string, string> = {
  alice:   'SCBSVAC7X4DHSVKYZBFG43WVVORBALJFCZUWI2BS3LYFAGPXH22CG3BQ',
  bob:     'SDLCZWCFGHHDDGHVCIEPVJSN3PVUHDT3TZBE2U2LADSMT6YWBSBHPPIA',
  charlie: 'SDSHKOHCRSAWUDH76LNFJQXWPIE3S36WLEM6VM4QVZ62I2BUUPXL3FD5',
  diana:   'SD3XXCFJPXEOJDIF6LPHYB4VNSXOWQV7FLTHBRBNOGOOHFJZDPJCOJLE',
  evan:    'SC654EYOY5NNX3PNAFD7IZASYNRGGG2665BBYWBFN5GGDIYWZR2O6YQW',
  frank:   'SAHKI6BROY2DYV5HYDMDZXPHZLYRYRKE33EIBM5ADTLJH25BF4TAQWCI',
  grace:   'SCJ3FAEMNXFNGXMNJZVSZIFUFUOZTU4A5U7UGVVUVDU47EILXO27OCAV',
  hank:    'SDBEHCHSHMZT62RAAX5XNOOFD4WLU6ZH3ZLZ46GTJSE6WDAUGR3KYEP2',
  iris:    'SD7FQDLTBNSFGBBT6F3VQCTYBGO6EW4MSUCHDYYC74SDDBWYLWQQFLMU',
  jake:    'SBYCL6BS24XVPBDPJA6PIMMRQAMY7AY5BXY7A2344WOVXAO7T7DTF4AN',
};

const MARKETS = [
  { question: 'Will BTC exceed $200k by end of 2026?', description: 'Resolves YES if Bitcoin reaches $200,000 USD on any major exchange before January 1, 2027.', resolutionTime: '2026-12-31T00:00:00Z' },
  { question: 'Will ETH flip BTC in market cap by 2027?', description: 'Resolves YES if Ethereum market cap exceeds Bitcoin at any point before January 1, 2027.', resolutionTime: '2027-01-01T00:00:00Z' },
  { question: 'Will the US pass a stablecoin regulation bill in 2026?', description: 'Resolves YES if Congress passes and the President signs a stablecoin bill during 2026.', resolutionTime: '2026-12-31T00:00:00Z' },
  { question: 'Will Stellar (XLM) reach $1.00 in 2026?', description: 'Resolves YES if XLM/USD reaches $1.00 on CoinGecko during 2026.', resolutionTime: '2026-12-31T00:00:00Z' },
  { question: 'Will OpenAI release GPT-5 before July 2026?', description: 'Resolves YES if OpenAI publicly releases GPT-5 (GA, not preview) before July 1, 2026.', resolutionTime: '2026-07-01T00:00:00Z' },
  { question: 'Will a spot Solana ETF be approved in the US in 2026?', description: 'Resolves YES if the SEC approves at least one spot Solana ETF during 2026.', resolutionTime: '2026-12-31T00:00:00Z' },
  { question: 'Will global crypto market cap exceed $10 trillion in 2026?', description: 'Resolves YES if total crypto market cap (CoinGecko) exceeds $10T during 2026.', resolutionTime: '2026-12-31T00:00:00Z' },
  { question: 'Will there be a major CEX collapse (top 20) in 2026?', description: 'Resolves YES if a top-20 exchange halts withdrawals >7 days or files bankruptcy in 2026.', resolutionTime: '2026-12-31T00:00:00Z' },
];

// How much each user deposits (leave some USDC in wallet for future tests)
const DEPOSIT_AMOUNT = 10; // $10 each, keep $10 in reserve

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

async function sendUSDCOnChain(name: string, secret: string, amount: number): Promise<string> {
  const keypair = Keypair.fromSecret(secret);

  // Check current USDC balance
  const acct = await server.loadAccount(keypair.publicKey());
  const usdcBal = acct.balances.find((b: any) => b.asset_code === 'USDC');
  const available = usdcBal ? parseFloat(usdcBal.balance) : 0;

  if (available < amount) {
    throw new Error(`${name} only has ${available.toFixed(2)} USDC on-chain (needs ${amount})`);
  }

  // Build payment transaction
  const tx = new TransactionBuilder(acct, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.payment({
      destination: SETTLEMENT_PUBKEY,
      asset: USDC,
      amount: amount.toFixed(7),
    }))
    .setTimeout(30)
    .build();

  tx.sign(keypair);
  const result = await server.submitTransaction(tx);
  return (result as any).hash;
}

async function seed() {
  console.log('🚀 STELLAR PREDICT — ON-CHAIN SEED');
  console.log('='.repeat(60));
  console.log(`Settlement account: ${SETTLEMENT_PUBKEY.slice(0, 16)}...`);
  console.log(`Deposit amount: $${DEPOSIT_AMOUNT} per user`);
  console.log(`Users: ${Object.keys(USERS).length}\n`);

  // ─── Phase 1: On-chain deposits ───
  console.log('💰 Phase 1: On-chain USDC deposits...\n');

  let totalDeposited = 0;

  for (const [name, secret] of Object.entries(USERS)) {
    try {
      // Step 1: Send USDC on-chain
      const txHash = await sendUSDCOnChain(name, secret, DEPOSIT_AMOUNT);
      console.log(`  ${name}: sent $${DEPOSIT_AMOUNT} USDC → settlement (tx: ${txHash.slice(0, 12)}...)`);

      // Step 2: Verify via API
      const result = await post(`/users/${name}/deposit-onchain`, { transactionHash: txHash });
      console.log(`  ${name}: ✅ credited $${result.amount} internally`);
      totalDeposited += DEPOSIT_AMOUNT;
    } catch (err: any) {
      console.log(`  ${name}: ❌ ${err.message}`);
    }
  }

  console.log(`\n  Total deposited: $${totalDeposited} (${Object.keys(USERS).length} users × $${DEPOSIT_AMOUNT})`);

  // Verify internal balances
  console.log('\n  Internal balances:');
  for (const name of Object.keys(USERS)) {
    try {
      const bal: any = await get(`/users/${name}/balances`);
      console.log(`    ${name.padEnd(10)} $${bal.available.toFixed(2)} available`);
    } catch {
      console.log(`    ${name.padEnd(10)} no balance`);
    }
  }

  // ─── Phase 2: Create markets ───
  console.log('\n📊 Phase 2: Creating markets...\n');

  const marketIds: string[] = [];
  for (const m of MARKETS) {
    try {
      const result: any = await post('/markets', {
        question: m.question,
        description: m.description,
        outcomes: ['Yes', 'No'],
        collateralCode: 'USDC',
        collateralIssuer: USDC_ISSUER,
        resolutionTime: m.resolutionTime,
        createdBy: 'admin',
      });
      marketIds.push(result.id);
      console.log(`  ✅ "${m.question}" → ${result.id.slice(0, 8)}...`);
    } catch (err: any) {
      console.log(`  ❌ "${m.question}": ${err.message}`);
    }
  }

  // ─── Phase 3: Place seed orders for liquidity ───
  console.log('\n📈 Phase 3: Placing seed orders for liquidity...\n');

  const userNames = Object.keys(USERS);

  for (let i = 0; i < marketIds.length; i++) {
    const mId = marketIds[i];
    // Each market gets a "fair price" in the 30-70c range
    const fairPrice = 0.30 + (i / MARKETS.length) * 0.40; // spreads markets across price range

    const orders = [
      // Bids below fair price
      { userId: userNames[i % 10],     side: 'buy',  price: Math.round((fairPrice - 0.05) * 100) / 100, quantity: 3 },
      { userId: userNames[(i+1) % 10], side: 'buy',  price: Math.round((fairPrice - 0.10) * 100) / 100, quantity: 4 },
      { userId: userNames[(i+2) % 10], side: 'buy',  price: Math.round((fairPrice - 0.15) * 100) / 100, quantity: 2 },
      // Asks above fair price
      { userId: userNames[(i+3) % 10], side: 'sell', price: Math.round((fairPrice + 0.05) * 100) / 100, quantity: 3 },
      { userId: userNames[(i+4) % 10], side: 'sell', price: Math.round((fairPrice + 0.10) * 100) / 100, quantity: 4 },
      { userId: userNames[(i+5) % 10], side: 'sell', price: Math.round((fairPrice + 0.15) * 100) / 100, quantity: 2 },
      // One crossing trade at fair price to create activity
      { userId: userNames[(i+6) % 10], side: 'sell', price: Math.round(fairPrice * 100) / 100, quantity: 2 },
      { userId: userNames[(i+7) % 10], side: 'buy',  price: Math.round(fairPrice * 100) / 100, quantity: 2 },
    ];

    let placed = 0;
    for (const o of orders) {
      try {
        await post(`/markets/${mId}/orders`, {
          ...o,
          outcomeIndex: 0,
          type: 'limit',
        });
        placed++;
      } catch {
        // Balance insufficient — skip
      }
    }
    console.log(`  Market ${i+1}/${marketIds.length}: ${placed} orders placed, fair ~${(fairPrice * 100).toFixed(0)}¢`);
  }

  // ─── Phase 4: Final state ───
  console.log('\n' + '='.repeat(60));
  console.log('📊 Final State\n');

  // Check on-chain settlement balance
  try {
    const onchain: any = await get('/admin/onchain-balance');
    console.log(`  Settlement on-chain: ${onchain.usdc ?? onchain.USDC ?? '?'} USDC`);
  } catch { /* not critical */ }

  // Check all user balances
  let systemTotal = 0;
  for (const name of userNames) {
    try {
      const bal: any = await get(`/users/${name}/balances`);
      const total = bal.available + bal.locked;
      systemTotal += total;
      console.log(`  ${name.padEnd(10)} avail=$${bal.available.toFixed(2).padStart(6)}  locked=$${bal.locked.toFixed(2).padStart(6)}  total=$${total.toFixed(2).padStart(6)}`);
    } catch {
      console.log(`  ${name.padEnd(10)} no balance`);
    }
  }

  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  System total: $${systemTotal.toFixed(2)}  (deposited: $${totalDeposited.toFixed(2)})`);
  console.log(`  ${Math.abs(systemTotal - totalDeposited) < 0.01 ? '✅ Balanced' : '❌ Mismatch!'}`);

  console.log('\n🚀 Ready! Open http://localhost:3002 and connect your Freighter wallet.');
  console.log('   Your wallet still has $20 USDC — deposit some to start trading!\n');
}

seed().catch(console.error);
