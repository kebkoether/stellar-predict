# Architecture Overview

## System Design

This is a production-grade TypeScript backend for a Stellar prediction market platform. The architecture follows a layered approach with clear separation of concerns.

```
┌─────────────────────────────────────────────────────────┐
│         REST API & WebSocket Servers                   │
│  (Express HTTP on 3000, WS on 3001)                    │
├─────────────────────────────────────────────────────────┤
│              API Routes & WebSocket Layer               │
│  (src/api/routes.ts, src/api/websocket.ts)             │
├─────────────────────────────────────────────────────────┤
│         Matching Engine & Order Books                   │
│  (src/engine/matching.ts, src/engine/orderbook.ts)     │
├─────────────────────────────────────────────────────────┤
│    Database Layer (SQLite WAL mode)                    │
│  (src/db/database.ts)                                   │
├─────────────────────────────────────────────────────────┤
│  Settlement Pipeline & Stellar Integration             │
│  (src/settlement/settler.ts)                           │
└─────────────────────────────────────────────────────────┘
```

## Core Data Flow

### Order Placement Flow

```
1. Client POST /api/markets/{id}/orders
   ↓
2. Validation (price 0-1, qty > 0)
   ↓
3. Check user balance exists, has funds
   ↓
4. Lock funds (subtract from available, add to locked)
   ↓
5. Fetch/create order book for market/outcome
   ↓
6. Match order against opposing side
   ↓
7. Generate trades for matched quantities
   ↓
8. Update order status (filled/partially_filled/open)
   ↓
9. Add unmatched portion to book (if limit order)
   ↓
10. Persist order and trades to database
    ↓
11. Update user positions
    ↓
12. Broadcast via WebSocket to subscribers
    ↓
13. Return to client with trades array
```

### Settlement Flow

```
Unsettled trades accumulate in database
   ↓
Settlement pipeline runs every 10s
   ↓
Batch trades into groups (max 100 ops per tx)
   ↓
Build Stellar transaction with payment operations
   ↓
Sign with settlement keypair
   ↓
Submit to Stellar Horizon
   ↓
Poll for ledger inclusion
   ↓
Update trade status to "confirmed"
   ↓
If failure, retry up to 5 times
```

## Key Design Decisions

### 1. Off-Chain CLOB vs. On-Chain

- Orders match immediately off-chain (microseconds)
- Trades are immediately final from user perspective
- Settlement happens asynchronously to Stellar
- Users don't pay Stellar fees for every order

### 2. Order Book Per Outcome

- Each market outcome has independent order book
- Binary markets: 2 order books per market
- Categorical markets: N order books per market
- Outcome orders are not fungible across outcomes

### 3. Price Range 0-1

- Represents probability or implied price
- 0.25 = 25% probability
- Simplifies binary outcome logic
- Maps directly to position payout

### 4. SQLite for Simplicity

- Good for single-server deployments
- WAL mode enables concurrent reads/writes
- Fast random access via indices
- Easy to inspect/debug with sqlite3 CLI
- Note: For scale, replace with PostgreSQL

### 5. In-Memory Order Books

- Fast O(log n) matching
- Built from database on startup
- Trades written to DB immediately
- Order books are ephemeral (reconstructible)

## Order Matching Algorithm

Price-time priority with FIFO within levels:

1. **Best Price First**: Orders matched at best available price
   - Buy orders: matched against asks from lowest price
   - Sell orders: matched against bids from highest price

2. **Time Priority**: Within same price level, earlier orders match first
   - FIFO queue maintained per price level
   - Timestamp determines order

3. **Quantity**: Match up to available quantity
   - Partial fills allowed (except FOK/IOC)
   - Remaining quantity stays on book or rejected

Example:
```
Book state before new buy order arrives:
ASKS (ascending): [0.70, 0.71, 0.72]
BIDS (descending): [0.68, 0.67]

New order: BUY 150 @ 0.71 (limit)
- Matches 50 @ 0.70 (first ask, quantity available)
- Matches 100 @ 0.71 (second ask, partial)
- Remaining 50 stays on book as open limit order

Result:
ASKS (ascending): [0.71 (50 remaining), 0.72]
BIDS (descending): [0.71 (new 50), 0.68, 0.67]
Trades: [{price: 0.70, qty: 50}, {price: 0.71, qty: 100}]
```

## Type Safety

All operations use strict TypeScript types:

- `Order` - with status tracking
- `Trade` - with settlement status
- `Market` - immutable metadata
- `Position` - user holdings
- `UserBalance` - available/locked funds
- `Settlement` - batch transaction record

## Concurrency & Consistency

- Better-sqlite3 uses synchronous operations (safe for matching)
- Database transactions ensure atomicity
- Order matching is single-threaded (safe ordering)
- WebSocket broadcasts after database commit
- Settlement pipeline isolated from matching

## Error Scenarios Handled

1. **Insufficient Balance**
   - Order rejected with "Insufficient balance" message
   - No lock attempted

2. **Market Not Open**
   - Order rejected with "Market is not open for trading"

3. **FOK Order Can't Fill**
   - Entire order rejected, funds not locked

4. **IOC Partial Fill**
   - Unfilled remainder cancelled, funds released

5. **Settlement Failure**
   - Trade stays in "pending" state
   - Automatic retry with exponential backoff
   - Max 5 retries before manual intervention

6. **WebSocket Disconnect**
   - Client unsubscribed from all channels
   - Automatic cleanup on close

## Extensibility Points

### Add New Order Type
1. Extend `OrderType` in `src/types/index.ts`
2. Add matching logic in `OrderBook.match()`
3. Add validation in REST handler

### Add Market Type
1. Create market with different outcome count
2. System automatically creates N order books
3. All existing logic works unchanged

### Scale to Multiple Servers
1. Replace SQLite with PostgreSQL
2. Use Redis for order book snapshots
3. Add queue (RabbitMQ) for settlement
4. Use distributed locks for consistency

### Add Authentication
1. Add auth middleware to Express
2. Validate userId from JWT token
3. Rate limit by user

### Add Fees
1. Add fee field to Trade
2. Create fee collection account
3. Deduct from settlement payments

## Configuration Hierarchy

1. Environment variables (highest priority)
2. `.env` file
3. Hardcoded defaults (lowest priority)

See `src/config.ts` for all configurable values.

## Monitoring & Observability

HTTP endpoints:
- `GET /api/health` - Service health
- `GET /api/admin/orderbooks` - All order books state

WebSocket:
- Subscribe to `markets` channel for all market updates
- Subscribe to `trades:{marketId}` for trade stream
- Subscribe to `orderbook:{marketId}:{outcome}` for live depth

Database:
- Direct SQLite queries for analysis
- All tables indexed for fast queries

## Testing Strategy

Unit tests for:
- Order matching algorithm
- Price-time priority
- Balance management
- FOK/IOC logic

Integration tests for:
- Order placement → matching → settlement
- User balance updates
- Position calculations

Load tests for:
- Concurrent order submissions
- WebSocket broadcast latency
- Settlement batching efficiency

## Future Enhancements

1. **Conditional Orders**
   - Stop loss
   - Trailing stops
   - Iceberg orders

2. **Complex Markets**
   - Continuous outcomes (e.g., price ranges)
   - Nested conditional markets
   - AMM for liquidity

3. **Margin Trading**
   - Leverage positions
   - Liquidation logic

4. **Options**
   - Derivative instruments
   - Greeks calculation

5. **Cross-Market Hedging**
   - Basket orders
   - Market-making tools

6. **Analytics**
   - VWAP calculation
   - Volume profile
   - Implied volatility
