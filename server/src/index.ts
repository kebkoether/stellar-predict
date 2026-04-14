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
];

// SEED_VERSION: bump this to force a re-seed even if markets exist
const SEED_VERSION = 4;

async function seedMarkets(db: Database, force = false): Promise<void> {
  const existing = db.getAllMarkets();

  // Check stored seed version — if it matches, skip even on restart
  const storedVersion = db.getMeta('seed_version');
  if (!force && storedVersion === String(SEED_VERSION) && existing.length > 0) {
    console.log(`Database has ${existing.length} markets at seed v${SEED_VERSION} — skipping`);
    return;
  }

  // Version mismatch or no markets → reseed
  const needsReseed = !force && storedVersion !== String(SEED_VERSION) && existing.length > 0;
  if (needsReseed || (force && existing.length > 0)) {
    console.log(`Re-seeding: v${storedVersion || '?'} → v${SEED_VERSION} (deleting ${existing.length} old markets, preserving balances)...`);
    db.deleteAllMarkets();
  }

  console.log(`Seeding ${DEFAULT_MARKETS.length} markets (v${SEED_VERSION})...`);
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
  }
  db.setMeta('seed_version', String(SEED_VERSION));
  console.log(`Seeded ${DEFAULT_MARKETS.length} markets (v${SEED_VERSION})`);
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
