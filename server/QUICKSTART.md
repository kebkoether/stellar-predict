# Quick Start Guide

Get the Stellar Predict backend running in 5 minutes.

## 1. Install Dependencies

```bash
npm install
```

## 2. Set Up Configuration

```bash
cp .env.example .env
```

Edit `.env` and add a settlement keypair. Generate one:

```bash
node -e "const sdk = require('@stellar/stellar-sdk'); const kp = sdk.Keypair.random(); console.log('SETTLEMENT_KEYPAIR=' + kp.secret())" >> .env
```

Or use an existing keypair and set the value directly in `.env`.

## 3. Run the Server

Development mode with hot reload:
```bash
npm run dev
```

The server will start on:
- HTTP API: `http://localhost:3000`
- WebSocket: `ws://localhost:3001`

## 4. Test It Works

### Health Check
```bash
curl http://localhost:3000/api/health
```

### Create a Market
```bash
MARKET=$(curl -s -X POST http://localhost:3000/api/markets \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Will Bitcoin exceed $100k by end of 2025?",
    "description": "Binary prediction market on Bitcoin price",
    "outcomes": ["Yes", "No"],
    "collateralCode": "USDC",
    "collateralIssuer": "GA5ZSEJYB37JRC5AVCIA5MOP4IYCGVS53UJVQ7RKSTD4P2WZDTAB47Z",
    "resolutionTime": "2025-12-31T23:59:59Z",
    "createdBy": "alice"
  }' | jq -r '.id')

echo "Market ID: $MARKET"
```

### Deposit Funds
```bash
curl -X POST http://localhost:3000/api/users/alice/deposit \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000}'
```

### Place an Order
```bash
MARKET_ID="your-market-id-here"

curl -X POST http://localhost:3000/api/markets/$MARKET_ID/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "alice",
    "side": "buy",
    "outcomeIndex": 0,
    "price": 0.65,
    "quantity": 100,
    "type": "limit"
  }'
```

### View Order Book
```bash
curl http://localhost:3000/api/markets/$MARKET_ID/orderbook/0 | jq
```

### Check Balance
```bash
curl http://localhost:3000/api/users/alice/balances
```

## 5. Connect WebSocket Client

In another terminal or browser console:

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  console.log('Connected');

  // Subscribe to order book updates
  ws.send(JSON.stringify({
    action: 'subscribe',
    channel: 'orderbook:YOUR_MARKET_ID:0'
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log('Message:', msg);
};

ws.onerror = (error) => console.error('Error:', error);
```

## 6. Try Different Order Types

### Market Order (immediate fill)
```bash
curl -X POST http://localhost:3000/api/markets/$MARKET_ID/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "bob",
    "side": "sell",
    "outcomeIndex": 0,
    "price": 0.50,
    "quantity": 50,
    "type": "market"
  }'
```

### IOC Order (immediate-or-cancel)
```bash
curl -X POST http://localhost:3000/api/markets/$MARKET_ID/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "charlie",
    "side": "buy",
    "outcomeIndex": 1,
    "price": 0.70,
    "quantity": 200,
    "type": "ioc"
  }'
```

### FOK Order (fill-or-kill)
```bash
curl -X POST http://localhost:3000/api/markets/$MARKET_ID/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "david",
    "side": "sell",
    "outcomeIndex": 0,
    "price": 0.60,
    "quantity": 1000,
    "type": "fok"
  }'
```

## 7. View Trades

```bash
curl http://localhost:3000/api/markets/$MARKET_ID/trades | jq
```

## 8. Check Positions

```bash
curl http://localhost:3000/api/users/alice/positions | jq
```

## 9. Resolve Market

```bash
curl -X POST http://localhost:3000/api/admin/markets/$MARKET_ID/resolve \
  -H "Content-Type: application/json" \
  -d '{"outcomeIndex": 0}'
```

## 10. Monitor

View all order books:
```bash
curl http://localhost:3000/api/admin/orderbooks | jq
```

## Common Issues

### Port Already in Use
Change ports in `.env`:
```env
SERVER_PORT=3002
WS_PORT=3003
```

### Database Errors
Delete the database and restart:
```bash
rm data.db
npm run dev
```

### Settlement Not Working
Check that `SETTLEMENT_KEYPAIR` is set and valid. On testnet, the account needs to be funded:
```bash
# Get your public key
node -e "const sdk = require('@stellar/stellar-sdk'); const kp = sdk.Keypair.fromSecret(process.env.SETTLEMENT_KEYPAIR); console.log(kp.publicKey())"

# Fund via friendbot
curl https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY
```

## Next Steps

- Read [README.md](./README.md) for detailed API documentation
- Check [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup
- Build your frontend client

## Project Structure

```
server/
├── src/
│   ├── types/           # TypeScript type definitions
│   ├── engine/          # CLOB matching engine
│   ├── db/              # Database layer
│   ├── api/             # REST and WebSocket servers
│   ├── settlement/      # Stellar settlement pipeline
│   ├── config.ts        # Configuration
│   └── index.ts         # Main entry point
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
└── .env.example         # Configuration template
```

## Tips

1. Use `jq` to pretty-print JSON responses
2. Set `LOG_LEVEL=debug` in `.env` for verbose logging
3. Watch WebSocket messages in browser DevTools
4. Use the `/api/admin/orderbooks` endpoint to debug
5. Store sensitive keys in `.env` (never in code!)

## Sample User Flow

```bash
# Setup users with funds
curl -X POST http://localhost:3000/api/users/alice/deposit -H "Content-Type: application/json" -d '{"amount": 1000}'
curl -X POST http://localhost:3000/api/users/bob/deposit -H "Content-Type: application/json" -d '{"amount": 1000}'

# Alice buys at 0.60
# Bob sells at 0.65
# They trade at 0.60 or 0.65 depending on order

# Market resolves to outcome 0
# Alice's positions are now "worth" 0.65 per share
# Bob's positions are now "worth" -0.65 per share
```

---

For more detailed information, see the full [README.md](./README.md).
