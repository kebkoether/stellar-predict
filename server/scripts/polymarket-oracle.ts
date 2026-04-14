/**
 * Polymarket Price Feed Oracle
 *
 * Fetches prices from Polymarket's public API and writes them as reference
 * prices on Stellar (H)edge markets. Does NOT place any orders or require
 * a balance — it's purely informational.
 *
 * Users see Polymarket's price as the market reference. All real orders
 * come from real users with real money.
 *
 * Usage:
 *   API_BASE=https://your-railway-url/api \
 *   POLL_INTERVAL_MS=60000 \
 *   npx ts-node scripts/polymarket-oracle.ts
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '60000');

// Map question keywords → Polymarket slug.
// At startup, the oracle fetches all local markets and auto-matches by keyword.
const KEYWORD_TO_SLUG: Record<string, string> = {
  // NBA Champion 2026
  'thunder win the 2026 nba': 'will-the-oklahoma-city-thunder-win-the-2026-nba-finals',
  'celtics win the 2026 nba': 'will-the-boston-celtics-win-the-2026-nba-finals',
  'cavaliers win the 2026 nba': 'will-the-cleveland-cavaliers-win-the-2026-nba-finals',

  // FIFA World Cup 2026
  'brazil win the 2026 fifa': 'will-brazil-win-the-2026-fifa-world-cup-183',
  'france win the 2026 fifa': 'will-france-win-the-2026-fifa-world-cup-924',
  'argentina win the 2026 fifa': 'will-argentina-win-the-2026-fifa-world-cup-245',
  'england win the 2026 fifa': 'will-england-win-the-2026-fifa-world-cup-937',
  'spain win the 2026 fifa': 'will-spain-win-the-2026-fifa-world-cup-963',

  // 2028 US Presidential Election
  'jd vance win the 2028': 'will-jd-vance-win-the-2028-us-presidential-election',
  'gavin newsom win the 2028': 'will-gavin-newsom-win-the-2028-us-presidential-election',
  'ocasio-cortez win the 2028': 'will-alexandria-ocasio-cortez-win-the-2028-us-presidential-election',
  'kamala harris win the 2028': 'will-kamala-harris-win-the-2028-us-presidential-election',
  'tucker carlson win the 2028': 'will-tucker-carlson-win-the-2028-us-presidential-election',

  // Peru Presidential Election 2026
  'keiko fujimori': 'will-keiko-fujimori-win-the-2026-peruvian-presidential-election',
  'sánchez palomino': 'will-roberto-snchez-palomino-win-the-2026-peruvian-presidential-election',
  'jorge nieto': 'will-jorge-nieto-win-the-2026-peruvian-presidential-election',

  // Eurovision 2026
  'france win eurovision': 'will-france-win-eurovision-2026',
  'israel win eurovision': 'will-israel-win-eurovision-2026',
  'sweden win eurovision': 'will-sweden-win-eurovision-2026',
  'italy win eurovision': 'will-italy-win-eurovision-2026',

  // Men's Wimbledon 2026
  'sinner win 2026 men': 'will-jannik-sinner-be-the-2026-mens-wimbledon-winner',
  'alcaraz win 2026 men': 'will-carlos-alcaraz-be-the-2026-mens-wimbledon-winner',
  'djokovic win 2026 men': 'will-novak-djokovic-be-the-2026-mens-wimbledon-winner',

  // Women's Wimbledon 2026
  'sabalenka win 2026 women': 'will-aryna-sabalenka-be-the-2026-womens-wimbledon-winner',
  'anisimova win 2026 women': 'will-amanda-anisimova-be-the-2026-womens-wimbledon-winner',
  'gauff win 2026 women': 'will-coco-gauff-be-the-2026-womens-wimbledon-winner',

  // 2026 World Series
  'dodgers win the 2026 world series': 'will-the-los-angeles-dodgers-win-the-2026-world-series',
  'yankees win the 2026 world series': 'will-the-new-york-yankees-win-the-2026-world-series',
  'braves win the 2026 world series': 'will-the-atlanta-braves-win-the-2026-world-series',
  'mets win the 2026 world series': 'will-the-new-york-mets-win-the-2026-world-series',

  // Hungary PM
  'péter magyar become': 'will-the-next-prime-minister-of-hungary-be-pter-magyar',
  'orbán remain pm': 'will-the-next-prime-minister-of-hungary-be-viktor-orbn',

  // TikTok acquisition
  'microsoft acquire tiktok': 'will-microsoft-acquire-tiktok-637-223-119',
};

// Resolved at startup by matching local markets against KEYWORD_TO_SLUG
let POLYMARKET_SLUGS: Record<string, string> = {};

async function buildSlugMapping(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/markets`);
    if (!res.ok) { console.error('[oracle] Failed to fetch local markets'); return; }
    const markets = (await res.json()) as any[];
    for (const m of markets) {
      const q = (m.question || '').toLowerCase();
      for (const [keyword, slug] of Object.entries(KEYWORD_TO_SLUG)) {
        if (q.includes(keyword.toLowerCase())) {
          POLYMARKET_SLUGS[m.id] = slug;
          console.log(`[oracle] Mapped ${m.id.slice(0,8)}… "${m.question.slice(0,50)}" → ${slug.slice(0,40)}…`);
          break;
        }
      }
    }
    console.log(`[oracle] Auto-mapped ${Object.keys(POLYMARKET_SLUGS).length} markets to Polymarket slugs`);
  } catch (e) {
    console.error('[oracle] Failed to build slug mapping:', e);
  }
}

/**
 * Fetches current YES price from Polymarket's Gamma API.
 * Returns a decimal in [0, 1], or null on failure.
 */
async function fetchPolymarketPrice(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
    if (!res.ok) return null;
    const data = (await res.json()) as any[];
    if (!data.length) return null;
    const market = data[0];

    // Gamma API returns outcomePrices as a JSON string array: ["0.425", "0.575"]
    let prices = market.outcomePrices;
    if (typeof prices === 'string') {
      prices = JSON.parse(prices);
    }
    if (!Array.isArray(prices) || prices.length < 2) return null;

    const yes = parseFloat(prices[0]);
    if (isNaN(yes)) return null;
    return yes;
  } catch (e) {
    console.error(`[oracle] Polymarket fetch failed for ${slug}:`, e);
    return null;
  }
}

/**
 * On first run, cancel any stale orders left from the old market-making oracle.
 */
async function cleanupLegacyOrders(): Promise<void> {
  const ORACLE_USER = 'oracle-bot';
  try {
    const res = await fetch(`${API_BASE}/users/${ORACLE_USER}/orders`);
    if (!res.ok) return;
    const orders = (await res.json()) as any[];
    const open = orders.filter((o: any) => o.status === 'open' || o.status === 'partially_filled');
    if (open.length === 0) return;

    console.log(`[oracle] Cleaning up ${open.length} legacy oracle-bot orders...`);
    await Promise.all(open.map((o: any) =>
      fetch(`${API_BASE}/markets/${o.marketId}/orders/${o.id}`, { method: 'DELETE' })
    ));
    console.log(`[oracle] Cancelled ${open.length} legacy orders`);
  } catch (e) {
    console.warn('[oracle] Could not clean up legacy orders:', e);
  }
}

/**
 * Write the oracle reference price to a market via the admin API.
 */
async function setOraclePrice(marketId: string, price: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/markets/${marketId}/oracle-price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: Math.round(price * 1000) / 1000 }), // 3 decimal places
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function tick(): Promise<void> {
  const entries = Object.entries(POLYMARKET_SLUGS);
  if (!entries.length) {
    console.log('[oracle] No markets mapped yet');
    return;
  }

  for (const [marketId, slug] of entries) {
    const price = await fetchPolymarketPrice(slug);
    if (price === null) {
      console.log(`[oracle] No price for ${slug} — skipping`);
      continue;
    }

    const ok = await setOraclePrice(marketId, price);
    if (ok) {
      console.log(`[oracle] ${slug.slice(0, 35)}… → ${(price * 100).toFixed(1)}¢`);
    } else {
      console.error(`[oracle] Failed to set price for ${marketId.slice(0, 8)}`);
    }

    // Small delay between markets to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }
}

async function main(): Promise<void> {
  console.log(`[oracle] Starting Polymarket price feed oracle`);
  console.log(`[oracle] API=${API_BASE} poll=${POLL_INTERVAL_MS}ms`);
  console.log(`[oracle] Mode: REFERENCE PRICES ONLY — no orders, no balance needed`);

  // Auto-discover local market IDs
  await buildSlugMapping();

  // Cancel any leftover orders from the old market-making oracle
  await cleanupLegacyOrders();

  // Run forever
  while (true) {
    try {
      await tick();
    } catch (e) {
      console.error('[oracle] Tick error:', e);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main();
