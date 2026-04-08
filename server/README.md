# Stellar Predict Backend

A production-quality TypeScript backend for a Stellar-based prediction market platform, featuring an off-chain CLOB (Central Limit Order Book), REST API, WebSocket real-time updates, and automated settlement pipeline.

## Architecture

### Core Components

1. **Order Book Engine** (`src/engine/orderbook.ts`)
   - Single-outcome order book with price-time priority matching
   - Supports limit, market, IOC (Immediate-Or-Cancel), and FOK (Fill-Or-Kill) order types
   - Maintains FIFO order within price levels
   - Efficient data structures for fast matching

2. **Matching Engine** (`src/engine/matching.ts`)
   - Multi-market, multi-outcome order routing
   - Order validation against user balances
   - Automatic position and balance updates
   - Trade generation and persistence

3. **Database Layer** (`src/db/database.ts`)
   - SQLite with WAL mode for concurrent access
   - Tables: markets, orders, trades, positions, balances, settlements
   - Transaction support for atomic operations
   - Prepared statements for security

4. **REST API** (`src/api/routes.ts`)
   - Market management (create, list, resolve)
   - Order placement and cancellation
   - Order book snapshots
   - User positions and balances
   - Trade history
   - Admin endpoints

5. **WebSocket Server** (`src/api/websocket.ts`)
   - Real-time order book updates: `orderbook:{marketId}:{outcomeIndex}`
   - Trade streams: `trades:{marketId}`
   - Market updates: `markets`
   - Order updates: `orders:{marketId}:{userId}`

6. **Settlement Pipeline** (`src/settlement/settler.ts`)
   - Batches unsettled trades (up to 100 operations per transaction)
   - Submits to Stellar network
   - Polls for confirmation
   - Automatic retry with exponential backoff
   - Comprehensive error handling

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key variables:
- `SETTLEMENT_KEYPAIR` - Secret key for settlement account (required)
- `STELLAR_NETWORK` - testnet or mainnet
- `STELLAR_HORIZON_URL` - Horizon API endpoint
- `DB_PATH` - SQLite database location

## Running

Development:
```bash
npm run dev
```

Production:
```bash
npm run build
npm start
```

## Order Types

### Limit
- Placed on the book if no matching orders
- Only matches at specified price or better
- Remains until filled or cancelled

### Market
- Immediately matches against best available prices
- May partially fill if insufficient liquidity
- Unfilled remainder is rejected

### IOC (Immediate-Or-Cancel)
- Matches immediately against available liquidity
- Unfilled remainder is cancelled
- Never rests on the book

### FOK (Fill-Or-Kill)
- Must fully fill against available orders
- If full fill impossible, entire order is rejected
- Never rests on the book

## API Examples

### Create a Market
```bash
POST /api/markets
{
  "question": "Will Bitcoin exceed $100k by end of 2025?",
  "description": "Binary prediction market on Bitcoin price",
  "outcomes": ["Yes", "No"],
  "collateralCode": "USDC",
  "collateralIssuer": "GA5ZSEJYB37JRC5AVCIA5MOP4IYCGVS53UJVQ7RKSTD4P2WZDTAB47Z",
  "resolutionTime": "2025-12-31T23:59:59Z",
  "createdBy": "user123"
}
```

### Deposit Funds
```bash
POST /api/users/user123/deposit
{
  "amount": 1000
}
```

### Place an Order
```bash
POST /api/markets/{marketId}/orders
{
  "userId": "user123",
  "side": "buy",
  "outcomeIndex": 0,
  "price": 0.65,
  "quantity": 100,
  "type": "limit"
}
```

### Get Order Book
```bash
GET /api/markets/{marketId}/orderbook/0
```

Response:
```json
{
  "marketId": "...",
  "outcomeIndex": 0,
  "timestamp": "2025-03-31T12:00:00Z",
  "bids": [
    { "price": 0.65, "quantity": 500, "count": 3 },
    { "price": 0.64, "quantity": 200, "count": 1 }
  ],
  "asks": [
    { "price": 0.66, "quantity": 300, "count": 2 },
    { "price": 0.67, "quantity": 100, "count": 1 }
  ],
  "spreadBps": 100
}
```

### Cancel an Order
```bash
DELETE /api/markets/{marketId}/orders/{orderId}
```

### Get User Positions
```bash
GET /api/users/user123/positions
```

### Resolve Market
```bash
POST /api/admin/markets/{marketId}/resolve
{
  "outcomeIndex": 0
}
```

## WebSocket Examples

### Subscribe to Order Book Updates
```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.send(JSON.stringify({
  action: 'subscribe',
  channel: 'orderbook:market123:0'
}));

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'orderbook_update') {
    console.log('Order book updated:', msg.data);
  }
};
```

### Subscribe to Trades
```javascript
ws.send(JSON.stringify({
  action: 'subscribe',
  channel: 'trades:market123'
}));
```

## Database Schema

### Markets
- `id` - Unique market identifier
- `question` - Market question text
- `outcomes` - JSON array of outcome labels
- `status` - open|closed|resolved|cancelled
- `collateral_token_*` - Asset details
- `resolution_time` - When market resolves
- `resolved_outcome_index` - Winning outcome (if resolved)

### Orders
- `id` - Unique order identifier
- `market_id`, `user_id` - References
- `side` - buy|sell
- `price` - 0-1 range (probability)
- `quantity`, `filled_qty` - Share amounts
- `status` - open|filled|partially_filled|cancelled|rejected

### Trades
- `id` - Unique trade identifier
- `buy_order_id`, `sell_order_id` - Matching orders
- `price`, `quantity` - Trade terms
- `settlement_status` - pending|submitted|confirmed|failed

### Positions
- `user_id`, `market_id`, `outcome_index` - Key
- `quantity` - Net shares held (can be negative)
- `cost_basis` - Total amount invested/received

### Balances
- `user_id` - User identifier
- `available` - Unlocked balance
- `locked` - Locked in open orders

## Settlement Flow

1. Trades execute immediately off-chain in the CLOB
2. Unsettled trades queue in the database
3. Settlement pipeline batches trades (max 100 ops per transaction)
4. Submits Stellar transaction with payment operations
5. Polls Horizon for confirmation
6. Updates trade and settlement status

Settlement is independent of order matching - trades are final immediately, settlement just records them on-chain.

## Error Handling

All endpoints return standard JSON error responses:

```json
{
  "error": "Error message",
  "details": []
}
```

HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Validation error
- `404` - Not found
- `500` - Server error

## Performance Characteristics

- Order matching: O(log n) per order
- Order book depth retrieval: O(k) where k is requested levels
- Database queries: Indexed for fast lookups
- WebSocket broadcast: O(s) where s is subscribers to channel

## Security Considerations

- Settlement keypair should be stored securely (e.g., HSM, KMS)
- Database has WAL mode for concurrent writes
- All inputs validated with Zod schemas
- SQL injection prevented with prepared statements
- CORS configured for API access control

## Deployment

For production:

1. Set `NODE_ENV=production`
2. Use strong settlement keypair (hardware wallet)
3. Configure USDC issuer for mainnet
4. Use PostgreSQL or MongoDB instead of SQLite for scale
5. Add authentication/authorization
6. Deploy behind reverse proxy (nginx)
7. Enable HTTPS
8. Monitor settlement pipeline health
9. Set up database backups

## Testing

```bash
npm test
```

Test coverage includes:
- Order matching algorithm
- Price-time priority verification
- Balance management
- Settlement batching
- WebSocket broadcasts

## Monitoring

Access WebSocket server stats:
```javascript
ws.send(JSON.stringify({ action: 'stats' }));
```

Check HTTP health:
```bash
curl http://localhost:3000/api/health
```

View order books:
```bash
curl http://localhost:3000/api/admin/orderbooks
```

## License

MIT
