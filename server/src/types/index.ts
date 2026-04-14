/**
 * Core type definitions for the prediction market platform
 */

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'market' | 'ioc' | 'fok';
export type OrderStatus = 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected';
export type MarketStatus = 'open' | 'closed' | 'resolved' | 'cancelled';
export type SettlementStatus = 'pending' | 'submitted' | 'confirmed' | 'failed' | 'retrying';

/**
 * Represents a single order in the system
 */
export interface Order {
  id: string;
  marketId: string;
  userId: string;
  side: OrderSide;
  outcomeIndex: number;
  price: number; // 0-1, representing probability/cents
  quantity: number; // shares
  type: OrderType;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  filledQty: number;
  cancelledQty: number;
  rejectionReason?: string;
}

/**
 * Represents a executed trade between two orders
 */
export interface Trade {
  id: string;
  marketId: string;
  outcomeIndex: number;
  buyOrderId: string;
  sellOrderId: string;
  buyUserId: string;
  sellUserId: string;
  price: number; // 0-1
  quantity: number; // shares
  timestamp: Date;
  settlementStatus: SettlementStatus;
}

/**
 * Represents a prediction market
 */
export interface Market {
  id: string;
  question: string;
  description: string;
  outcomes: string[]; // array of outcome labels
  status: MarketStatus;
  collateralToken: {
    code: string;
    issuer: string;
  };
  createdAt: Date;
  resolutionTime: Date;
  resolvedOutcomeIndex?: number; // only set when status is 'resolved'
  createdBy: string; // userId of market creator
  category?: string; // e.g. 'Politics', 'Crypto', 'Sports'
  eventId?: string; // groups multiple markets under one event (multi-outcome)
  eventTitle?: string; // display title for the event group
  oraclePrice?: number; // reference price from Polymarket oracle (0-1)
}

/**
 * Order book snapshot for a single market outcome
 */
export interface OrderBook {
  marketId: string;
  outcomeIndex: number;
  timestamp: Date;
  bids: PriceLevel[];
  asks: PriceLevel[];
  spreadBps?: number; // spread in basis points
}

/**
 * A single price level in the order book
 */
export interface PriceLevel {
  price: number;
  quantity: number;
  count: number; // number of orders at this price
}

/**
 * Represents a user's position in a market outcome
 */
export interface Position {
  id: string;
  userId: string;
  marketId: string;
  outcomeIndex: number;
  quantity: number; // net position (can be negative for short)
  costBasis: number; // total amount paid (for long) or received (for short)
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Represents a user's balance in the system
 */
export interface UserBalance {
  id: string;
  userId: string;
  available: number; // unlocked balance
  locked: number; // locked in open orders
  total: number; // available + locked
  updatedAt: Date;
}

/**
 * Settlement record for a trade on Stellar
 */
export interface Settlement {
  id: string;
  tradeIds: string[]; // batch of trades being settled
  transactionHash?: string;
  status: SettlementStatus;
  createdAt: Date;
  submittedAt?: Date;
  confirmedAt?: Date;
  failureReason?: string;
  retryCount: number;
}

/**
 * Represents the matching result from processing an order
 */
export interface MatchResult {
  trades: Trade[];
  order: Order;
  status: 'success' | 'partial' | 'rejected';
  message?: string;
}

/**
 * WebSocket message types
 */
export type WSMessageType = 'orderbook_update' | 'order_update' | 'trade' | 'market_update' | 'error' | 'heartbeat';

export interface WSMessage {
  type: WSMessageType;
  channel: string;
  data: Record<string, any>;
  timestamp: Date;
}
