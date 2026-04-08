# Stellar Predict - Frontend

A modern, professional prediction market platform built on Stellar. Trade prediction shares with a clean, dark-themed trading UI inspired by Polymarket.

## Features

- **Market Browser**: Browse and filter prediction markets by category
- **Real-time Trading**: Place buy/sell orders with intuitive order entry forms
- **Live Order Book**: View bids and asks with real-time updates via WebSocket
- **Price Charts**: Interactive charts showing price history over time
- **Portfolio Management**: Track positions, open orders, and trade history
- **Wallet Integration**: Connect your Stellar wallet via Freighter
- **Responsive Design**: Works seamlessly on desktop and mobile

## Tech Stack

- **Framework**: Next.js 14
- **UI**: React 18 with Tailwind CSS
- **State**: Zustand for global state, SWR for data fetching
- **Charts**: Recharts for beautiful visualizations
- **Components**: Headless UI for accessible components
- **Icons**: Lucide React
- **Blockchain**: Stellar JS SDK + Freighter Wallet
- **WebSocket**: Real-time order book updates

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd web
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Update `.env.local` with your API and Stellar network configuration.

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── app/                 # Next.js app directory
│   ├── page.tsx        # Home / Market browser
│   ├── markets/
│   │   └── [id]/       # Market detail & trading page
│   ├── portfolio/      # User portfolio
│   ├── layout.tsx      # Root layout
│   └── globals.css     # Global styles & theme
├── components/         # Reusable React components
│   ├── Navbar.tsx
│   ├── WalletButton.tsx
│   ├── MarketCard.tsx
│   ├── OrderEntry.tsx
│   ├── OrderBook.tsx
│   ├── PriceChart.tsx
│   ├── TradeHistory.tsx
│   └── PositionCard.tsx
├── hooks/             # Custom React hooks
│   ├── useWallet.ts
│   ├── useMarket.ts
│   └── useOrderBook.ts
└── lib/              # Utilities & services
    ├── api.ts        # REST API client
    ├── websocket.ts  # WebSocket client
    └── stellar.ts    # Stellar blockchain utilities
```

## Key Features

### 1. Market Browser (Home Page)
- Featured/trending markets at the top
- Category filters (Politics, Crypto, Sports, Science, etc.)
- Search functionality
- Market cards showing prices, volumes, resolution dates

### 2. Market Detail Page
- Detailed market information and description
- Current probability display (visual donut chart)
- Interactive price chart with timeframe selection
- Order book with real-time bid/ask data
- Recent trades table
- Order entry form for buying/selling shares

### 3. Order Entry
- Buy/Sell tabs
- YES/NO outcome selection
- Limit/Market order types
- Price slider (1-99 cents)
- Quantity input
- Estimated cost calculation
- Real-time validation

### 4. Portfolio
- Total portfolio value
- Unrealized and realized P&L tracking
- Active positions with P&L indicators
- Open orders with cancel functionality
- Complete trade history

### 5. Wallet Integration
- Freighter wallet connection
- Balance display
- Address copy to clipboard
- Disconnect functionality

## Styling & Theme

The app uses a professional dark theme with:
- **Primary Color**: Slate-900/950 backgrounds
- **Accents**: Green for YES/bids (#22c55e), Red for NO/asks (#ef4444)
- **Typography**: Clean, modern sans-serif fonts with good contrast
- **Components**: Card-based layout with subtle shadows and borders
- **Animations**: Smooth transitions and fade-in effects

## API Integration

The frontend expects a REST API at `NEXT_PUBLIC_API_URL` with these endpoints:

### Markets
- `GET /markets` - List all markets
- `GET /markets/:id` - Get market details
- `POST /markets` - Create market

### Orders
- `POST /orders` - Place order
- `DELETE /orders/:id` - Cancel order
- `GET /orders` - List user orders
- `GET /orderbook/:marketId` - Get order book

### Trades
- `GET /trades` - List trades
- `GET /markets/:id/trades` - Get market trades

### User
- `GET /user/profile` - Get user profile
- `GET /user/balance` - Get USDC balance
- `POST /user/deposit` - Deposit USDC
- `POST /user/withdraw` - Withdraw USDC

### Price History
- `GET /markets/:id/price-history` - Get price history

## WebSocket Events

Subscribe to real-time updates via WebSocket at `NEXT_PUBLIC_WS_URL`:

- `orderbook:marketId` - Order book updates
- `trades:marketId` - Recent trades
- `markets:updates` - Market status changes

## Environment Variables

See `.env.example` for all available configuration options:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_WS_URL=ws://localhost:3001
NEXT_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_USDC_ISSUER=<USDC_ISSUER_ADDRESS>
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Performance

- Server-side rendering with Next.js
- Image optimization
- Code splitting
- SWR caching for API calls
- Efficient re-renders with React

## Security

- Wallet private keys never leave the Freighter extension
- All sensitive operations require wallet signing
- Environment variables for sensitive config
- No hardcoded secrets

## Future Enhancements

- Advanced charting with TradingView Lightweight Charts
- Notifications for order fills
- Portfolio performance analytics
- Leaderboard
- Market creation flow
- Limit orders and stop-loss
- Multi-sig trading
- API rate limiting info

## Contributing

Contributions are welcome! Please follow the existing code style and patterns.

## License

MIT
