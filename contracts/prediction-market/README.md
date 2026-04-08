# Prediction Market Smart Contract

A production-quality Soroban smart contract for a decentralized prediction market platform on the Stellar network.

## Overview

This contract implements a complete prediction market system with the following capabilities:

- **Market Creation**: Create binary or multi-outcome prediction markets
- **Token Minting**: Users deposit collateral to receive outcome tokens (1 collateral = 1 of each outcome)
- **Redemption**: Redeem complete sets without trading or redeem winning tokens after resolution
- **Resolution**: Multi-step resolution process with dispute window to prevent bad resolutions
- **Admin Controls**: Pause markets, cancel markets, transfer admin role, emergency kill switch
- **Configuration**: Adjustable dispute window duration

## Architecture

### Modules

1. **lib.rs** - Main contract entry point with public API
2. **market.rs** - Market lifecycle and storage management
3. **token.rs** - Outcome token minting, burning, and balance tracking
4. **resolution.rs** - Oracle mechanism with dispute window
5. **admin.rs** - Admin functions and access control
6. **types.rs** - Shared data structures
7. **errors.rs** - Custom error types

### Data Model

```
Market (Open → Paused → Resolved/Cancelled)
├── outcomes: Vec<String>
├── created_at: timestamp
├── resolution_time: timestamp
├── collateral_token: Address
└── Resolution (Unresolved → Proposed → Challenged/Finalized)
    └── dispute_window: configurable duration
```

**Token Balances**: `TokenBalance(user, market_id, outcome_index) → balance`

## Key Features

### 1. Market Creation

```rust
create_market(
    admin,
    "Will BTC reach $100k by EOY?",
    "Bitcoin reaches $100,000 USD on any major exchange",
    vec!["YES", "NO"],
    resolution_time: 1735689600,
    collateral_token: usdc_address
) → market_id
```

**Validations**:
- Admin must be the contract admin
- Outcomes: 1-256 outcomes allowed
- Resolution time must be in the future
- Description: 1-1000 characters

### 2. Token Minting & Redemption

**Minting**:
```rust
mint_outcome_tokens(user, market_id, 100)
// User deposits 100 USDC
// Receives: 100 YES tokens + 100 NO tokens
```

**Complete Set Redemption** (no selling needed):
```rust
redeem_complete_set(user, market_id, 100)
// Burns 100 of each outcome token
// Returns 100 USDC to user
```

**Winning Token Redemption** (after resolution):
```rust
redeem_winning_tokens(user, market_id)
// Burns all winning outcome tokens
// Returns 1:1 USDC collateral
```

### 3. Resolution Process

**Step 1: Propose Resolution**
```rust
propose_resolution(admin, market_id, outcome_index=0)
// Market must have reached resolution_time
// Starts 24-hour (default) dispute window
```

**Step 2: Challenge (optional)**
```rust
challenge_resolution(challenger, market_id)
// Any user can challenge during dispute window
// Marks resolution as "Challenged"
```

**Step 3: Finalize**
```rust
finalize_resolution(market_id)
// Called after dispute window expires
// Cannot finalize if challenged (requires admin override)
// Locks in resolution and enables redemption
```

### 4. Admin Controls

**Market Lifecycle**:
```rust
pause_market(admin, market_id)      // Freeze token minting
resume_market(admin, market_id)     // Allow minting again
cancel_market(admin, market_id)     // Mark market as cancelled
```

**System Controls**:
```rust
set_admin(current, new_admin)       // Transfer admin role
emergency_pause_all(admin)          // Kill switch - pause all markets
emergency_resume_all(admin)         // Lift emergency pause
set_dispute_window(admin, secs)     // Change default window (1-365 days)
```

## Access Control

| Function | Requires |
|----------|----------|
| `create_market` | Contract Admin |
| `propose_resolution` | Contract Admin + resolution time reached |
| `pause_market` / `resume_market` | Contract Admin |
| `cancel_market` | Contract Admin |
| `set_admin` | Current Admin |
| `finalize_resolution` | Anyone (after dispute window) |
| `challenge_resolution` | Anyone (during dispute window) |
| `mint_outcome_tokens` | Market Open status |
| `redeem_*` | User owns tokens |

## Error Handling

All operations return `Result<T, PredictionMarketError>` with 32+ specific error variants:

- **Authorization**: `Unauthorized`, `InvalidAdmin`
- **Market**: `MarketNotFound`, `MarketNotOpen`, `MarketAlreadyResolved`
- **Token**: `InsufficientBalance`, `InvalidTokenAmount`, `TokenTransferFailed`
- **Resolution**: `ResolutionNotProposed`, `DisputeWindowExpired`, `ResolutionInDispute`
- **Input Validation**: `EmptyOutcomes`, `InvalidOutcomeCount`, `InvalidResolutionTime`

## Storage

Storage is organized by key type:

```rust
// Admin
StorageKey::Admin → Address

// Markets
StorageKey::MarketCounter → u64
StorageKey::Market(id) → MarketInfo
StorageKey::Resolution(id) → Resolution

// Token balances (user, market_id, outcome_index)
StorageKey::TokenBalance(Address, u64, u32) → i128

// Config
StorageKey::Config → Config { dispute_window_secs, emergency_paused }
```

## Building

```bash
cargo build --release --target wasm32-unknown-unknown
```

## Testing

The contract uses Soroban's testing framework:

```bash
cargo test
```

## Security Considerations

1. **Access Control**: All privileged operations require admin authorization
2. **State Validation**: Market status is checked before operations
3. **Dispute Window**: Multi-step resolution prevents oracle manipulation
4. **Emergency Pause**: Kill switch to freeze all operations
5. **Input Validation**: All market creation inputs validated
6. **Token Safety**: Uses Soroban's token SDK for safe transfers

## Production Deployment

1. **Initialize**: Call `initialize(admin_address)` once
2. **Test Markets**: Create test markets with near-term resolution times
3. **Monitor**: Watch for resolution proposals and challenges
4. **Upgrade Path**: None - use contract-0 and contract-1 pattern for upgrades

## Gas Costs (Estimated)

| Operation | Cost (stroops) |
|-----------|---|
| create_market | ~2000-3000 |
| mint_outcome_tokens | ~1000-2000 |
| propose_resolution | ~800-1200 |
| finalize_resolution | ~1500-2000 |
| redeem_winning_tokens | ~1000-1500 |

## Future Enhancements

1. **Decentralized Resolution**: Replace admin-only proposal with DAO voting
2. **Liquidity Pools**: Automated market maker for outcome token trading
3. **Market Shares**: Allow creating sub-markets based on time ranges
4. **Conditional Markets**: Markets that resolve based on other market outcomes
5. **Multi-sig Admin**: Require multiple signatures for admin operations
6. **Escaped Liquidity**: Automated refunds if market is never resolved
