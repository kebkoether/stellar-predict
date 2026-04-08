# Architecture & Design

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  Prediction Market Contract                      │
│                    (Soroban Smart Contract)                      │
└─────────────────────────────────────────────────────────────────┘
         │                       │                     │
         ▼                       ▼                     ▼
    ┌─────────┐          ┌──────────────┐      ┌──────────────┐
    │  Users  │          │ Admin/DAO    │      │ Resolution   │
    │ Minting │          │  Functions   │      │   Oracle     │
    │Redeeming│          │              │      │              │
    └─────────┘          └──────────────┘      └──────────────┘
         │                       │                     │
         └───────────────────────┼─────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ Market.rs (Lifecycle)   │
                    │ ─────────────────────   │
                    │ • create_market()       │
                    │ • get_market()          │
                    │ • list_markets()        │
                    │ • set_market_status()   │
                    │ • resolve_market()      │
                    └────────────┬────────────┘
                                 │
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
         ┌──────────────┐ ┌────────────┐ ┌─────────────────┐
         │ Token.rs     │ │ Admin.rs   │ │ Resolution.rs   │
         │ ────────────  │ │ ──────────  │ │ ────────────────│
         │ • mint()     │ │ • pause()  │ │ • propose()    │
         │ • burn()     │ │ • resume() │ │ • challenge()  │
         │ • redeem()   │ │ • cancel() │ │ • finalize()   │
         │ • balance()  │ │ • set_admin│ │ • check_status()
         │              │ │ • kill_sw  │ │                 │
         └──────────────┘ │            │ └─────────────────┘
                          └────────────┘
                                 │
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
         ┌──────────────┐ ┌──────────────┐ ┌────────────┐
         │ Types.rs     │ │ Errors.rs    │ │ Config     │
         │ ────────────  │ │ ────────────  │ │ ──────────│
         │ MarketStatus │ │ 32 Errors    │ │ Dispute   │
         │ MarketInfo   │ │              │ │ Window    │
         │ Resolution   │ │              │ │ Emergency │
         │ StorageKey   │ │              │ │ Pause     │
         └──────────────┘ └──────────────┘ └────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ Soroban Persistent      │
                    │ Storage (Stellar Ledger)│
                    └─────────────────────────┘
```

## Module Dependencies

```
lib.rs (Main Contract)
├── admin.rs
│   ├── market.rs
│   │   ├── types.rs
│   │   └── errors.rs
│   └── types.rs
│
├── resolution.rs
│   ├── market.rs
│   │   ├── types.rs
│   │   └── errors.rs
│   └── types.rs
│
├── token.rs
│   ├── market.rs
│   │   ├── types.rs
│   │   └── errors.rs
│   └── types.rs
│
├── market.rs
│   ├── types.rs
│   └── errors.rs
│
├── types.rs
└── errors.rs
```

**Dependency Hierarchy** (no circular dependencies):
1. `errors.rs` - Standalone
2. `types.rs` - Depends on errors
3. `market.rs` - Depends on errors, types
4. `token.rs` - Depends on errors, types, market
5. `resolution.rs` - Depends on errors, types, market
6. `admin.rs` - Depends on errors, types, market
7. `lib.rs` - Depends on all modules

## Data Flow: Creating a Market

```
User → PredictionMarketContract::create_market()
         │
         └─→ Validate admin authorization
             └─→ Validate inputs (outcomes, description, time)
                 └─→ Increment MarketCounter
                     └─→ Store MarketInfo in persistent storage
                         └─→ Store empty Resolution for market
                             └─→ Return market_id
```

## Data Flow: Minting Tokens

```
User → PredictionMarketContract::mint_outcome_tokens()
         │
         └─→ Check emergency pause
             └─→ Fetch market (validate exists)
                 └─→ Validate market is Open
                     └─→ Transfer collateral from user → contract
                         └─→ For each outcome:
                             Mint tokens in TokenBalance
                                 └─→ Update TokenBalance(user, market_id, outcome_i)
```

## Data Flow: Resolution

```
┌─ Admin proposes outcome ──┐
│                           │
└──→ propose_resolution()   │
    │                       │
    ├─ Check time reached   │
    ├─ Validate outcome_idx │
    └─ Create Resolution    │
       state = Proposed     │
       challenge_deadline = │
       now + dispute_window │
       │
       └─→ Dispute Window Starts (24 hours default)
           │
           ├─ Anyone can challenge()
           │  └─ Sets status = Challenged
           │
           └─ After window expires:
              ├─ If Challenged: Cannot finalize (admin override needed)
              │
              └─ If Proposed: finalize_resolution()
                 ├─ Set status = Finalized
                 ├─ Call resolve_market()
                 │  └─ market.status = Resolved
                 │     market.resolved_outcome = outcome_idx
                 │
                 └─ Users can now redeem_winning_tokens()
                    └─ Burn winning tokens → return collateral
```

## Storage Layout

### Key Structure

```rust
pub enum StorageKey {
    // Admin
    Admin,                              // → Address

    // Markets
    MarketCounter,                      // → u64
    Market(u64),                        // → MarketInfo

    // Resolution
    Resolution(u64),                    // → Resolution

    // Token Balances
    TokenBalance(Address, u64, u32),    // → i128
                      ↑      ↑   ↑
                    user   mkt outcome

    // Config
    Config,                             // → Config
}
```

### Storage Persistence

| Key Type | Write When | Expire When |
|----------|-----------|------------|
| Admin | Initialize | Never |
| MarketCounter | New market | Never |
| Market(id) | Create market | Never (archived) |
| Resolution(id) | Propose resolution | Never (archived) |
| TokenBalance | Mint/burn | Zero removed |
| Config | Admin changes | Never |

## Market State Machine

```
        ┌─────────────┐
        │   Open      │ ← Initial state
        └─────────────┘
          │         │
          │         │ pause_market()
          │         ▼
          │      ┌─────────────┐
          │      │   Paused    │
          │      └─────────────┘
          │         │
          │         │ resume_market()
          │         ▼
          │      ┌─────────────┐
          │      │   Open      │
          │      └─────────────┘
          │
          │ propose_resolution()
          │ + finalize_resolution()
          │
          ▼
     ┌─────────────┐
     │  Resolved   │ ← Can redeem winning tokens
     └─────────────┘
             ▲
             │
             └─ Only reachable after dispute window

        ┌─────────────┐
        │  Cancelled  │ ← From Open/Paused (requires refund)
        └─────────────┘
```

## Resolution State Machine

```
     ┌──────────────────┐
     │   Unresolved     │ ← Initial state
     └──────────────────┘
              │
              │ propose_resolution()
              ▼
     ┌──────────────────┐
     │   Proposed       │ ← Dispute window open
     └──────────────────┘
         │            │
    challenge()   (dispute window
         │        expires)
         │            │
         ▼            ▼
     ┌──────────┐  ┌────────────┐
     │Challenged│  │ Finalized  │
     └──────────┘  └────────────┘
         │              │
         │              └─→ Market resolved
         │                  Users can redeem
         │
         └─→ Cannot finalize
             (requires manual admin
              action in upgrade)
```

## Access Control Matrix

| Function | Contract Admin | Market Admin | Any User | Time Requirement |
|----------|:──────────────:|:───────────:|:--------:|:---------------:|
| create_market | ✓ | - | - | - |
| pause_market | ✓ | - | - | - |
| resume_market | ✓ | - | - | - |
| cancel_market | ✓ | - | - | - |
| set_admin | ✓ | - | - | - |
| propose_resolution | ✓ | - | - | ≥ resolution_time |
| challenge_resolution | - | - | ✓ | ≤ challenge_deadline |
| finalize_resolution | - | - | ✓ | > challenge_deadline |
| mint_outcome_tokens | - | - | ✓ | market is Open |
| redeem_complete_set | - | - | ✓ | has balance |
| redeem_winning_tokens | - | - | ✓ | market Resolved |
| emergency_pause_all | ✓ | - | - | - |
| emergency_resume_all | ✓ | - | - | - |

## Error Propagation

```
User Action
    │
    ├─→ Input Validation
    │   ├─ EmptyOutcomes
    │   ├─ InvalidOutcomeIndex
    │   ├─ InvalidResolutionTime
    │   └─ InvalidTokenAmount
    │
    ├─→ Authorization Check
    │   ├─ Unauthorized
    │   └─ InvalidAdmin
    │
    ├─→ Market State Check
    │   ├─ MarketNotFound
    │   ├─ MarketNotOpen
    │   ├─ MarketPaused (emergency)
    │   ├─ MarketAlreadyResolved
    │   └─ InvalidMarketStatus
    │
    ├─→ Token Operation
    │   ├─ InsufficientBalance
    │   ├─ InsufficientCollateral
    │   └─ TokenTransferFailed
    │
    ├─→ Resolution Flow
    │   ├─ ResolutionTimeNotReached
    │   ├─ ResolutionAlreadyProposed
    │   ├─ DisputeWindowExpired
    │   ├─ DisputeWindowNotExpired
    │   ├─ ResolutionNotProposed
    │   └─ ResolutionInDispute
    │
    └─→ System Errors
        ├─ OperationFailed
        ├─ DataSerializationFailed
        └─ InternalError

Result<T, PredictionMarketError>
```

## Concurrency & Safety

Soroban provides:
- **Atomic Execution**: All contract calls are atomic (all-or-nothing)
- **No Concurrent Calls**: Contract calls are serialized by the network
- **No Reentrancy**: Can't reenter contract during execution

Storage operations:
- **ACID Properties**: Guaranteed by Soroban ledger
- **Optimistic Locking**: Each ledger entry has version
- **Conflict Detection**: Network rejects conflicting writes

## Performance Characteristics

| Operation | Time Complexity | Storage |
|-----------|:---------------:|:-------:|
| create_market | O(outcomes) | O(outcomes) |
| get_market | O(1) | - |
| list_markets | O(num_markets) | - |
| mint_outcome_tokens | O(outcomes) | O(outcomes) |
| redeem_complete_set | O(outcomes) | O(outcomes) |
| redeem_winning_tokens | O(1) | O(1) |
| propose_resolution | O(1) | O(1) |
| challenge_resolution | O(1) | O(1) |
| finalize_resolution | O(1) | O(1) |
| get_balance | O(1) | - |

## Security Analysis

### Threats & Mitigations

| Threat | Mitigation |
|--------|-----------|
| Admin creates bad market | Admin vetting, transparent rules |
| Oracle proposes wrong outcome | Dispute window + community challenge |
| User mints without approval | Token SDK handles approval checking |
| User redeems without balance | Balance check before burn |
| Double-spend on secondary market | Tokens are fungible, not unique |
| Contract pause prevents all operations | Emergency pause keeps redemptions open |
| Resolution challenges locked forever | Could add time-bound challenge window |
| Admin key compromised | Implement multi-sig for future |

### Code Safety

- No unsafe blocks
- No integer overflow (checked arithmetic)
- No storage allocation attacks (bounded vectors)
- No reentrancy (Soroban serializes calls)
- No unauthorized access (explicit checks)

## Testing Strategy

### Unit Tests
- Market creation with edge cases
- Token balance operations
- Resolution state transitions
- Access control checks

### Integration Tests
- Full market lifecycle: create → mint → resolve → redeem
- Multiple users trading tokens
- Challenge during dispute window
- Emergency pause and resume

### Scenario Tests
- Binary market (2 outcomes)
- Multi-outcome market (3-5 outcomes)
- Concurrent minting
- Dispute window edge cases
- Admin transitions

### Property Tests
- Market counter monotonically increases
- Token balance invariants
- Storage is consistent after operations
