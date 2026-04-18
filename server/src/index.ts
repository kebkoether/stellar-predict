import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { config, validateConfig } from './config';
import { Database } from './db/database';
import { MatchingEngine } from './engine/matching';
import { createRouter } from './api/routes';
import { MarketWebSocketServer } from './api/websocket';
import { SettlementPipeline } from './settlement/settler';

// ── Seed markets: top Polymarket-style markets ──

const DEFAULT_MARKETS: Array<{
  question: string; description: string; resolutionTime: string; category?: string;
  eventId?: string; eventTitle?: string;
}> = [
  // Only mutually exclusive event groups — each has exactly one winner.
  // All outcomes within an event sum to $1.00.
  // Oracle feeds from Polymarket for named outcomes; "any other" gets the residual.

  // ── Sports: NBA Champion 2026 (4 outcomes) ──
  { question: 'Will the Thunder win the 2026 NBA Championship?', description: 'Resolves YES if OKC Thunder win the 2026 NBA Finals.', resolutionTime: '2026-06-30T00:00:00Z', category: 'Sports', eventId: 'nba-champ-2026', eventTitle: '2026 NBA Champion' },
  { question: 'Will the Celtics win the 2026 NBA Championship?', description: 'Resolves YES if Boston Celtics win the 2026 NBA Finals.', resolutionTime: '2026-06-30T00:00:00Z', category: 'Sports', eventId: 'nba-champ-2026', eventTitle: '2026 NBA Champion' },
  { question: 'Will the Cavaliers win the 2026 NBA Championship?', description: 'Resolves YES if Cleveland Cavaliers win the 2026 NBA Finals.', resolutionTime: '2026-06-30T00:00:00Z', category: 'Sports', eventId: 'nba-champ-2026', eventTitle: '2026 NBA Champion' },
  { question: 'Will any other team win the 2026 NBA Championship?', description: 'Resolves YES if any team other than Thunder, Celtics, or Cavaliers wins.', resolutionTime: '2026-06-30T00:00:00Z', category: 'Sports', eventId: 'nba-champ-2026', eventTitle: '2026 NBA Champion' },

  // ── Sports: FIFA World Cup 2026 (5 outcomes) ──
  { question: 'Will Brazil win the 2026 FIFA World Cup?', description: 'Resolves YES if Brazil wins the 2026 FIFA World Cup final.', resolutionTime: '2026-07-20T00:00:00Z', category: 'Sports', eventId: 'wc-2026', eventTitle: '2026 FIFA World Cup Winner' },
  { question: 'Will France win the 2026 FIFA World Cup?', description: 'Resolves YES if France wins the 2026 FIFA World Cup final.', resolutionTime: '2026-07-20T00:00:00Z', category: 'Sports', eventId: 'wc-2026', eventTitle: '2026 FIFA World Cup Winner' },
  { question: 'Will Argentina win the 2026 FIFA World Cup?', description: 'Resolves YES if Argentina wins the 2026 FIFA World Cup final.', resolutionTime: '2026-07-20T00:00:00Z', category: 'Sports', eventId: 'wc-2026', eventTitle: '2026 FIFA World Cup Winner' },
  { question: 'Will England win the 2026 FIFA World Cup?', description: 'Resolves YES if England wins the 2026 FIFA World Cup final.', resolutionTime: '2026-07-20T00:00:00Z', category: 'Sports', eventId: 'wc-2026', eventTitle: '2026 FIFA World Cup Winner' },
  { question: 'Will any other team win the 2026 FIFA World Cup?', description: 'Resolves YES if any team not listed above wins the 2026 FIFA World Cup.', resolutionTime: '2026-07-20T00:00:00Z', category: 'Sports', eventId: 'wc-2026', eventTitle: '2026 FIFA World Cup Winner' },

  // ── Politics: 2028 US Presidential Election (6 outcomes) ──
  { question: 'Will JD Vance win the 2028 US Presidential Election?', description: 'Resolves YES if JD Vance wins the 2028 US presidential election.', resolutionTime: '2028-11-10T00:00:00Z', category: 'Politics', eventId: 'us-pres-2028', eventTitle: '2028 US Presidential Election' },
  { question: 'Will Gavin Newsom win the 2028 US Presidential Election?', description: 'Resolves YES if Gavin Newsom wins the 2028 US presidential election.', resolutionTime: '2028-11-10T00:00:00Z', category: 'Politics', eventId: 'us-pres-2028', eventTitle: '2028 US Presidential Election' },
  { question: 'Will Alexandria Ocasio-Cortez win the 2028 US Presidential Election?', description: 'Resolves YES if AOC wins the 2028 US presidential election.', resolutionTime: '2028-11-10T00:00:00Z', category: 'Politics', eventId: 'us-pres-2028', eventTitle: '2028 US Presidential Election' },
  { question: 'Will Kamala Harris win the 2028 US Presidential Election?', description: 'Resolves YES if Kamala Harris wins the 2028 US presidential election.', resolutionTime: '2028-11-10T00:00:00Z', category: 'Politics', eventId: 'us-pres-2028', eventTitle: '2028 US Presidential Election' },
  { question: 'Will Tucker Carlson win the 2028 US Presidential Election?', description: 'Resolves YES if Tucker Carlson wins the 2028 US presidential election.', resolutionTime: '2028-11-10T00:00:00Z', category: 'Politics', eventId: 'us-pres-2028', eventTitle: '2028 US Presidential Election' },
  { question: 'Will any other candidate win the 2028 US Presidential Election?', description: 'Resolves YES if any candidate not listed above wins the 2028 US presidential election.', resolutionTime: '2028-11-10T00:00:00Z', category: 'Politics', eventId: 'us-pres-2028', eventTitle: '2028 US Presidential Election' },

  // ── Politics: 2026 Peru Presidential Election (4 outcomes) ──
  { question: 'Will Keiko Fujimori win the 2026 Peruvian Presidential Election?', description: 'Resolves YES if Keiko Fujimori wins the 2026 Peru presidential election.', resolutionTime: '2026-07-28T00:00:00Z', category: 'Politics', eventId: 'peru-pres-2026', eventTitle: '2026 Peru Presidential Election' },
  { question: 'Will Roberto Sánchez Palomino win the 2026 Peruvian Presidential Election?', description: 'Resolves YES if Roberto Sánchez Palomino wins the 2026 Peru presidential election.', resolutionTime: '2026-07-28T00:00:00Z', category: 'Politics', eventId: 'peru-pres-2026', eventTitle: '2026 Peru Presidential Election' },
  { question: 'Will Jorge Nieto win the 2026 Peruvian Presidential Election?', description: 'Resolves YES if Jorge Nieto wins the 2026 Peru presidential election.', resolutionTime: '2026-07-28T00:00:00Z', category: 'Politics', eventId: 'peru-pres-2026', eventTitle: '2026 Peru Presidential Election' },
  { question: 'Will any other candidate win the 2026 Peruvian Presidential Election?', description: 'Resolves YES if any candidate not listed above wins the 2026 Peru presidential election.', resolutionTime: '2026-07-28T00:00:00Z', category: 'Politics', eventId: 'peru-pres-2026', eventTitle: '2026 Peru Presidential Election' },

  // ── Entertainment: Eurovision 2026 (5 outcomes) ──
  { question: 'Will France win Eurovision 2026?', description: 'Resolves YES if France wins the 2026 Eurovision Song Contest.', resolutionTime: '2026-05-24T00:00:00Z', category: 'Entertainment', eventId: 'eurovision-2026', eventTitle: 'Eurovision 2026 Winner' },
  { question: 'Will Israel win Eurovision 2026?', description: 'Resolves YES if Israel wins the 2026 Eurovision Song Contest.', resolutionTime: '2026-05-24T00:00:00Z', category: 'Entertainment', eventId: 'eurovision-2026', eventTitle: 'Eurovision 2026 Winner' },
  { question: 'Will Sweden win Eurovision 2026?', description: 'Resolves YES if Sweden wins the 2026 Eurovision Song Contest.', resolutionTime: '2026-05-24T00:00:00Z', category: 'Entertainment', eventId: 'eurovision-2026', eventTitle: 'Eurovision 2026 Winner' },
  { question: 'Will Italy win Eurovision 2026?', description: 'Resolves YES if Italy wins the 2026 Eurovision Song Contest.', resolutionTime: '2026-05-24T00:00:00Z', category: 'Entertainment', eventId: 'eurovision-2026', eventTitle: 'Eurovision 2026 Winner' },
  { question: 'Will any other country win Eurovision 2026?', description: 'Resolves YES if any country not listed above wins Eurovision 2026.', resolutionTime: '2026-05-24T00:00:00Z', category: 'Entertainment', eventId: 'eurovision-2026', eventTitle: 'Eurovision 2026 Winner' },

  // ── Sports: Men's Wimbledon 2026 (4 outcomes) ──
  { question: 'Will Jannik Sinner win 2026 Men\'s Wimbledon?', description: 'Resolves YES if Jannik Sinner wins the 2026 Wimbledon Men\'s Singles title.', resolutionTime: '2026-07-13T00:00:00Z', category: 'Sports', eventId: 'wimbledon-mens-2026', eventTitle: '2026 Men\'s Wimbledon Champion' },
  { question: 'Will Carlos Alcaraz win 2026 Men\'s Wimbledon?', description: 'Resolves YES if Carlos Alcaraz wins the 2026 Wimbledon Men\'s Singles title.', resolutionTime: '2026-07-13T00:00:00Z', category: 'Sports', eventId: 'wimbledon-mens-2026', eventTitle: '2026 Men\'s Wimbledon Champion' },
  { question: 'Will Novak Djokovic win 2026 Men\'s Wimbledon?', description: 'Resolves YES if Novak Djokovic wins the 2026 Wimbledon Men\'s Singles title.', resolutionTime: '2026-07-13T00:00:00Z', category: 'Sports', eventId: 'wimbledon-mens-2026', eventTitle: '2026 Men\'s Wimbledon Champion' },
  { question: 'Will any other player win 2026 Men\'s Wimbledon?', description: 'Resolves YES if any player not listed above wins Men\'s Wimbledon 2026.', resolutionTime: '2026-07-13T00:00:00Z', category: 'Sports', eventId: 'wimbledon-mens-2026', eventTitle: '2026 Men\'s Wimbledon Champion' },

  // ── Sports: Women's Wimbledon 2026 (4 outcomes) ──
  { question: 'Will Aryna Sabalenka win 2026 Women\'s Wimbledon?', description: 'Resolves YES if Aryna Sabalenka wins the 2026 Wimbledon Women\'s Singles title.', resolutionTime: '2026-07-12T00:00:00Z', category: 'Sports', eventId: 'wimbledon-womens-2026', eventTitle: '2026 Women\'s Wimbledon Champion' },
  { question: 'Will Amanda Anisimova win 2026 Women\'s Wimbledon?', description: 'Resolves YES if Amanda Anisimova wins the 2026 Wimbledon Women\'s Singles title.', resolutionTime: '2026-07-12T00:00:00Z', category: 'Sports', eventId: 'wimbledon-womens-2026', eventTitle: '2026 Women\'s Wimbledon Champion' },
  { question: 'Will Coco Gauff win 2026 Women\'s Wimbledon?', description: 'Resolves YES if Coco Gauff wins the 2026 Wimbledon Women\'s Singles title.', resolutionTime: '2026-07-12T00:00:00Z', category: 'Sports', eventId: 'wimbledon-womens-2026', eventTitle: '2026 Women\'s Wimbledon Champion' },
  { question: 'Will any other player win 2026 Women\'s Wimbledon?', description: 'Resolves YES if any player not listed above wins Women\'s Wimbledon 2026.', resolutionTime: '2026-07-12T00:00:00Z', category: 'Sports', eventId: 'wimbledon-womens-2026', eventTitle: '2026 Women\'s Wimbledon Champion' },

  // ── Sports: 2026 World Series (5 outcomes) ──
  { question: 'Will the Dodgers win the 2026 World Series?', description: 'Resolves YES if the Los Angeles Dodgers win the 2026 MLB World Series.', resolutionTime: '2026-11-01T00:00:00Z', category: 'Sports', eventId: 'world-series-2026', eventTitle: '2026 World Series Champion' },
  { question: 'Will the Yankees win the 2026 World Series?', description: 'Resolves YES if the New York Yankees win the 2026 MLB World Series.', resolutionTime: '2026-11-01T00:00:00Z', category: 'Sports', eventId: 'world-series-2026', eventTitle: '2026 World Series Champion' },
  { question: 'Will the Braves win the 2026 World Series?', description: 'Resolves YES if the Atlanta Braves win the 2026 MLB World Series.', resolutionTime: '2026-11-01T00:00:00Z', category: 'Sports', eventId: 'world-series-2026', eventTitle: '2026 World Series Champion' },
  { question: 'Will the Mets win the 2026 World Series?', description: 'Resolves YES if the New York Mets win the 2026 MLB World Series.', resolutionTime: '2026-11-01T00:00:00Z', category: 'Sports', eventId: 'world-series-2026', eventTitle: '2026 World Series Champion' },
  { question: 'Will any other team win the 2026 World Series?', description: 'Resolves YES if any team not listed above wins the 2026 World Series.', resolutionTime: '2026-11-01T00:00:00Z', category: 'Sports', eventId: 'world-series-2026', eventTitle: '2026 World Series Champion' },

  // ── Politics: Next Prime Minister of Hungary (3 outcomes) ──
  { question: 'Will Péter Magyar become the next PM of Hungary?', description: 'Resolves YES if Péter Magyar becomes the next Prime Minister of Hungary.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Politics', eventId: 'hungary-pm', eventTitle: 'Next Prime Minister of Hungary' },
  { question: 'Will Viktor Orbán remain PM of Hungary?', description: 'Resolves YES if Viktor Orbán continues as Prime Minister of Hungary through the next government formation.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Politics', eventId: 'hungary-pm', eventTitle: 'Next Prime Minister of Hungary' },
  { question: 'Will someone else become the next PM of Hungary?', description: 'Resolves YES if someone other than Magyar or Orbán becomes PM.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Politics', eventId: 'hungary-pm', eventTitle: 'Next Prime Minister of Hungary' },

  // ── Tech: Who Acquires TikTok? (4 outcomes) ──
  { question: 'Will Microsoft acquire TikTok?', description: 'Resolves YES if Microsoft completes an acquisition of TikTok US operations.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Tech', eventId: 'tiktok-acquirer', eventTitle: 'TikTok Acquisition' },
  { question: 'Will Oracle acquire TikTok?', description: 'Resolves YES if Oracle completes an acquisition of TikTok US operations.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Tech', eventId: 'tiktok-acquirer', eventTitle: 'TikTok Acquisition' },
  { question: 'Will Amazon acquire TikTok?', description: 'Resolves YES if Amazon completes an acquisition of TikTok US operations.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Tech', eventId: 'tiktok-acquirer', eventTitle: 'TikTok Acquisition' },
  { question: 'Will TikTok be acquired by another company or not sold?', description: 'Resolves YES if TikTok is acquired by a company not listed above, or not sold at all.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Tech', eventId: 'tiktok-acquirer', eventTitle: 'TikTok Acquisition' },

  // ── Sports: 2026 FIFA — extra teams for depth (expand existing event) ──
  { question: 'Will Spain win the 2026 FIFA World Cup?', description: 'Resolves YES if Spain wins the 2026 FIFA World Cup final.', resolutionTime: '2026-07-20T00:00:00Z', category: 'Sports', eventId: 'wc-2026', eventTitle: '2026 FIFA World Cup Winner' },

  // ── Tech: First Company to $5T Market Cap (4 outcomes) ──
  { question: 'Will Apple be the first company to reach $5T market cap?', description: 'Resolves YES if Apple is the first publicly traded company to reach a $5 trillion market cap.', resolutionTime: '2027-12-31T00:00:00Z', category: 'Tech', eventId: 'first-5t-company', eventTitle: 'First Company to $5T Market Cap' },
  { question: 'Will NVIDIA be the first company to reach $5T market cap?', description: 'Resolves YES if NVIDIA is the first publicly traded company to reach a $5 trillion market cap.', resolutionTime: '2027-12-31T00:00:00Z', category: 'Tech', eventId: 'first-5t-company', eventTitle: 'First Company to $5T Market Cap' },
  { question: 'Will Microsoft be the first company to reach $5T market cap?', description: 'Resolves YES if Microsoft is the first publicly traded company to reach a $5 trillion market cap.', resolutionTime: '2027-12-31T00:00:00Z', category: 'Tech', eventId: 'first-5t-company', eventTitle: 'First Company to $5T Market Cap' },
  { question: 'Will any other company reach $5T market cap first?', description: 'Resolves YES if a company other than Apple, NVIDIA, or Microsoft is the first to $5T.', resolutionTime: '2027-12-31T00:00:00Z', category: 'Tech', eventId: 'first-5t-company', eventTitle: 'First Company to $5T Market Cap' },

  // ── AI: First to AGI (4 outcomes) ──
  { question: 'Will OpenAI achieve AGI first?', description: 'Resolves YES if OpenAI is widely recognized as the first to achieve artificial general intelligence by credible AI researchers.', resolutionTime: '2030-12-31T00:00:00Z', category: 'Tech', eventId: 'first-agi', eventTitle: 'First to Achieve AGI' },
  { question: 'Will Google DeepMind achieve AGI first?', description: 'Resolves YES if Google DeepMind is widely recognized as the first to achieve AGI.', resolutionTime: '2030-12-31T00:00:00Z', category: 'Tech', eventId: 'first-agi', eventTitle: 'First to Achieve AGI' },
  { question: 'Will Anthropic achieve AGI first?', description: 'Resolves YES if Anthropic is widely recognized as the first to achieve AGI.', resolutionTime: '2030-12-31T00:00:00Z', category: 'Tech', eventId: 'first-agi', eventTitle: 'First to Achieve AGI' },
  { question: 'Will no company achieve AGI before 2030?', description: 'Resolves YES if no company achieves AGI by Dec 31, 2030 as judged by expert consensus.', resolutionTime: '2030-12-31T00:00:00Z', category: 'Tech', eventId: 'first-agi', eventTitle: 'First to Achieve AGI' },

  // ── Crypto: Bitcoin Year-End Price (4 outcomes) ──
  { question: 'Will Bitcoin be above $150K on Dec 31, 2026?', description: 'Resolves YES if Bitcoin price exceeds $150,000 on any major exchange at any point on Dec 31, 2026.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Crypto', eventId: 'btc-eoy-2026', eventTitle: 'Bitcoin Year-End 2026 Price' },
  { question: 'Will Bitcoin be between $100K-$150K on Dec 31, 2026?', description: 'Resolves YES if Bitcoin price is between $100,000 and $150,000 at midnight UTC Dec 31, 2026.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Crypto', eventId: 'btc-eoy-2026', eventTitle: 'Bitcoin Year-End 2026 Price' },
  { question: 'Will Bitcoin be between $50K-$100K on Dec 31, 2026?', description: 'Resolves YES if Bitcoin price is between $50,000 and $100,000 at midnight UTC Dec 31, 2026.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Crypto', eventId: 'btc-eoy-2026', eventTitle: 'Bitcoin Year-End 2026 Price' },
  { question: 'Will Bitcoin be below $50K on Dec 31, 2026?', description: 'Resolves YES if Bitcoin price is below $50,000 at midnight UTC Dec 31, 2026.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Crypto', eventId: 'btc-eoy-2026', eventTitle: 'Bitcoin Year-End 2026 Price' },

  // ── Economy: Fed Rate Cuts 2026 (4 outcomes) ──
  { question: 'Will the Fed cut rates 3+ times in 2026?', description: 'Resolves YES if the Federal Reserve cuts the federal funds rate 3 or more times during 2026.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Economy', eventId: 'fed-cuts-2026', eventTitle: '2026 Fed Rate Cuts' },
  { question: 'Will the Fed cut rates exactly 2 times in 2026?', description: 'Resolves YES if the Federal Reserve cuts rates exactly twice during 2026.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Economy', eventId: 'fed-cuts-2026', eventTitle: '2026 Fed Rate Cuts' },
  { question: 'Will the Fed cut rates exactly 1 time in 2026?', description: 'Resolves YES if the Federal Reserve cuts rates exactly once during 2026.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Economy', eventId: 'fed-cuts-2026', eventTitle: '2026 Fed Rate Cuts' },
  { question: 'Will the Fed hold or raise rates in 2026?', description: 'Resolves YES if the Federal Reserve does not cut rates at all during 2026.', resolutionTime: '2026-12-31T00:00:00Z', category: 'Economy', eventId: 'fed-cuts-2026', eventTitle: '2026 Fed Rate Cuts' },
];

// SEED_VERSION: bump this number to force a FULL re-seed (deletes all markets,
// orders, positions, and trades — but preserves user balances).
// Normal deploys (same version) only add missing markets and never touch user data.
const SEED_VERSION = 5;

async function seedMarkets(db: Database, force = false): Promise<void> {
  const existing = db.getAllMarkets();
  const storedVersion = db.getMeta('seed_version');
  const versionMatch = storedVersion === String(SEED_VERSION);

  // ── Full re-seed: only when version is explicitly bumped or forced ──
  if (force || (!versionMatch && storedVersion !== null)) {
    console.log(`🔄 Full re-seed: v${storedVersion || '?'} → v${SEED_VERSION}`);
    console.log(`   Deleting ${existing.length} markets + orders/trades/positions...`);
    console.log(`   ⚠️  User balances are PRESERVED.`);
    db.deleteAllMarkets();
    // Also clean up orphaned orders, trades, positions tied to old markets
    db.run('DELETE FROM orders');
    db.run('DELETE FROM trades');
    db.run('DELETE FROM positions');
    db.run('DELETE FROM creation_bonds');

    // Insert all markets fresh
    let count = 0;
    for (const m of DEFAULT_MARKETS) {
      db.createMarket({
        id: uuidv4(),
        question: m.question,
        description: m.description,
        outcomes: ['Yes', 'No'],
        status: 'open',
        collateralToken: {
          code: config.usdc.code,
          issuer: config.usdc.issuer,
        },
        createdAt: new Date(),
        resolutionTime: new Date(m.resolutionTime),
        createdBy: 'admin',
        category: m.category,
        eventId: m.eventId,
        eventTitle: m.eventTitle,
      });
      count++;
    }
    db.setMeta('seed_version', String(SEED_VERSION));
    console.log(`✅ Full re-seed complete: ${count} markets created (v${SEED_VERSION})`);
    return;
  }

  // ── Additive seed: same version — only insert markets that don't exist yet ──
  // Match by question text to avoid duplicates
  const existingQuestions = new Set(existing.map(m => m.question));
  let added = 0;

  for (const m of DEFAULT_MARKETS) {
    if (existingQuestions.has(m.question)) continue;

    db.createMarket({
      id: uuidv4(),
      question: m.question,
      description: m.description,
      outcomes: ['Yes', 'No'],
      status: 'open',
      collateralToken: {
        code: config.usdc.code,
        issuer: config.usdc.issuer,
      },
      createdAt: new Date(),
      resolutionTime: new Date(m.resolutionTime),
      createdBy: 'admin',
      category: m.category,
      eventId: m.eventId,
      eventTitle: m.eventTitle,
    });
    added++;
  }

  // Set version if this is a fresh DB (no stored version yet)
  if (!storedVersion) {
    db.setMeta('seed_version', String(SEED_VERSION));
  }

  if (added > 0) {
    console.log(`➕ Added ${added} new markets (${existing.length} already existed, v${SEED_VERSION})`);
  } else {
    console.log(`Database has ${existing.length} markets at v${SEED_VERSION} — nothing to add`);
  }
}

let app: Express;
let db: Database;
let matching: MatchingEngine;
let wsServer: MarketWebSocketServer;
let settler: SettlementPipeline;
let settlementInterval: NodeJS.Timeout | null = null;
let retryInterval: NodeJS.Timeout | null = null;

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  console.log('Initializing Stellar Predict Backend...');

  // Validate configuration
  validateConfig();

  // Initialize database (async for sql.js WASM loading)
  console.log(`Initializing database at ${config.database.path}`);
  db = new Database(config.database.path);
  await db.init();

  // Initialize matching engine
  matching = new MatchingEngine(db);

  // Auto-seed markets (or re-seed if version bumped)
  await seedMarkets(db);

  // Initialize settlement pipeline
  if (config.stellar.settlementKeypair) {
    settler = new SettlementPipeline(
      db,
      config.stellar.settlementKeypair,
      config.stellar.horizonUrl,
      config.stellar.network,
      config.usdc
    );
  }

  // Initialize Express app
  app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  // Routes
  app.use(createRouter(db, matching, settler));

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handling
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start HTTP server
  const httpServer = app.listen(config.server.port, () => {
    console.log(`HTTP server listening on port ${config.server.port}`);
  });

  // Initialize WebSocket server
  // In production: attach to HTTP server (single port for Railway/Render)
  // In development: use separate port
  if (config.server.env === 'production') {
    wsServer = new MarketWebSocketServer(httpServer);
  } else {
    wsServer = new MarketWebSocketServer(config.server.wsPort);
  }

  // Start settlement pipeline
  if (settler) {
    console.log('Starting settlement pipeline...');
    startSettlementPipeline();
  }

  console.log('Application initialized successfully');
}

/**
 * Start the settlement processing loop
 */
function startSettlementPipeline(): void {
  settlementInterval = setInterval(async () => {
    try {
      await settler.processPendingTrades();
    } catch (error) {
      console.error('Settlement processing error:', error);
    }
  }, config.settlement.processingIntervalMs);

  retryInterval = setInterval(async () => {
    try {
      await settler.retryFailedSettlements();
    } catch (error) {
      console.error('Settlement retry error:', error);
    }
  }, config.settlement.retryIntervalMs);

  console.log(
    `Settlement pipeline started: process every ${config.settlement.processingIntervalMs}ms, retry every ${config.settlement.retryIntervalMs}ms`
  );
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  console.log('Initiating graceful shutdown...');

  if (settlementInterval) clearInterval(settlementInterval);
  if (retryInterval) clearInterval(retryInterval);

  if (wsServer) {
    wsServer.close();
    console.log('WebSocket server closed');
  }

  if (db) {
    db.close();
    console.log('Database closed');
  }

  console.log('Shutdown complete');
  process.exit(0);
}

/**
 * Setup process handlers
 */
function setupProcessHandlers(): void {
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT signal');
    await shutdown();
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM signal');
    await shutdown();
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    setupProcessHandlers();
    await initialize();
  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

main();
