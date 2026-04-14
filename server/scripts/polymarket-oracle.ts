/**
 * Polymarket Oracle Bot
 *
 * Fetches prices from Polymarket's public API and mirrors them on Stellar Hedge
 * by continuously placing tight bid/ask quotes around their mid price.
 *
 * This gives your users something to trade against from day one, so you don't
 * need to bootstrap market makers manually.
 *
 * Usage:
 *   API_BASE=https://your-railway-url/api \
 *   ORACLE_USER=oracle-bot \
 *   SPREAD_CENTS=2 \
 *   QUOTE_SIZE=100 \
 *   POLL_INTERVAL_MS=45000 \
 *   npx ts-node scripts/polymarket-oracle.ts
 *
 * Mapping: edit POLYMARKET_SLUGS below to map each of your market IDs → Polymarket slug.
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';
const ORACLE_USER = process.env.ORACLE_USER || 'oracle-bot';
const SPREAD_CENTS = parseInt(process.env.SPREAD_CENTS || '2'); // half-spread, each side
const QUOTE_SIZE = parseFloat(process.env.QUOTE_SIZE || '50'); // shares per side
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '45000');
const MAX_DIVERGENCE = 0.03; // if Polymarket price > 97¢ or < 3¢ pull quotes (edge risk)
const REPRICE_THRESHOLD = parseFloat(process.env.REPRICE_THRESHOLD || '0.12'); // 12% — only requote when mispriced by more than this

// Map question keywords → Polymarket slug.
// At startup, the oracle fetches all local markets and auto-matches by keyword.
// This way, UUIDs don't need updating when you reseed.
const KEYWORD_TO_SLUG: Record<string, string> = {
  'thunder': 'will-the-oklahoma-city-thunder-win-the-2026-nba-finals',
  'celtics': 'will-the-boston-celtics-win-the-2026-nba-finals',
  'cavaliers': 'will-the-cleveland-cavaliers-win-the-2026-nba-finals',
  'brazil': 'will-brazil-win-the-2026-fifa-world-cup-183',
  'france win the 2026 fifa': 'will-france-win-the-2026-fifa-world-cup-924',
  'argentina': 'will-argentina-win-the-2026-fifa-world-cup-245',
  'england': 'will-england-win-the-2026-fifa-world-cup-937',
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

// Track the last price we quoted, so we only cancel + re-quote when divergence exceeds the threshold
const lastQuotedPrice = new Map<string, number>();

type PmPrice = { yes: number; no: number };

/**
 * Fetches current mid price from Polymarket's Gamma API.
 * Returns { yes, no } as decimals in [0, 1].
 */
async function fetchPolymarketPrice(slug: string): Promise<PmPrice | null> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
    if (!res.ok) return null;
    const data = (await res.json()) as any[];
    if (!data.length) return null;
    const market = data[0];

    // Gamma API returns outcomePrices as a JSON string array: ["0.425", "0.575"]
    // Index 0 = YES price, Index 1 = NO price
    let prices = market.outcomePrices;
    if (typeof prices === 'string') {
      prices = JSON.parse(prices);
    }
    if (!Array.isArray(prices) || prices.length < 2) return null;

    const yes = parseFloat(prices[0]);
    const no = parseFloat(prices[1]);
    if (isNaN(yes) || isNaN(no)) return null;
    return { yes, no };
  } catch (e) {
    console.error(`[oracle] Polymarket fetch failed for ${slug}:`, e);
    return null;
  }
}

async function cancelOracleOrders(marketId: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/users/${ORACLE_USER}/orders`);
    if (!res.ok) return;
    const orders = (await res.json()) as any[];
    const open = orders.filter(o => o.marketId === marketId && o.status === 'open');
    await Promise.all(open.map(o =>
      fetch(`${API_BASE}/markets/${marketId}/orders/${o.id}`, { method: 'DELETE' })
    ));
    if (open.length) console.log(`[oracle] Cancelled ${open.length} stale orders on ${marketId.slice(0,8)}`);
  } catch (e) {
    console.error('[oracle] Cancel failed:', e);
  }
}

async function placeOrder(
  marketId: string,
  side: 'buy' | 'sell',
  outcomeIndex: number,
  price: number,
  quantity: number
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/markets/${marketId}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: ORACLE_USER,
        side,
        outcomeIndex,
        price: Math.round(price * 100) / 100, // round to cent
        quantity,
        type: 'limit',
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      console.error(`[oracle] Order rejected (${side} YES@${price}):`, err.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[oracle] Place failed:', e);
    return false;
  }
}

async function requoteMarket(localMarketId: string, slug: string): Promise<void> {
  const pm = await fetchPolymarketPrice(slug);
  if (!pm) {
    console.log(`[oracle] No price for ${slug} — skipping`);
    return;
  }

  // Sanity: skip if Polymarket says market is extreme (tail risk)
  if (pm.yes < MAX_DIVERGENCE || pm.yes > 1 - MAX_DIVERGENCE) {
    console.log(`[oracle] ${slug} extreme price ${pm.yes.toFixed(2)} — pulling quotes`);
    await cancelOracleOrders(localMarketId);
    lastQuotedPrice.delete(localMarketId);
    return;
  }

  // 12% threshold: only requote if Polymarket price has diverged more than REPRICE_THRESHOLD
  // from the last price we quoted. This leaves room for arbitrageurs to trade the gap.
  const lastPrice = lastQuotedPrice.get(localMarketId);
  if (lastPrice !== undefined) {
    const divergence = Math.abs(pm.yes - lastPrice);
    if (divergence < REPRICE_THRESHOLD) {
      console.log(
        `[oracle] ${slug.slice(0, 30)}… divergence ${(divergence * 100).toFixed(1)}% < ${(REPRICE_THRESHOLD * 100).toFixed(0)}% threshold — holding quotes`
      );
      return;
    }
    console.log(
      `[oracle] ${slug.slice(0, 30)}… divergence ${(divergence * 100).toFixed(1)}% ≥ ${(REPRICE_THRESHOLD * 100).toFixed(0)}% — requoting`
    );
  }

  await cancelOracleOrders(localMarketId);

  const spread = SPREAD_CENTS / 100;
  const bidYes = Math.max(0.01, pm.yes - spread);
  const askYes = Math.min(0.99, pm.yes + spread);

  // Quote both sides on YES (outcomeIndex=0). Buying NO is equivalent to selling YES,
  // but we keep it simple and only quote the YES book for MVP.
  const bidOk = await placeOrder(localMarketId, 'buy', 0, bidYes, QUOTE_SIZE);
  const askOk = await placeOrder(localMarketId, 'sell', 0, askYes, QUOTE_SIZE);

  if (bidOk && askOk) {
    lastQuotedPrice.set(localMarketId, pm.yes);
  }

  console.log(
    `[oracle] ${slug.slice(0, 30)}… mid=${pm.yes.toFixed(2)} quoted ${bidYes.toFixed(2)}/${askYes.toFixed(2)}`
  );
}

async function tick(): Promise<void> {
  const entries = Object.entries(POLYMARKET_SLUGS);
  if (!entries.length) {
    console.log('[oracle] No markets mapped yet — edit POLYMARKET_SLUGS');
    return;
  }
  for (const [marketId, slug] of entries) {
    await requoteMarket(marketId, slug);
    // small delay between markets to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
}

async function main(): Promise<void> {
  console.log(`[oracle] Starting Polymarket oracle bot`);
  console.log(`[oracle] API=${API_BASE} user=${ORACLE_USER} size=${QUOTE_SIZE} spread=±${SPREAD_CENTS}¢ threshold=${(REPRICE_THRESHOLD * 100).toFixed(0)}%`);

  // Auto-discover local market IDs and match them to Polymarket slugs by keyword
  await buildSlugMapping();

  // Ensure oracle has a balance (seed if first run) — in prod you'd deposit real USDC
  try {
    const res = await fetch(`${API_BASE}/users/${ORACLE_USER}/balances`);
    const bal = (await res.json()) as any;
    if (bal.available < 1000) {
      console.log(`[oracle] Low balance ${bal.available}, seeding via admin endpoint`);
      await fetch(`${API_BASE}/admin/users/${ORACLE_USER}/set-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: 10000 }),
      });
    }
  } catch (e) {
    console.warn('[oracle] Could not check/seed balance — continuing');
  }

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
