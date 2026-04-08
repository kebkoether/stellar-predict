# Stellar Predict Frontend - Feature Reference

## Complete Feature Breakdown

### 1. HOME PAGE (Market Browser)

**URL**: `/`

#### Hero Section
- Large headline: "Trade Tomorrow, Today"
- Tagline with key value proposition
- Gradient background with accent color

#### Search & Discovery
- Real-time search bar with icon
- Searches across market questions
- Instant filtering without page reload

#### Category Filtering
- 8 preset categories:
  - All Markets
  - Politics
  - Crypto
  - Sports
  - Science
  - Tech
  - Entertainment
  - Business
- Selected category highlighted in green
- One category selected at a time

#### Featured Markets Section
- Top 6 trending markets displayed
- Shows before applying category filters
- Demonstrates trending activity

#### Market Grid
- Responsive 1-3 column layout
- Markets update based on search/filter
- Shows "No markets found" message when empty
- Loading skeleton cards while fetching

#### Call-to-Action
- "Create Market" button at bottom
- Separate section with background gradient

### 2. MARKET DETAIL PAGE (Trading Interface)

**URL**: `/markets/[id]`

#### Market Header
- Large market question
- Full description text
- Category badge (blue)
- Status indicator (active/resolved/paused)

#### Market Info Cards (4 columns, responsive)
- **Status**: Market state (active, resolved, paused)
- **Volume**: 24-hour trading volume with K/M formatting
- **Resolution Date**: Countdown to resolution
- **Creator**: Market creator address (truncated)

#### Probability Display
- Two circular progress indicators (green & red)
- Centered in cards
- Percentage text (0-100%)
- Current YES/NO prices below circles
- Visual dominance of largest outcome

#### Price History Chart
- Full-width interactive chart
- Green line for YES prices
- Red line for NO prices
- 4 timeframe buttons: 1h, 24h, 7d, 30d
- Hover tooltips with exact prices
- Responsive container

#### Order Book (Two-column layout)
- **Left Column (Asks - Red)**
  - Sell-side orders
  - Highest ask price at bottom
  - Quantity bars with background
  - Red color scheme
- **Right Column (Bids - Green)**
  - Buy-side orders
  - Highest bid price at bottom
  - Quantity bars with background
  - Green color scheme
- **Mid Price**: Display between columns
- Scrollable up to 380px height
- Empty state handling

#### Trade History Table
- Recent trades in chronological order
- Columns: Time, Price, Quantity, Type (Buy/Sell)
- Buy trades in green badge, Sell in red badge
- Maker indicator for trades
- Timestamp formatting (HH:MM:SS)

#### Order Entry Form (Sidebar)
- **Outcome Selection**: YES/NO toggle buttons
- **Order Type**: Buy/Sell tabs
- **Order Mode**: Limit/Market selector
- **Price Input**:
  - Slider from 1-99 cents
  - Real-time slider label
  - For limit orders only
- **Quantity Input**:
  - Text number input
  - Minimum 1 share
  - Step by 10 shares
- **Estimated Cost**:
  - Calculated as (quantity * price) / 100
  - Updated in real-time
  - Displayed in gray box
- **Submit Button**:
  - Buy or Sell button (changes based on type)
  - Gradient green (buy) or red (sell)
  - Full width
- **Note**: "Settlement in USDC on Stellar"

#### Market Statistics (Sidebar Card)
- 24h Volume
- 24h High
- 24h Low
- Current Spread (bid-ask)

#### Info Box
- Blue-tinted card
- "Note:" prefix
- Explains USDC settlement on Stellar

### 3. PORTFOLIO PAGE

**URL**: `/portfolio`

#### Summary Cards (4 columns, responsive)
- **Portfolio Value**
  - Wallet icon
  - Total value across all markets
  - Subtitle: "Total across all markets"

- **Unrealized P&L**
  - Trending up/down icon
  - Green if positive, red if negative
  - Percentage change

- **Realized P&L**
  - Dollar sign icon
  - From closed positions

- **Open Orders**
  - Lightning bolt icon
  - Count of pending orders
  - Subtitle: "Pending execution"

#### Tab Navigation
- Three tabs: Positions, Open Orders, Trade History
- Selected tab highlighted with green bottom border
- Text content, line numbers in tabs

#### Positions Tab

**When empty:**
- Message: "No open positions"
- "Browse Markets" button link

**When populated:**
- Grid of position cards (1-2 per row)
- Each card shows:
  - Market question (line-clamped to 2 lines)
  - Outcome (YES/NO) with emoji
  - Shares count
  - Average buy price
  - Cost basis (shares * avg_price / 100)
  - Current value (shares * current_price / 100)
  - P&L box with:
    - Dollar amount
    - Percentage change
    - Color coded (green/red)
  - Trending icon (up/down)
  - Open date

#### Open Orders Tab

**When empty:**
- Message: "No open orders"
- "Create Order" button link

**When populated:**
- Table with columns:
  - Market (question, truncated)
  - Outcome (YES/NO, styled)
  - Type (Buy/Sell badge)
  - Price (cents)
  - Quantity (shares)
  - Filled (filled/total)
  - Action (Cancel button)
- Hover row background change
- Cancel button in red (danger color)

#### Trade History Tab

**When empty:**
- Message: "No trade history"

**When populated:**
- Table with columns:
  - Date (formatted)
  - Market (question, truncated)
  - Type (Buy/Sell badge)
  - Price (cents)
  - Quantity (shares)
  - Fee (USDC)
  - P&L (profit/loss in dollars)
- Color coding: Green for wins, red for losses
- Sortable by clicking headers (stub)

### 4. REUSABLE COMPONENTS

#### MarketCard
- Dimensions: Responsive to grid
- Content:
  - Category badge (top-right)
  - Trending icon (top-right)
  - Market question (line-clamped)
  - Probability bar (green-red gradient)
  - YES/NO percentages
  - Price tiles (2 columns)
  - Volume and resolution date (footer)
- States:
  - Default: Slate-800 card
  - Hover: Lighter background, text changes color
- Link: Navigates to `/markets/[id]`

#### OrderEntry
- Props:
  - `marketId`: string
  - `onSubmit`: (order) => void
  - `isLoading`: boolean (optional)
- Features:
  - Emoji in buttons (👍 for YES, 👎 for NO)
  - Color-coded selection (green/red)
  - Estimated cost in large text
  - Form validation

#### OrderBook
- Props:
  - `bids`: OrderBookLevel[]
  - `asks`: OrderBookLevel[]
  - `midPrice`: number (optional)
- Features:
  - Two-column layout
  - Depth visualization with width percentages
  - Max quantity normalization
  - Color-coded sides
  - Mid-price divider

#### PriceChart
- Props:
  - `data`: PricePoint[] (timestamp, yesPrice, noPrice)
  - `loading`: boolean (optional)
- Features:
  - Recharts ResponsiveContainer
  - Custom XAxis (time formatting)
  - YAxis (0-100 domain)
  - Dual lines (green YES, red NO)
  - Loading skeleton

#### TradeHistory
- Props:
  - `trades`: Trade[]
  - `loading`: boolean (optional)
- Features:
  - Sortable columns (stub)
  - Buy/Sell badges
  - Maker indicator
  - Timestamp formatting

#### PositionCard
- Props:
  - `marketId`, `question`, `outcome`, `shares`
  - `averagePrice`, `currentPrice`, `timestamp`
- Features:
  - P&L calculation
  - P&L percentage
  - Trending icons
  - Cost basis display
  - Position age

#### Navbar
- Features:
  - Logo with gradient and icon
  - Desktop menu (Markets, Portfolio, Docs)
  - Mobile hamburger menu
  - Responsive layout
  - Sticky position
  - Border and backdrop blur

#### WalletButton
- Features:
  - Connect state shows "Connect Wallet"
  - Connected state shows truncated address
  - Green dot indicator when connected
  - Dropdown menu with:
    - Full address display
    - Copy button with feedback
    - Disconnect button
  - Freighter API integration

### 5. HOOKS & UTILITIES

#### useWallet
- Manages Freighter wallet connection
- Functions:
  - `connect()`: Initiates wallet connection
  - `disconnect()`: Clears wallet data
  - `sign(transaction)`: Signs a transaction
- Returns:
  - `connected`: boolean
  - `publicKey`: string | null
  - `loading`: boolean
  - `error`: string | null

#### useMarket(id)
- SWR hook for single market
- Returns:
  - `market`: Market object
  - `loading`: boolean
  - `error`: Error object
  - `refetch()`: Manual refresh

#### useMarkets(params)
- SWR hook for market list
- Supports filtering/pagination
- Returns array of markets

#### useOrderBook(marketId)
- Combines SWR initial fetch + WebSocket updates
- Auto-subscribes to real-time updates
- Returns:
  - `orderBook`: Full data
  - `bids`, `asks`: Extracted arrays
  - `midPrice`: Calculated middle price
  - `loading`, `error`: States

#### API Client (lib/api.ts)
- Centralized REST client
- All endpoints typed
- Error handling with status codes
- Functions:
  - `markets.list(params)`
  - `markets.get(id)`
  - `orders.place(data)`
  - `orders.cancel(id)`
  - `orderBook.get(marketId)`
  - `trades.list(params)`
  - `trades.getByMarket(marketId)`
  - `positions.list(params)`
  - `user.getProfile()`
  - `user.getBalance()`
  - `user.deposit(data)`
  - `user.withdraw(data)`

#### WebSocket Client (lib/websocket.ts)
- Auto-reconnection with exponential backoff
- Message queue for offline operations
- Singleton pattern
- Functions:
  - `connect()`: Establish connection
  - `subscribe(channel, handler)`: Listen to updates
  - `unsubscribe(channel)`: Stop listening
  - `disconnect()`: Close connection
  - `isConnected()`: Check status

#### Stellar Utilities (lib/stellar.ts)
- Horizon API integration
- Stellar.js SDK wrapper
- Functions:
  - `buildDepositTransaction(...)`: Create deposit XDR
  - `buildWithdrawalTransaction(...)`: Create withdrawal XDR
  - `getAccount(publicKey)`: Fetch account details
  - `submitTransaction(xdr)`: Submit signed transaction
  - `getUSDCBalance(publicKey)`: Check USDC balance
  - `getTransactionStatus(hash)`: Poll transaction status

### 6. STYLING & THEME

#### Color Palette
- Primary Green: `#22c55e` (YES, bids, buy)
- Primary Red: `#ef4444` (NO, asks, sell)
- Dark Background: `#0f172a` (slate-950)
- Card Background: `#1e293b` (slate-800)
- Text Primary: `#f1f5f9` (slate-100)
- Text Secondary: `#cbd5e1` (slate-300)
- Border: `#334155` (slate-700)

#### Typography
- Font Family: System sans-serif
- Headings: Bold, white, 2xl-6xl
- Body: Medium weight, slate-300
- Monospace: For prices and addresses

#### Spacing
- Card padding: 24px (6 units)
- Section padding: 48px vertical, 16-32px horizontal
- Grid gaps: 24px

#### Components
- `.card`: Gray slate background, border, rounded, shadow
- `.btn-primary`: Green gradient, hover state
- `.btn-secondary`: Gray slate
- `.btn-danger`: Red background
- `.input`: Full width, dark background, focus state
- `.badge`: Inline pills with color variants
- `.price-yes/.price-no`: Text colors for prices

#### Animations
- `fadeIn`: Opacity and slide from bottom
- `pulse-gentle`: Subtle opacity pulse
- Transitions: 200ms default duration

#### Responsive
- Mobile first
- Breakpoints: sm (640), md (768), lg (1024)
- Column adjustments per breakpoint
- Touch-friendly tap targets (48px minimum)

### 7. PAGES & ROUTES

#### `/`
- Home page
- Market browsing and discovery
- Search and filtering

#### `/markets/[id]`
- Single market trading interface
- Real-time order book
- Price charts and history
- Order placement

#### `/portfolio`
- User positions and holdings
- Open orders management
- Trade history review
- P&L tracking

### 8. RESPONSIVE BREAKPOINTS

- **Mobile (< 640px)**
  - Single column layouts
  - Hamburger menu
  - Full-width cards
  - Stacked components

- **Tablet (640px - 1024px)**
  - 2-3 column grids
  - Adjusted spacing
  - Side-by-side components

- **Desktop (1024px+)**
  - Full multi-column layouts
  - Sidebar patterns
  - Maximum content width
  - Horizontal navigation

## Performance Features

- Lazy loading of components
- Image optimization (via Next.js)
- Code splitting per route
- SWR caching and deduplication
- WebSocket instead of polling
- Memoized components
- Efficient re-renders

## Accessibility

- Semantic HTML
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus indicators
- Color contrast compliance
- Headless UI components (accessible)

## Browser Features

- LocalStorage for user preferences
- WebSocket for real-time updates
- Responsive images
- CSS Grid and Flexbox layouts
- CSS custom properties for theming
- Modern JavaScript (ES2020+)
