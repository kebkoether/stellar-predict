# Usage Examples

## Scenario 1: Creating and Trading a Simple Binary Market

### Step 1: Initialize the Contract

```rust
// Initialize with an admin account
let admin = Address::generate(&env);
PredictionMarketContract::initialize(&env, admin.clone())?;
```

### Step 2: Create a Binary Market

```rust
let market_id = PredictionMarketContract::create_market(
    env.clone(),
    admin.clone(),
    SorobanString::from_str(&env, "Will Bitcoin reach $100k by EOY 2025?"),
    SorobanString::from_str(&env, "Bitcoin must reach $100,000 USD on any major exchange"),
    vec![
        SorobanString::from_str(&env, "YES"),
        SorobanString::from_str(&env, "NO"),
    ],
    1735689600,  // Dec 31, 2025 midnight UTC
    usdc_address.clone(),
)?;
// Returns market_id = 1
```

### Step 3: Users Mint Outcome Tokens

**Alice buys 100 YES tokens:**
```rust
let alice = Address::generate(&env);

// Alice approves 100 USDC to the contract
usdc_token.approve(
    &alice,
    &contract_address,
    &100,
    &None,
)?;

// Alice mints tokens - spends 100 USDC, gets 100 YES + 100 NO
PredictionMarketContract::mint_outcome_tokens(
    env.clone(),
    alice.clone(),
    1,      // market_id
    100,    // 100 USDC
)?;

// Alice's balances:
// YES: 100
// NO:  100
```

**Bob buys 200 YES tokens:**
```rust
let bob = Address::generate(&env);

usdc_token.approve(
    &bob,
    &contract_address,
    &200,
    &None,
)?;

PredictionMarketContract::mint_outcome_tokens(
    env.clone(),
    bob.clone(),
    1,      // market_id
    200,    // 200 USDC
)?;

// Bob's balances:
// YES: 200
// NO:  200
```

### Step 4: Secondary Market Trading

*(Not handled by contract, but tokens can be traded on external AMMs)*

After trading on a secondary market:
- Alice ends up with 150 YES, 50 NO
- Bob ends up with 150 NO, 200 YES (he sold his NO tokens)

### Step 5: Market Resolution

**On December 31, 2025 at midnight:**

Admin proposes YES won:
```rust
PredictionMarketContract::propose_resolution(
    env.clone(),
    admin.clone(),
    1,              // market_id
    0,              // outcome_index (0 = YES)
)?;
```

The market enters a 24-hour dispute window. If challenged:

```rust
let challenger = Address::generate(&env);

PredictionMarketContract::challenge_resolution(
    env.clone(),
    challenger.clone(),
    1,  // market_id
)?;
```

After 24 hours (or immediately if no challenge), finalize:
```rust
PredictionMarketContract::finalize_resolution(
    env.clone(),
    1,  // market_id
)?;
```

### Step 6: Redemption

**Alice redeems winning tokens:**
```rust
let returned = PredictionMarketContract::redeem_winning_tokens(
    env.clone(),
    alice.clone(),
    1,  // market_id
)?;
// Returns 150 USDC (she had 150 YES tokens)

// Alice's final:
// Spent: 100 USDC
// Got:   150 USDC
// Profit: 50 USDC (50% return)
```

**Bob loses:**
```rust
let returned = PredictionMarketContract::redeem_winning_tokens(
    env.clone(),
    bob.clone(),
    1,  // market_id
)?;
// Returns 200 USDC (he had 200 YES tokens)

// Bob's final:
// Spent: 200 USDC
// Got:   200 USDC
// Profit: 0 (he traded away his YES before resolution)
```

---

## Scenario 2: Using Complete Set Redemption

User wants to exit their position without selling:

```rust
let charlie = Address::generate(&env);

// Charlie mints 50 outcome tokens
PredictionMarketContract::mint_outcome_tokens(
    env.clone(),
    charlie.clone(),
    1,  // market_id
    50, // 50 USDC
)?;

// Charlie has 50 YES + 50 NO

// Charlie decides markets are too uncertain, wants out
PredictionMarketContract::redeem_complete_set(
    env.clone(),
    charlie.clone(),
    1,  // market_id
    50, // redeem all 50 sets
)?;

// Charlie gets 50 USDC back, no profit/loss
```

**Benefit**: No need to wait for secondary market buyers. Instant exit at parity.

---

## Scenario 3: Multi-Outcome Market (3-Way)

### Create Market

```rust
let market_id = PredictionMarketContract::create_market(
    env.clone(),
    admin.clone(),
    SorobanString::from_str(&env, "Who will win the 2026 presidential election?"),
    SorobanString::from_str(&env, "Winner is determined by US electoral votes"),
    vec![
        SorobanString::from_str(&env, "Candidate A"),
        SorobanString::from_str(&env, "Candidate B"),
        SorobanString::from_str(&env, "Candidate C"),
    ],
    1768082400,  // Jan 1, 2027
    usdc_address.clone(),
)?;
// Returns market_id = 2
```

### Users Mint

```rust
let trader1 = Address::generate(&env);

// Trader1 deposits 100 USDC
PredictionMarketContract::mint_outcome_tokens(
    env.clone(),
    trader1.clone(),
    2,      // market_id
    100,    // 100 USDC
)?;

// Trader1 gets:
// Candidate A: 100
// Candidate B: 100
// Candidate C: 100
```

### Resolution

```rust
// Candidate B wins
PredictionMarketContract::propose_resolution(
    env.clone(),
    admin.clone(),
    2,  // market_id
    1,  // outcome_index (Candidate B)
)?;

// ... wait dispute window ...

PredictionMarketContract::finalize_resolution(
    env.clone(),
    2,  // market_id
)?;

// Trader1 redeems
let returned = PredictionMarketContract::redeem_winning_tokens(
    env.clone(),
    trader1.clone(),
    2,  // market_id
)?;
// Returns 100 USDC (Candidate B tokens)
```

---

## Scenario 4: Emergency Pause (Black Swan Event)

Contract admin discovers a critical issue:

```rust
// Pause all markets globally
PredictionMarketContract::emergency_pause_all(
    env.clone(),
    admin.clone(),
)?;

// Users can NO LONGER mint new tokens
// Attempting to mint will fail with MarketPaused error

// But users CAN redeem what they already have:
PredictionMarketContract::redeem_complete_set(
    env.clone(),
    user.clone(),
    1,
    50,
)?; // Still works - users can exit safely

// After fix is deployed
PredictionMarketContract::emergency_resume_all(
    env.clone(),
    admin.clone(),
)?;

// Markets are open again
```

---

## Scenario 5: Admin Transfer

Current admin wants to hand over control:

```rust
let new_admin = Address::generate(&env);

PredictionMarketContract::set_admin(
    env.clone(),
    current_admin.clone(),
    new_admin.clone(),
)?;

// new_admin can now:
// - Create markets
// - Pause/resume markets
// - Propose resolutions
// - Change the admin again
// - Use emergency controls
```

---

## Scenario 6: Configurable Dispute Window

Default is 24 hours (86400 seconds). Admin customizes:

```rust
// Change to 1 week for very important markets
PredictionMarketContract::set_dispute_window(
    env.clone(),
    admin.clone(),
    604800,  // 7 days in seconds
)?;

// Next resolution proposed will have 7-day dispute window

// Get current setting
let window = PredictionMarketContract::get_dispute_window(env.clone());
assert_eq!(window, 604800);

// Change back to 24 hours for fast markets
PredictionMarketContract::set_dispute_window(
    env.clone(),
    admin.clone(),
    86400,
)?;
```

---

## Scenario 7: Checking Market State

### Query Market Info

```rust
let market = PredictionMarketContract::get_market(env.clone(), 1)?;

// Access:
// market.id = 1
// market.question = "Will Bitcoin reach $100k..."
// market.outcomes = ["YES", "NO"]
// market.status = MarketStatus::Open
// market.created_at = <timestamp>
// market.resolution_time = 1735689600
// market.collateral_token = <USDC address>
// market.resolved_outcome = None (before resolution)
```

### List All Markets

```rust
let all_markets = PredictionMarketContract::list_markets(env.clone());

for market in all_markets {
    println!("Market {}: {}", market.id, market.question);
    println!("  Status: {:?}", market.status);
    println!("  Outcomes: {} options", market.outcomes.len());
}
```

### Query Resolution Status

```rust
let (proposed_outcome, status) = PredictionMarketContract::get_resolution_status(
    env.clone(),
    1,  // market_id
)?;

// Check dispute window countdown
let remaining_secs = PredictionMarketContract::get_dispute_window_remaining(
    env.clone(),
    1,  // market_id
)?;

println!("Dispute window expires in {} seconds", remaining_secs);
```

### Check User Balance

```rust
let balance_yes = PredictionMarketContract::get_user_outcome_balance(
    env.clone(),
    alice.clone(),
    1,      // market_id
    0,      // outcome_index (YES)
)?;

let balance_no = PredictionMarketContract::get_user_outcome_balance(
    env.clone(),
    alice.clone(),
    1,      // market_id
    1,      // outcome_index (NO)
)?;

println!("Alice: {} YES, {} NO", balance_yes, balance_no);
```

---

## Error Handling Examples

```rust
// Attempting to mint in paused market
match PredictionMarketContract::mint_outcome_tokens(
    env.clone(),
    user.clone(),
    1,
    100,
) {
    Ok(_) => println!("Success"),
    Err(PredictionMarketError::MarketPaused) => {
        println!("Market is paused");
    }
    Err(e) => {
        println!("Other error: {:?}", e);
    }
}

// Invalid outcome index
match PredictionMarketContract::propose_resolution(
    env.clone(),
    admin.clone(),
    1,
    999,  // Too high
) {
    Err(PredictionMarketError::InvalidOutcomeIndex) => {
        println!("Outcome 999 doesn't exist");
    }
    _ => {}
}

// Redeeming before dispute window expires
match PredictionMarketContract::finalize_resolution(env.clone(), 1) {
    Err(PredictionMarketError::DisputeWindowNotExpired) => {
        println!("Dispute window still active");
    }
    _ => {}
}
```

---

## Integration Notes

When integrating with a frontend or backend:

1. **Approve Collateral**: Always call token.approve() before mint_outcome_tokens()
2. **Cache Market List**: list_markets() is expensive; cache and update on events
3. **Monitor Resolution**: Watch get_resolution_status() to detect proposal/challenge
4. **Handle Time**: Use env.ledger().timestamp() to compare with resolution_time
5. **Manage Decimals**: Be aware of token decimals (USDC is 6 decimals)
6. **Emit Events**: Contract doesn't emit events; track state changes externally
