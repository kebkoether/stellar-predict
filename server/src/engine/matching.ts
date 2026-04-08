import { Order, Trade, MatchResult, OrderStatus } from '../types';
import { OrderBook } from './orderbook';
import { Database } from '../db/database';

/**
 * Central matching engine for all markets.
 * Manages per-market, per-outcome order books and handles order matching.
 */
export class MatchingEngine {
  private orderBooks: Map<string, OrderBook> = new Map(); // key: "marketId:outcomeIndex"
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Calculate the collateral cost for an order.
   * Buy YES at P → costs P per share (you're paying P for a token worth $1 if YES wins)
   * Sell YES at P → costs (1-P) per share (you're taking the NO side, paying 1-P)
   * Total collateral per share across both sides always = $1.00
   */
  private calcCostPerShare(side: 'buy' | 'sell', price: number): number {
    return side === 'buy' ? price : (1 - price);
  }

  /**
   * Submit an order for matching.
   * Validates balance, locks collateral, matches against book, returns result.
   *
   * KEY INSIGHT: Prediction markets are zero-sum.
   * When a trade executes at price P:
   *   - Buyer locks P per share (cost of YES token)
   *   - Seller locks (1-P) per share (cost of NO token)
   *   - Total collateral per share = $1.00
   * On resolution, winners get $1.00/token funded by combined collateral.
   */
  public submitOrder(order: Order): MatchResult {
    // Validate price range
    if (order.price <= 0 || order.price >= 1) {
      return {
        trades: [],
        order: { ...order, status: 'rejected' },
        status: 'rejected',
        message: 'Price must be between 0 and 1 (exclusive)',
      };
    }

    // Validate quantity
    if (order.quantity <= 0) {
      return {
        trades: [],
        order: { ...order, status: 'rejected' },
        status: 'rejected',
        message: 'Quantity must be positive',
      };
    }

    // Calculate collateral required
    const costPerShare = this.calcCostPerShare(order.side, order.price);
    const totalCost = costPerShare * order.quantity;

    // Check user balance (against actual dollar cost, not share count)
    const userBalance = this.db.getUserBalance(order.userId);
    if (!userBalance || userBalance.available < totalCost) {
      return {
        trades: [],
        order: { ...order, status: 'rejected' },
        status: 'rejected',
        message: `Insufficient balance. Need $${totalCost.toFixed(2)}, have $${(userBalance?.available ?? 0).toFixed(2)}`,
      };
    }

    // Lock collateral (the actual dollar cost)
    this.db.updateUserBalance(order.userId, {
      available: userBalance.available - totalCost,
      locked: userBalance.locked + totalCost,
    });

    // Get or create order book for this market/outcome
    const bookKey = this.getOrderBookKey(order.marketId, order.outcomeIndex);
    let book = this.orderBooks.get(bookKey);
    if (!book) {
      book = new OrderBook(order.marketId, order.outcomeIndex);
      this.orderBooks.set(bookKey, book);
    }

    // Perform matching
    const trades = book.match(order);

    // Update order fill status
    const totalFilled = trades.reduce((sum, t) => sum + t.quantity, 0);
    order.filledQty = totalFilled;

    if (totalFilled === 0) {
      order.status = 'open';
    } else if (totalFilled === order.quantity) {
      order.status = 'filled';
    } else {
      order.status = 'partially_filled';
    }

    // Add unmatched portion to book (if not fully filled and not IOC/FOK)
    const remainingQty = order.quantity - totalFilled;
    if (remainingQty > 0 && order.type !== 'ioc' && order.type !== 'fok') {
      book.addOrder(order);
    } else if (remainingQty > 0 && (order.type === 'ioc' || order.type === 'fok')) {
      order.status = 'rejected';
      order.rejectionReason = `${order.type.toUpperCase()} order could not be fully filled`;
      order.cancelledQty = remainingQty;
    }

    // Release locked collateral for unfilled portion
    if (remainingQty > 0 && (order.type === 'ioc' || order.type === 'fok' || order.status === 'rejected')) {
      const remainingCost = costPerShare * remainingQty;
      const balance = this.db.getUserBalance(order.userId)!;
      this.db.updateUserBalance(order.userId, {
        available: balance.available + remainingCost,
        locked: balance.locked - remainingCost,
      });
    }
    // NOTE: for limit orders resting on the book, the locked funds stay locked
    // until the order fills or is cancelled.

    // Persist order and trades
    this.db.createOrder(order);
    for (const trade of trades) {
      this.db.createTrade(trade);

      // Update the MAKER order's status in the DB
      // The maker is whichever side is NOT the incoming order
      const makerOrderId = trade.buyOrderId === order.id ? trade.sellOrderId : trade.buyOrderId;
      const makerOrder = this.db.getOrder(makerOrderId);
      if (makerOrder) {
        makerOrder.filledQty += trade.quantity;
        if (makerOrder.filledQty >= makerOrder.quantity) {
          makerOrder.status = 'filled';
        } else {
          makerOrder.status = 'partially_filled';
        }
        makerOrder.updatedAt = new Date();
        this.db.updateOrder(makerOrder);
      }
    }

    // Update positions and balances for filled trades
    this.updatePositionsFromTrades(trades, order.marketId);

    // Refund price improvement for filled trades.
    // If a buy order at 50c matches a sell at 48c, the trade executes at 48c.
    // The buyer locked 50c/share but only 48c was consumed → refund 2c/share.
    // Similarly, if a sell order at 50c matches a buy at 55c, trade at 55c.
    // Seller locked (1-0.50)=50c but only (1-0.55)=45c consumed → refund 5c/share.
    if (trades.length > 0) {
      let priceImprovementRefund = 0;
      for (const trade of trades) {
        const orderCostPerShare = costPerShare; // what was locked per share
        const tradeCostPerShare = this.calcCostPerShare(order.side, trade.price); // what was actually consumed
        const improvement = (orderCostPerShare - tradeCostPerShare) * trade.quantity;
        if (improvement > 0.0001) { // floating point tolerance
          priceImprovementRefund += improvement;
        }
      }
      if (priceImprovementRefund > 0.0001) {
        const currentBalance = this.db.getUserBalance(order.userId);
        if (currentBalance) {
          this.db.updateUserBalance(order.userId, {
            available: currentBalance.available + priceImprovementRefund,
            locked: currentBalance.locked - priceImprovementRefund,
          });
          console.log(`  💰 Price improvement refund: $${priceImprovementRefund.toFixed(4)} back to ${order.userId.slice(0, 10)}...`);
        }
      }
    }

    return {
      trades,
      order,
      status: order.status === 'filled' ? 'success' : order.status === 'open' ? 'partial' : 'rejected',
      message: order.rejectionReason,
    };
  }

  /**
   * Cancel an open order.
   * Checks in-memory book first, then falls back to DB
   * (handles server restarts where the book is lost from memory).
   */
  public cancelOrder(marketId: string, orderId: string): Order | null {
    // 1. Try to cancel from in-memory order book
    for (const [key, book] of this.orderBooks.entries()) {
      if (!key.startsWith(marketId)) continue;

      const order = book.getOrder(orderId);
      if (order) {
        const cancelled = book.cancelOrder(orderId);
        if (cancelled) {
          const remainingQty = cancelled.quantity - cancelled.filledQty;
          if (remainingQty > 0) {
            const costPerShare = this.calcCostPerShare(cancelled.side, cancelled.price);
            const refund = costPerShare * remainingQty;
            const balance = this.db.getUserBalance(cancelled.userId);
            if (balance) {
              this.db.updateUserBalance(cancelled.userId, {
                available: balance.available + refund,
                locked: balance.locked - refund,
              });
            }
          }
          cancelled.status = 'cancelled';
          cancelled.updatedAt = new Date();
          this.db.updateOrder(cancelled);
          return cancelled;
        }
      }
    }

    // 2. Fallback: cancel from DB (order not in memory, e.g., after server restart)
    const dbOrder = this.db.getOrder(orderId);
    if (dbOrder && dbOrder.marketId === marketId &&
        (dbOrder.status === 'open' || dbOrder.status === 'partially_filled')) {
      const remainingQty = dbOrder.quantity - dbOrder.filledQty;
      if (remainingQty > 0) {
        const costPerShare = this.calcCostPerShare(dbOrder.side, dbOrder.price);
        const refund = costPerShare * remainingQty;
        const balance = this.db.getUserBalance(dbOrder.userId);
        if (balance) {
          this.db.updateUserBalance(dbOrder.userId, {
            available: balance.available + refund,
            locked: Math.max(0, balance.locked - refund),
          });
        }
      }
      dbOrder.status = 'cancelled';
      dbOrder.updatedAt = new Date();
      this.db.updateOrder(dbOrder);
      return dbOrder;
    }

    return null;
  }

  /**
   * Cancel all open orders for a market and refund locked collateral.
   * Used during market resolution so unfilled orders don't trap funds.
   *
   * Handles BOTH in-memory order book orders AND DB-only orders
   * (e.g., after a server restart when the book was lost from memory).
   */
  public cancelAllMarketOrders(marketId: string): number {
    let cancelledCount = 0;
    const cancelledIds = new Set<string>();

    // 1. Cancel orders in the in-memory order books
    for (const [key, book] of this.orderBooks.entries()) {
      if (!key.startsWith(marketId + ':')) continue;

      const orderIds = book.getAllOrderIds();
      for (const orderId of orderIds) {
        const order = book.getOrder(orderId);
        if (!order) continue;

        const cancelled = book.cancelOrder(orderId);
        if (cancelled) {
          const remainingQty = cancelled.quantity - cancelled.filledQty;
          if (remainingQty > 0) {
            const costPerShare = this.calcCostPerShare(cancelled.side, cancelled.price);
            const refund = costPerShare * remainingQty;
            const balance = this.db.getUserBalance(cancelled.userId);
            if (balance) {
              this.db.updateUserBalance(cancelled.userId, {
                available: balance.available + refund,
                locked: balance.locked - refund,
              });
            }
            console.log(`  🔄 Refunded $${refund.toFixed(2)} to ${cancelled.userId} (cancelled in-memory order ${orderId})`);
          }
          cancelled.status = 'cancelled';
          cancelled.updatedAt = new Date();
          this.db.updateOrder(cancelled);
          cancelledIds.add(orderId);
          cancelledCount++;
        }
      }
    }

    // 2. Cancel any remaining open orders in the DB that weren't in memory
    //    (happens after server restart — orders are in DB but not in the book)
    const dbOrders = this.db.getOpenOrdersForMarket(marketId);
    for (const order of dbOrders) {
      if (cancelledIds.has(order.id)) continue; // already handled above

      const remainingQty = order.quantity - order.filledQty;
      if (remainingQty > 0) {
        const costPerShare = this.calcCostPerShare(order.side, order.price);
        const refund = costPerShare * remainingQty;
        const balance = this.db.getUserBalance(order.userId);
        if (balance) {
          this.db.updateUserBalance(order.userId, {
            available: balance.available + refund,
            locked: Math.max(0, balance.locked - refund),
          });
        }
        console.log(`  🔄 Refunded $${refund.toFixed(2)} to ${order.userId} (cancelled DB-only order ${order.id})`);
      }
      order.status = 'cancelled';
      order.updatedAt = new Date();
      this.db.updateOrder(order);
      cancelledCount++;
    }

    return cancelledCount;
  }

  /**
   * Get order book snapshot for a market outcome
   */
  public getOrderBook(marketId: string, outcomeIndex: number) {
    const bookKey = this.getOrderBookKey(marketId, outcomeIndex);
    const book = this.orderBooks.get(bookKey);

    if (!book) {
      return {
        marketId,
        outcomeIndex,
        timestamp: new Date(),
        bids: [],
        asks: [],
      };
    }

    const depth = book.getDepth(20);
    const tob = book.getTopOfBook();

    return {
      marketId,
      outcomeIndex,
      timestamp: new Date(),
      bids: depth.bids,
      asks: depth.asks,
      spreadBps: tob.spread ? Math.round(tob.spread * 10000) : undefined,
    };
  }

  /**
   * Update user positions and consume locked collateral for executed trades.
   *
   * For a trade at price P, quantity Q on outcomeIndex:
   *   - BUYER gets +Q tokens on outcomeIndex (YES side), cost = P * Q
   *   - SELLER gets +Q tokens on OPPOSITE outcomeIndex (NO side), cost = (1-P) * Q
   *
   * Both sides' locked collateral is consumed (moved out of 'locked' balance).
   * The money is now "in the market" — it pays out winners on resolution.
   */
  private updatePositionsFromTrades(trades: Trade[], marketId: string): void {
    // We need to know how many outcomes the market has to calculate the opposite index
    const market = this.db.getMarket(marketId);
    if (!market) return;

    for (const trade of trades) {
      const oppositeOutcome = trade.outcomeIndex === 0 ? 1 : 0; // binary market

      // BUYER: gets tokens on the traded outcome (YES side)
      const buyerCost = trade.price * trade.quantity;
      this.db.updateOrCreatePosition(trade.buyUserId, trade.marketId, trade.outcomeIndex, {
        quantity: trade.quantity,
        costBasis: buyerCost,
      });

      // SELLER: gets tokens on the OPPOSITE outcome (NO side)
      // Selling YES at P = Buying NO at (1-P)
      const sellerCost = (1 - trade.price) * trade.quantity;
      this.db.updateOrCreatePosition(trade.sellUserId, trade.marketId, oppositeOutcome, {
        quantity: trade.quantity,
        costBasis: sellerCost,
      });

      // Consume locked collateral for both sides
      // The buyer had costPerShare=price locked per share from their order
      const buyerBalance = this.db.getUserBalance(trade.buyUserId);
      if (buyerBalance) {
        this.db.updateUserBalance(trade.buyUserId, {
          locked: buyerBalance.locked - buyerCost,
        });
      }

      // The seller had costPerShare=(1-price) locked per share from their order
      const sellerBalance = this.db.getUserBalance(trade.sellUserId);
      if (sellerBalance) {
        this.db.updateUserBalance(trade.sellUserId, {
          locked: sellerBalance.locked - sellerCost,
        });
      }
    }
  }

  /**
   * Get open orders for a user
   */
  public getUserOrders(userId: string): Order[] {
    const orders: Order[] = [];
    for (const book of this.orderBooks.values()) {
      // This would need to be enhanced to track user orders in the book
      // For now, we rely on database
    }
    return this.db.getUserOrders(userId);
  }

  /**
   * Get open order by ID
   */
  public getOrder(orderId: string): Order | null {
    // Check all books
    for (const book of this.orderBooks.values()) {
      const order = book.getOrder(orderId);
      if (order) {
        return order;
      }
    }
    // Fallback to database
    return this.db.getOrder(orderId);
  }

  /**
   * Internal key for order book lookup
   */
  private getOrderBookKey(marketId: string, outcomeIndex: number): string {
    return `${marketId}:${outcomeIndex}`;
  }

  /**
   * Get all order books (for admin/monitoring)
   */
  public getAllOrderBooks() {
    return Array.from(this.orderBooks.entries()).map(([key, book]) => {
      const [marketId, outcomeIndex] = key.split(':');
      return {
        marketId,
        outcomeIndex: parseInt(outcomeIndex),
        orderCount: book.getOrderCount(),
        depth: book.getDepth(5),
        topOfBook: book.getTopOfBook(),
      };
    });
  }
}
