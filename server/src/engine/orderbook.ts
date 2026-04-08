import { Order, OrderStatus, OrderSide, OrderType, PriceLevel, Trade } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Single-sided order book for a market outcome.
 * Maintains price-time priority matching for limit orders.
 */
export class OrderBook {
  private bids: Map<string, OrderNode> = new Map(); // price -> linked list of orders
  private asks: Map<string, OrderNode> = new Map();
  private bidPrices: number[] = []; // sorted descending
  private askPrices: number[] = []; // sorted ascending
  private orderMap: Map<string, Order> = new Map(); // orderId -> Order
  private readonly marketId: string;
  private readonly outcomeIndex: number;

  constructor(marketId: string, outcomeIndex: number) {
    this.marketId = marketId;
    this.outcomeIndex = outcomeIndex;
  }

  /**
   * Add an order to the book. Does not perform matching.
   */
  public addOrder(order: Order): void {
    if (order.marketId !== this.marketId || order.outcomeIndex !== this.outcomeIndex) {
      throw new Error('Order market/outcome mismatch');
    }

    // Store the SAME reference (not a copy) so that when matchAgainst updates
    // filledQty on the order, the orderMap stays in sync.
    this.orderMap.set(order.id, order);
    const sideMap = order.side === 'buy' ? this.bids : this.asks;
    const priceList = sideMap.get(order.price.toString());

    if (!priceList) {
      const newList = new OrderNode(order);
      sideMap.set(order.price.toString(), newList);
      this.updatePriceLevels();
    } else {
      priceList.append(order);
    }
  }

  /**
   * Remove an order from the book by ID
   */
  public cancelOrder(orderId: string): Order | null {
    const order = this.orderMap.get(orderId);
    if (!order) {
      return null;
    }

    const sideMap = order.side === 'buy' ? this.bids : this.asks;
    const priceKey = order.price.toString();
    const node = sideMap.get(priceKey);

    if (node) {
      node.remove(orderId);
      if (node.isEmpty()) {
        sideMap.delete(priceKey);
      }
    }

    this.orderMap.delete(orderId);
    this.updatePriceLevels();
    return order;
  }

  /**
   * Match crossing orders. Returns trades generated.
   * Uses price-time priority: best price first, then FIFO within price level.
   */
  public match(incomingOrder: Order): Trade[] {
    const trades: Trade[] = [];

    if (incomingOrder.type === 'market' || incomingOrder.type === 'ioc' || incomingOrder.type === 'fok') {
      // Market orders match against best prices immediately
      trades.push(
        ...this.matchMarketOrder(incomingOrder, incomingOrder.type === 'fok')
      );
    } else if (incomingOrder.type === 'limit') {
      // Limit orders only match if aggressive
      trades.push(...this.matchLimitOrder(incomingOrder));
    }

    return trades;
  }

  /**
   * Match a market order against the opposite side
   */
  private matchMarketOrder(incomingOrder: Order, fillOrKill: boolean): Trade[] {
    const trades: Trade[] = [];
    let remainingQty = incomingOrder.quantity - incomingOrder.filledQty;
    const oppositeSide = incomingOrder.side === 'buy' ? this.asks : this.bids;
    const oppositePrices = incomingOrder.side === 'buy' ? this.askPrices : this.bidPrices;

    for (const price of oppositePrices) {
      if (remainingQty <= 0) break;

      const priceKey = price.toString();
      const node = oppositeSide.get(priceKey);
      if (!node) continue;

      const matched = node.matchAgainst(remainingQty);
      for (const matchedOrder of matched) {
        const tradeQty = Math.min(remainingQty, matchedOrder.availableQty);
        trades.push(this.createTrade(incomingOrder, matchedOrder.order, price, tradeQty));
        remainingQty -= tradeQty;
        // Remove fully filled maker orders from the orderMap
        if (matchedOrder.order.filledQty >= matchedOrder.order.quantity) {
          this.orderMap.delete(matchedOrder.order.id);
        }
      }

      if (node.isEmpty()) {
        oppositeSide.delete(priceKey);
      }
    }

    // FOK orders must fill completely or not at all
    if (fillOrKill && remainingQty > 0) {
      // Reject the entire order
      incomingOrder.status = 'rejected';
      incomingOrder.rejectionReason = 'FOK order could not be fully filled';
      return [];
    }

    this.updatePriceLevels();
    return trades;
  }

  /**
   * Match a limit order - only matches if price is aggressive
   */
  private matchLimitOrder(incomingOrder: Order): Trade[] {
    const trades: Trade[] = [];
    let remainingQty = incomingOrder.quantity - incomingOrder.filledQty;
    const oppositeSide = incomingOrder.side === 'buy' ? this.asks : this.bids;
    const oppositePrices = incomingOrder.side === 'buy' ? this.askPrices : this.bidPrices;

    for (const price of oppositePrices) {
      // Check if price is still aggressive for buy (price <= bestAsk) or sell (price >= bestBid)
      const isAggressive =
        incomingOrder.side === 'buy'
          ? incomingOrder.price >= price
          : incomingOrder.price <= price;

      if (!isAggressive) break;
      if (remainingQty <= 0) break;

      const priceKey = price.toString();
      const node = oppositeSide.get(priceKey);
      if (!node) continue;

      const matched = node.matchAgainst(remainingQty);
      for (const matchedOrder of matched) {
        const tradeQty = Math.min(remainingQty, matchedOrder.availableQty);
        trades.push(this.createTrade(incomingOrder, matchedOrder.order, price, tradeQty));
        remainingQty -= tradeQty;
        // Remove fully filled maker orders from the orderMap
        if (matchedOrder.order.filledQty >= matchedOrder.order.quantity) {
          this.orderMap.delete(matchedOrder.order.id);
        }
      }

      if (node.isEmpty()) {
        oppositeSide.delete(priceKey);
      }
    }

    this.updatePriceLevels();
    return trades;
  }

  /**
   * Create a trade between two orders
   */
  private createTrade(buyOrder: Order, sellOrder: Order, price: number, quantity: number): Trade {
    const [buyer, seller] =
      buyOrder.side === 'buy' ? [buyOrder, sellOrder] : [sellOrder, buyOrder];

    return {
      id: uuidv4(),
      marketId: this.marketId,
      outcomeIndex: this.outcomeIndex,
      buyOrderId: buyer.id,
      sellOrderId: seller.id,
      buyUserId: buyer.userId,
      sellUserId: seller.userId,
      price,
      quantity,
      timestamp: new Date(),
      settlementStatus: 'pending',
    };
  }

  /**
   * Get the best bid and ask
   */
  public getTopOfBook(): { bestBid?: number; bestAsk?: number; spread?: number } {
    const bestBid = this.bidPrices.length > 0 ? this.bidPrices[0] : undefined;
    const bestAsk = this.askPrices.length > 0 ? this.askPrices[0] : undefined;

    const result: { bestBid?: number; bestAsk?: number; spread?: number } = {};
    if (bestBid !== undefined) result.bestBid = bestBid;
    if (bestAsk !== undefined) result.bestAsk = bestAsk;

    if (bestBid !== undefined && bestAsk !== undefined) {
      result.spread = bestAsk - bestBid;
    }

    return result;
  }

  /**
   * Get order book snapshot up to specified depth
   */
  public getDepth(levels: number = 10): { bids: PriceLevel[]; asks: PriceLevel[] } {
    const bids: PriceLevel[] = [];
    const asks: PriceLevel[] = [];

    for (let i = 0; i < Math.min(levels, this.bidPrices.length); i++) {
      const price = this.bidPrices[i];
      const node = this.bids.get(price.toString());
      if (node) {
        bids.push({
          price,
          quantity: node.getTotalQuantity(),
          count: node.getCount(),
        });
      }
    }

    for (let i = 0; i < Math.min(levels, this.askPrices.length); i++) {
      const price = this.askPrices[i];
      const node = this.asks.get(price.toString());
      if (node) {
        asks.push({
          price,
          quantity: node.getTotalQuantity(),
          count: node.getCount(),
        });
      }
    }

    return { bids, asks };
  }

  /**
   * Get all orders at a specific price level
   */
  public getOrdersAtPrice(side: OrderSide, price: number): Order[] {
    const sideMap = side === 'buy' ? this.bids : this.asks;
    const node = sideMap.get(price.toString());
    return node ? node.getOrders() : [];
  }

  /**
   * Rebuild price level arrays
   */
  private updatePriceLevels(): void {
    // Remove empty price levels and rebuild sorted arrays
    this.bidPrices = Array.from(this.bids.keys())
      .map(Number)
      .filter((p) => !this.bids.get(p.toString())?.isEmpty())
      .sort((a, b) => b - a); // descending for bids

    this.askPrices = Array.from(this.asks.keys())
      .map(Number)
      .filter((p) => !this.asks.get(p.toString())?.isEmpty())
      .sort((a, b) => a - b); // ascending for asks
  }

  /**
   * Get order by ID
   */
  public getOrder(orderId: string): Order | undefined {
    return this.orderMap.get(orderId);
  }

  /**
   * Get all order IDs in the book
   */
  public getAllOrderIds(): string[] {
    return Array.from(this.orderMap.keys());
  }

  /**
   * Get total orders in book
   */
  public getOrderCount(): number {
    return this.orderMap.size;
  }

  /**
   * Clear entire book (for testing/reset)
   */
  public clear(): void {
    this.bids.clear();
    this.asks.clear();
    this.bidPrices = [];
    this.askPrices = [];
    this.orderMap.clear();
  }
}

/**
 * Node in the price level linked list.
 * Maintains FIFO order of orders at the same price level.
 */
class OrderNode {
  private orders: Order[] = [];
  private next: OrderNode | null = null;
  private prev: OrderNode | null = null;

  constructor(order: Order) {
    this.orders.push(order);
  }

  public append(order: Order): void {
    this.orders.push(order);
  }

  public remove(orderId: string): boolean {
    const initialLength = this.orders.length;
    this.orders = this.orders.filter((o) => o.id !== orderId);
    return this.orders.length < initialLength;
  }

  public isEmpty(): boolean {
    return this.orders.length === 0;
  }

  public getTotalQuantity(): number {
    return this.orders.reduce((sum, o) => sum + (o.quantity - o.filledQty), 0);
  }

  public getCount(): number {
    return this.orders.length;
  }

  public getOrders(): Order[] {
    return [...this.orders];
  }

  /**
   * Match orders against incoming quantity.
   * Returns matched orders with available quantities in FIFO order.
   * Updates filledQty on matched orders and removes fully filled orders.
   */
  public matchAgainst(quantity: number): Array<{ order: Order; availableQty: number }> {
    const result: Array<{ order: Order; availableQty: number }> = [];
    let remaining = quantity;

    for (const order of this.orders) {
      if (remaining <= 0) break;
      const available = order.quantity - order.filledQty;
      if (available > 0) {
        const fillQty = Math.min(available, remaining);
        result.push({ order, availableQty: fillQty });
        // Update the maker order's filledQty so it can't be double-matched
        order.filledQty += fillQty;
        remaining -= fillQty;
      }
    }

    // Remove fully filled orders from the node
    this.orders = this.orders.filter(o => o.quantity - o.filledQty > 0);

    return result;
  }
}
