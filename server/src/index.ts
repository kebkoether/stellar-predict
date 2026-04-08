import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config, validateConfig } from './config';
import { Database } from './db/database';
import { MatchingEngine } from './engine/matching';
import { createRouter } from './api/routes';
import { MarketWebSocketServer } from './api/websocket';
import { SettlementPipeline } from './settlement/settler';

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
