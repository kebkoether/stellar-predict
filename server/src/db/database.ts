import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { Order, Trade, Market, Position, UserBalance, Settlement } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * SQLite database layer using sql.js (WebAssembly, no native build required)
 */
export class DatabaseClient {
  private db!: SqlJsDatabase;
  private dbPath: string;
  private saveInterval: ReturnType<typeof setInterval> | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Must call init() before using the database (sql.js requires async initialization)
   */
  async init(): Promise<void> {
    const SQL = await initSqlJs();

    // Load existing database file if it exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    this.initializeSchema();

    // Auto-save to disk every 5 seconds
    this.saveInterval = setInterval(() => this.saveToDisk(), 5000);
  }

  private saveToDisk(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS markets (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        description TEXT NOT NULL,
        outcomes TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        collateral_token_code TEXT NOT NULL,
        collateral_token_issuer TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolution_time TEXT NOT NULL,
        resolved_outcome_index INTEGER,
        created_by TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        market_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        side TEXT NOT NULL,
        outcome_index INTEGER NOT NULL,
        price REAL NOT NULL,
        quantity REAL NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        filled_qty REAL NOT NULL DEFAULT 0,
        cancelled_qty REAL NOT NULL DEFAULT 0,
        rejection_reason TEXT
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_orders_market_user ON orders(market_id, user_id)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        market_id TEXT NOT NULL,
        outcome_index INTEGER NOT NULL,
        buy_order_id TEXT NOT NULL,
        sell_order_id TEXT NOT NULL,
        buy_user_id TEXT NOT NULL,
        sell_user_id TEXT NOT NULL,
        price REAL NOT NULL,
        quantity REAL NOT NULL,
        timestamp TEXT NOT NULL,
        settlement_status TEXT NOT NULL DEFAULT 'pending'
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market_id)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_trades_settlement ON trades(settlement_status)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        market_id TEXT NOT NULL,
        outcome_index INTEGER NOT NULL,
        quantity REAL NOT NULL,
        cost_basis REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, market_id, outcome_index)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS balances (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        available REAL NOT NULL DEFAULT 0,
        locked REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `);

    // Track every on-chain deposit tx hash we've credited, to prevent replay
    this.db.run(`
      CREATE TABLE IF NOT EXISTS processed_deposits (
        tx_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        processed_at TEXT NOT NULL
      )
    `);

    // Track every withdrawal request for audit + idempotency
    this.db.run(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        tx_hash TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS settlements (
        id TEXT PRIMARY KEY,
        trade_ids TEXT NOT NULL,
        transaction_hash TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        submitted_at TEXT,
        confirmed_at TEXT,
        failure_reason TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  // Helper to get a single row
  private getOne(sql: string, params: any[] = []): any | null {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      stmt.free();
      const row: any = {};
      columns.forEach((col, i) => { row[col] = values[i]; });
      return row;
    }
    stmt.free();
    return null;
  }

  // Helper to get multiple rows
  private getAll(sql: string, params: any[] = []): any[] {
    const results: any[] = [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      const row: any = {};
      columns.forEach((col, i) => { row[col] = values[i]; });
      results.push(row);
    }
    stmt.free();
    return results;
  }

  // Helper to run a statement
  private run(sql: string, params: any[] = []): void {
    this.db.run(sql, params);
  }

  /**
   * MARKETS
   */

  public createMarket(market: Market): void {
    this.run(
      `INSERT INTO markets (
        id, question, description, outcomes, status,
        collateral_token_code, collateral_token_issuer,
        created_at, resolution_time, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        market.id,
        market.question,
        market.description,
        JSON.stringify(market.outcomes),
        market.status,
        market.collateralToken.code,
        market.collateralToken.issuer,
        market.createdAt.toISOString(),
        market.resolutionTime.toISOString(),
        market.createdBy,
      ]
    );
  }

  public getMarket(marketId: string): Market | null {
    const row = this.getOne('SELECT * FROM markets WHERE id = ?', [marketId]);
    if (!row) return null;
    return this.rowToMarket(row);
  }

  public getAllMarkets(): Market[] {
    const rows = this.getAll('SELECT * FROM markets ORDER BY created_at DESC');
    return rows.map((row) => this.rowToMarket(row));
  }

  public updateMarketStatus(marketId: string, status: string, resolvedOutcomeIndex?: number): void {
    this.run(
      'UPDATE markets SET status = ?, resolved_outcome_index = ? WHERE id = ?',
      [status, resolvedOutcomeIndex ?? null, marketId]
    );
  }

  private rowToMarket(row: any): Market {
    return {
      id: row.id,
      question: row.question,
      description: row.description,
      outcomes: JSON.parse(row.outcomes),
      status: row.status,
      collateralToken: {
        code: row.collateral_token_code,
        issuer: row.collateral_token_issuer,
      },
      createdAt: new Date(row.created_at),
      resolutionTime: new Date(row.resolution_time),
      resolvedOutcomeIndex: row.resolved_outcome_index,
      createdBy: row.created_by,
    };
  }

  /**
   * ORDERS
   */

  public createOrder(order: Order): void {
    this.run(
      `INSERT INTO orders (
        id, market_id, user_id, side, outcome_index, price, quantity,
        type, status, created_at, updated_at, filled_qty, cancelled_qty,
        rejection_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order.id,
        order.marketId,
        order.userId,
        order.side,
        order.outcomeIndex,
        order.price,
        order.quantity,
        order.type,
        order.status,
        order.createdAt.toISOString(),
        order.updatedAt.toISOString(),
        order.filledQty,
        order.cancelledQty,
        order.rejectionReason ?? null,
      ]
    );
  }

  public getOrder(orderId: string): Order | null {
    const row = this.getOne('SELECT * FROM orders WHERE id = ?', [orderId]);
    return row ? this.rowToOrder(row) : null;
  }

  public getUserOrders(userId: string): Order[] {
    const rows = this.getAll(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map((row) => this.rowToOrder(row));
  }

  public getOpenOrdersForMarket(marketId: string): Order[] {
    const rows = this.getAll(
      "SELECT * FROM orders WHERE market_id = ? AND status IN ('open', 'partially_filled') ORDER BY created_at DESC",
      [marketId]
    );
    return rows.map((row) => this.rowToOrder(row));
  }

  public updateOrder(order: Order): void {
    this.run(
      `UPDATE orders
       SET market_id = ?, user_id = ?, side = ?, outcome_index = ?, price = ?,
           quantity = ?, type = ?, status = ?, updated_at = ?, filled_qty = ?,
           cancelled_qty = ?, rejection_reason = ?
       WHERE id = ?`,
      [
        order.marketId,
        order.userId,
        order.side,
        order.outcomeIndex,
        order.price,
        order.quantity,
        order.type,
        order.status,
        order.updatedAt.toISOString(),
        order.filledQty,
        order.cancelledQty,
        order.rejectionReason ?? null,
        order.id,
      ]
    );
  }

  private rowToOrder(row: any): Order {
    return {
      id: row.id,
      marketId: row.market_id,
      userId: row.user_id,
      side: row.side,
      outcomeIndex: row.outcome_index,
      price: row.price,
      quantity: row.quantity,
      type: row.type,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      filledQty: row.filled_qty,
      cancelledQty: row.cancelled_qty,
      rejectionReason: row.rejection_reason,
    };
  }

  /**
   * TRADES
   */

  public createTrade(trade: Trade): void {
    this.run(
      `INSERT INTO trades (
        id, market_id, outcome_index, buy_order_id, sell_order_id,
        buy_user_id, sell_user_id, price, quantity, timestamp, settlement_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trade.id,
        trade.marketId,
        trade.outcomeIndex,
        trade.buyOrderId,
        trade.sellOrderId,
        trade.buyUserId,
        trade.sellUserId,
        trade.price,
        trade.quantity,
        trade.timestamp.toISOString(),
        trade.settlementStatus,
      ]
    );
  }

  public getTrade(tradeId: string): Trade | null {
    const row = this.getOne('SELECT * FROM trades WHERE id = ?', [tradeId]);
    return row ? this.rowToTrade(row) : null;
  }

  public getMarketTrades(marketId: string, limit: number = 100): Trade[] {
    const rows = this.getAll(
      'SELECT * FROM trades WHERE market_id = ? ORDER BY timestamp DESC LIMIT ?',
      [marketId, limit]
    );
    return rows.map((row) => this.rowToTrade(row));
  }

  public getUnsettledTrades(): Trade[] {
    const rows = this.getAll(
      "SELECT * FROM trades WHERE settlement_status = 'pending' ORDER BY timestamp ASC"
    );
    return rows.map((row) => this.rowToTrade(row));
  }

  public updateTradeSettlement(tradeId: string, status: string): void {
    this.run('UPDATE trades SET settlement_status = ? WHERE id = ?', [status, tradeId]);
  }

  private rowToTrade(row: any): Trade {
    return {
      id: row.id,
      marketId: row.market_id,
      outcomeIndex: row.outcome_index,
      buyOrderId: row.buy_order_id,
      sellOrderId: row.sell_order_id,
      buyUserId: row.buy_user_id,
      sellUserId: row.sell_user_id,
      price: row.price,
      quantity: row.quantity,
      timestamp: new Date(row.timestamp),
      settlementStatus: row.settlement_status,
    };
  }

  /**
   * POSITIONS
   */

  public getPosition(userId: string, marketId: string, outcomeIndex: number): Position | null {
    const row = this.getOne(
      'SELECT * FROM positions WHERE user_id = ? AND market_id = ? AND outcome_index = ?',
      [userId, marketId, outcomeIndex]
    );
    if (!row) return null;
    return this.rowToPosition(row);
  }

  public getUserPositions(userId: string): Position[] {
    const rows = this.getAll(
      'SELECT * FROM positions WHERE user_id = ? ORDER BY updated_at DESC',
      [userId]
    );
    return rows.map((row) => this.rowToPosition(row));
  }

  public getMarketPositions(marketId: string): Position[] {
    const rows = this.getAll(
      'SELECT * FROM positions WHERE market_id = ? ORDER BY user_id',
      [marketId]
    );
    return rows.map((row) => this.rowToPosition(row));
  }

  public updateOrCreatePosition(
    userId: string,
    marketId: string,
    outcomeIndex: number,
    delta: { quantity: number; costBasis: number }
  ): void {
    const existing = this.getPosition(userId, marketId, outcomeIndex);

    if (existing) {
      this.run(
        `UPDATE positions
         SET quantity = quantity + ?, cost_basis = cost_basis + ?, updated_at = ?
         WHERE user_id = ? AND market_id = ? AND outcome_index = ?`,
        [delta.quantity, delta.costBasis, new Date().toISOString(), userId, marketId, outcomeIndex]
      );
    } else {
      this.run(
        `INSERT INTO positions (id, user_id, market_id, outcome_index, quantity, cost_basis, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(), userId, marketId, outcomeIndex,
          delta.quantity, delta.costBasis,
          new Date().toISOString(), new Date().toISOString(),
        ]
      );
    }
  }

  private rowToPosition(row: any): Position {
    return {
      id: row.id,
      userId: row.user_id,
      marketId: row.market_id,
      outcomeIndex: row.outcome_index,
      quantity: row.quantity,
      costBasis: row.cost_basis,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * BALANCES
   */

  public getUserBalance(userId: string): UserBalance | null {
    const row = this.getOne('SELECT * FROM balances WHERE user_id = ?', [userId]);
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      available: row.available,
      locked: row.locked,
      total: row.available + row.locked,
      updatedAt: new Date(row.updated_at),
    };
  }

  public createUserBalance(userId: string, available: number = 0): UserBalance {
    const id = uuidv4();
    const now = new Date();
    this.run(
      'INSERT INTO balances (id, user_id, available, locked, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, userId, available, 0, now.toISOString()]
    );
    return { id, userId, available, locked: 0, total: available, updatedAt: now };
  }

  public updateUserBalance(userId: string, update: { available?: number; locked?: number }): void {
    const current = this.getUserBalance(userId);
    if (!current) {
      this.createUserBalance(userId, update.available ?? 0);
      return;
    }
    this.run(
      'UPDATE balances SET available = ?, locked = ?, updated_at = ? WHERE user_id = ?',
      [
        update.available ?? current.available,
        update.locked ?? current.locked,
        new Date().toISOString(),
        userId,
      ]
    );
  }

  /**
   * SETTLEMENTS
   */

  public createSettlement(settlement: Settlement): void {
    this.run(
      `INSERT INTO settlements (
        id, trade_ids, transaction_hash, status, created_at, submitted_at,
        confirmed_at, failure_reason, retry_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        settlement.id,
        JSON.stringify(settlement.tradeIds),
        settlement.transactionHash ?? null,
        settlement.status,
        settlement.createdAt.toISOString(),
        settlement.submittedAt?.toISOString() ?? null,
        settlement.confirmedAt?.toISOString() ?? null,
        settlement.failureReason ?? null,
        settlement.retryCount,
      ]
    );
  }

  public getSettlement(settlementId: string): Settlement | null {
    const row = this.getOne('SELECT * FROM settlements WHERE id = ?', [settlementId]);
    if (!row) return null;
    return this.rowToSettlement(row);
  }

  public updateSettlement(settlement: Settlement): void {
    this.run(
      `UPDATE settlements
       SET transaction_hash = ?, status = ?, submitted_at = ?, confirmed_at = ?,
           failure_reason = ?, retry_count = ?
       WHERE id = ?`,
      [
        settlement.transactionHash ?? null,
        settlement.status,
        settlement.submittedAt?.toISOString() ?? null,
        settlement.confirmedAt?.toISOString() ?? null,
        settlement.failureReason ?? null,
        settlement.retryCount,
        settlement.id,
      ]
    );
  }

  public getPendingSettlements(): Settlement[] {
    const rows = this.getAll(
      "SELECT * FROM settlements WHERE status IN ('pending', 'retrying') ORDER BY created_at ASC"
    );
    return rows.map((row) => this.rowToSettlement(row));
  }

  private rowToSettlement(row: any): Settlement {
    return {
      id: row.id,
      tradeIds: JSON.parse(row.trade_ids),
      transactionHash: row.transaction_hash,
      status: row.status,
      createdAt: new Date(row.created_at),
      submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
      confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
      failureReason: row.failure_reason,
      retryCount: row.retry_count,
    };
  }

  /**
   * Leaderboard: get all users with their balance and trading stats.
   * Returns users sorted by total P&L (realized gains from resolved markets).
   */
  public getLeaderboard(): Array<{
    userId: string;
    available: number;
    locked: number;
    totalDeposited: number;
    totalPnl: number;
    marketsTraded: number;
    marketsWon: number;
  }> {
    // Get all balances
    const balances = this.getAll('SELECT * FROM balances ORDER BY available DESC');

    return balances.map((bal: any) => {
      const userId = bal.user_id;

      // Get all positions for this user
      const positions = this.getAll(
        'SELECT p.*, m.status as market_status, m.resolved_outcome_index FROM positions p JOIN markets m ON p.market_id = m.id WHERE p.user_id = ?',
        [userId]
      );

      let totalPnl = 0;
      let marketsTraded = new Set<string>();
      let marketsWon = 0;

      for (const pos of positions) {
        if (pos.quantity <= 0) continue;
        marketsTraded.add(pos.market_id);

        if (pos.market_status === 'resolved' && pos.resolved_outcome_index !== null) {
          const won = pos.outcome_index === pos.resolved_outcome_index;
          const payout = won ? pos.quantity : 0;
          totalPnl += payout - pos.cost_basis;
          if (won) marketsWon++;
        }
      }

      // Total deposited = available + locked + sum of all cost_basis in active positions
      // (money "in the market" is neither available nor locked)
      const activePositionCost = positions
        .filter((p: any) => p.market_status !== 'resolved' && p.quantity > 0)
        .reduce((sum: number, p: any) => sum + p.cost_basis, 0);

      const totalDeposited = bal.available + bal.locked + activePositionCost +
        positions
          .filter((p: any) => p.market_status === 'resolved' && p.quantity > 0)
          .reduce((sum: number, p: any) => sum + p.cost_basis, 0);

      return {
        userId,
        available: bal.available,
        locked: bal.locked,
        totalDeposited,
        totalPnl,
        marketsTraded: marketsTraded.size,
        marketsWon,
      };
    }).sort((a, b) => b.totalPnl - a.totalPnl);
  }

  /**
   * Utility methods
   */

  /**
   * Deposit replay protection
   */
  public isDepositProcessed(txHash: string): boolean {
    return this.getOne('SELECT tx_hash FROM processed_deposits WHERE tx_hash = ?', [txHash]) !== null;
  }

  public recordProcessedDeposit(txHash: string, userId: string, amount: number): void {
    this.run(
      'INSERT OR IGNORE INTO processed_deposits (tx_hash, user_id, amount, processed_at) VALUES (?, ?, ?, ?)',
      [txHash, userId, amount, new Date().toISOString()]
    );
  }

  /**
   * Withdrawal audit log
   */
  public recordWithdrawal(id: string, userId: string, amount: number, status: string, txHash?: string): void {
    this.run(
      'INSERT OR REPLACE INTO withdrawals (id, user_id, amount, tx_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, userId, amount, txHash || null, status, new Date().toISOString()]
    );
  }

  public getRecentWithdrawals(limit: number = 50): any[] {
    return this.getAll('SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  public getRecentDeposits(limit: number = 50): any[] {
    return this.getAll('SELECT * FROM processed_deposits ORDER BY processed_at DESC LIMIT ?', [limit]);
  }

  /**
   * Accounting invariants — returns internal totals for solvency check
   */
  public getAccountingTotals(): {
    totalAvailable: number;
    totalLocked: number;
    totalActivePositionCost: number;
    totalLiabilities: number;
    userCount: number;
    marketCount: number;
    openMarkets: number;
  } {
    const balances = this.getAll('SELECT * FROM balances');
    const totalAvailable = balances.reduce((s: number, b: any) => s + (b.available || 0), 0);
    const totalLocked = balances.reduce((s: number, b: any) => s + (b.locked || 0), 0);

    // Collateral still locked in open markets = sum of costBasis on live positions
    const activePositions = this.getAll(
      `SELECT p.cost_basis, p.quantity FROM positions p
       JOIN markets m ON p.market_id = m.id
       WHERE m.status = 'open' AND p.quantity > 0`
    );
    const totalActivePositionCost = activePositions.reduce(
      (s: number, p: any) => s + (p.cost_basis || 0), 0
    );

    const totalLiabilities = totalAvailable + totalLocked + totalActivePositionCost;

    const marketCountRow = this.getOne('SELECT COUNT(*) as c FROM markets');
    const openMarketsRow = this.getOne("SELECT COUNT(*) as c FROM markets WHERE status = 'open'");

    return {
      totalAvailable,
      totalLocked,
      totalActivePositionCost,
      totalLiabilities,
      userCount: balances.length,
      marketCount: marketCountRow?.c || 0,
      openMarkets: openMarketsRow?.c || 0,
    };
  }

  public close(): void {
    this.saveToDisk();
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    this.db.close();
  }

  public transaction<T>(fn: () => T): T {
    this.db.run('BEGIN TRANSACTION');
    try {
      const result = fn();
      this.db.run('COMMIT');
      return result;
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
  }
}

export { DatabaseClient as Database };
