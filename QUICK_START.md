# Quick Start Guide

## Project Structure

```
stellar-predict/
└── contracts/
    └── prediction-market/
        ├── Cargo.toml              # Dependencies
        ├── src/
        │   ├── lib.rs              # Main contract + public API
        │   ├── market.rs            # Market lifecycle
        │   ├── token.rs             # Token minting/redemption
        │   ├── resolution.rs        # Resolution & oracle
        │   ├── admin.rs             # Admin functions
        │   ├── types.rs             # Data structures
        │   └── errors.rs            # Error types
        ├── README.md                # Technical documentation
        ├── ARCHITECTURE.md          # Design & architecture
        ├── EXAMPLES.md              # Usage examples
        └── IMPLEMENTATION_SUMMARY.md # Summary & checklist
```

## Quick Reference

### Initialize Contract
```rust
PredictionMarketContract::initialize(env, admin_address)?;
```

### Create a Market
```rust
let market_id = PredictionMarketContract::create_market(
    env,
    admin,
    "Will BTC reach $100k?",
    "Requires $100k on any major exchange",
    vec!["YES", "NO"],
    resolution_time_timestamp,
    usdc_token_address,
)?;
```

### Mint Outcome Tokens
```rust
// User deposits 100 USDC, gets 100 YES + 100 NO
PredictionMarketContract::mint_outcome_tokens(
    env,
    user_address,
    market_id,
    100,  // amount
)?;
```

### Check User Balance
```rust
let yes_balance = PredictionMarketContract::get_user_outcome_balance(
    env,
    user_address,
    market_id,
    0,  // outcome_index (0=YES, 1=NO)
);
```

### Resolve Market
```rust
// Step 1: Propose (admin only, after resolution_time)
PredictionMarketContract::propose_resolution(
    env, admin, market_id, 0  // outcome_index
)?;

// Step 2: (Optional) Challenge during dispute window
PredictionMarketContract::challenge_resolution(
    env, challenger_address, market_id
)?;

// Step 3: Finalize (anyone, after dispute window expires)
PredictionMarketContract::finalize_resolution(env, market_id)?;
```

### Redeem Tokens
```rust
// Redeem winning tokens (after resolution)
let returned = PredictionMarketContract::redeem_winning_tokens(
    env, user_address, market_id
)?;

// Or: Redeem complete set (anytime)
PredictionMarketContract::redeem_complete_set(
    env, user_address, market_id, 100  // amount
)?;
```

## Common Workflows

### User Perspective

**1. Mint and Hold**
```
User deposits collateral → Gets outcome tokens → Holds until resolution
```

**2. Mint, Trade, Redeem**
```
User deposits collateral → Gets outcome tokens →
Trades on secondary market → Redeems complete set at parity
```

**3. Profit on Resolution**
```
User deposits collateral → Gets outcome tokens →
Outcome resolves in user's favor → Redeems winning tokens for profit
```

### Admin Perspective

**1. Create & Monitor**
```
Admin creates market → Monitors until resolution_time → Proposes outcome
```

**2. Emergency Response**
```
Detect issue → emergency_pause_all() → Investigate →
emergency_resume_all() or deploy new contract
```

**3. Configuration**
```
set_dispute_window(7_days) → Create important market
set_dispute_window(1_day)  → Create casual market
```

## Key Parameters

| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| dispute_window_secs | 86400 | 1 - 31536000 | Time for challenges |
| outcomes | - | 1 - 256 | Market options |
| description length | - | 1 - 1000 | Market rules |
| resolution_time | - | future | When market resolves |

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Unauthorized` | Not admin | Use admin account |
| `MarketNotOpen` | Market paused/resolved | `resume_market()` or create new market |
| `MarketNotFound` | Wrong market_id | Verify market ID |
| `InvalidOutcomeIndex` | Outcome doesn't exist | Check number of outcomes |
| `ResolutionTimeNotReached` | Too early to propose | Wait until resolution_time |
| `DisputeWindowNotExpired` | Dispute window active | Wait for window to pass |
| `InsufficientBalance` | User lacks tokens | `mint_outcome_tokens()` first |
| `TokenTransferFailed` | Transfer issue | Check token approval |
| `MarketPaused` | Emergency pause active | `emergency_resume_all()` |

## Testing Checklist

Before deploying to testnet:

- [ ] Contract compiles: `cargo build --release --target wasm32-unknown-unknown`
- [ ] Initialize works: Call `initialize(admin)`
- [ ] Market creation: Create test market with ~1 hour resolution
- [ ] Minting works: Mint from test user account
- [ ] Balance checking: Verify `get_user_outcome_balance()` returns correct amount
- [ ] Redemption: Redeem complete set without selling
- [ ] Resolution flow: Propose → dispute window → finalize
- [ ] Winning redemption: User with winning tokens redeems successfully
- [ ] Admin transfer: Transfer admin role to new account
- [ ] Pause/resume: Pause market → verify minting blocked → resume → mint works
- [ ] Emergency controls: Pause all → resume all
- [ ] Dispute window: Propose → challenge → verify status

## Testnet Deployment

```bash
# 1. Build
cd contracts/prediction-market
cargo build --release --target wasm32-unknown-unknown
# Output: target/wasm32-unknown-unknown/release/prediction_market.wasm

# 2. Deploy to testnet
# (Use Soroban CLI or your deployment tool)
soroban contract deploy \
  --network testnet \
  --source account_name \
  ./target/wasm32-unknown-unknown/release/prediction_market.wasm

# 3. Initialize
soroban contract invoke \
  --network testnet \
  --source account_name \
  --id CONTRACT_ID \
  -- initialize \
  --admin ADMIN_ADDRESS

# 4. Test market creation
soroban contract invoke \
  --network testnet \
  --source account_name \
  --id CONTRACT_ID \
  -- create_market \
  --admin ADMIN_ADDRESS \
  --question "Test question?" \
  --description "Test description" \
  --outcomes '["YES", "NO"]' \
  --resolution_time TIMESTAMP \
  --collateral_token USDC_ADDRESS
```

## Gas Estimation

Typical Soroban gas costs (in stroops):

- initialize: 1,000 - 1,500
- create_market: 2,000 - 3,000
- mint_outcome_tokens: 1,000 - 2,000
- redeem_complete_set: 1,200 - 1,800
- propose_resolution: 800 - 1,200
- challenge_resolution: 500 - 800
- finalize_resolution: 1,500 - 2,000
- redeem_winning_tokens: 1,000 - 1,500

**Batch operations** (multiple users): Scale linearly with number of operations.

## Documentation Map

- **README.md** - Full technical specification
- **ARCHITECTURE.md** - Design, data flow, state machines
- **EXAMPLES.md** - 7 real-world usage scenarios
- **IMPLEMENTATION_SUMMARY.md** - Deployment checklist & summary

## Next Steps

1. Review `README.md` for full specification
2. Study `EXAMPLES.md` for common patterns
3. Check `ARCHITECTURE.md` for system design
4. Compile and test locally with Soroban SDK
5. Deploy to testnet
6. Monitor for 2-3 market cycles
7. Deploy to mainnet

## Support & Maintenance

- Monitor resolution proposals for stuck markets
- Track dispute window completions
- Watch for challenged resolutions
- Plan upgrades using versioning (v1, v2, etc.)
- Archive old contracts after migration

## Key Contacts

When deploying, document:
- Contract address: _______
- Admin address: _______
- Initial markets: _______
- Deployment date: _______
- Soroban network: _______
