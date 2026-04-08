use soroban_sdk::{contracttype, Address, String as SorobanString, Vec};

/// Market status enumeration.
/// - Open: Market is active, users can mint tokens
/// - Paused: Market is paused by admin, no new minting allowed
/// - Resolved: Market has been resolved and winning tokens can be redeemed
/// - Cancelled: Market was cancelled, collateral returned
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[contracttype]
pub enum MarketStatus {
    Open = 0,
    Paused = 1,
    Resolved = 2,
    Cancelled = 3,
}

/// Resolution status for a proposed resolution.
/// - Unresolved: No resolution proposed yet
/// - Proposed: Resolution proposed, in dispute window
/// - Challenged: Resolution was challenged, awaiting finalization review
/// - Finalized: Resolution is final and locked in
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[contracttype]
pub enum ResolutionStatus {
    Unresolved = 0,
    Proposed = 1,
    Challenged = 2,
    Finalized = 3,
}

/// Complete information about a market.
#[derive(Clone, Debug)]
#[contracttype]
pub struct MarketInfo {
    pub id: u64,
    pub admin: Address,
    pub question: SorobanString,
    pub description: SorobanString,
    pub outcomes: Vec<SorobanString>,
    pub status: MarketStatus,
    pub created_at: u64,
    pub resolution_time: u64,
    pub collateral_token: Address,
    pub resolved_outcome: Option<u32>,
}

/// Resolution information for a market.
#[derive(Clone, Debug)]
#[contracttype]
pub struct Resolution {
    pub market_id: u64,
    pub proposed_outcome: Option<u32>,
    pub proposer: Option<Address>,
    pub status: ResolutionStatus,
    pub proposed_at: Option<u64>,
    pub challenge_deadline: Option<u64>,
}

/// User's outcome token balance for a specific outcome in a market.
#[derive(Clone, Debug)]
#[contracttype]
pub struct OutcomeTokenBalance {
    pub user: Address,
    pub market_id: u64,
    pub outcome_index: u32,
    pub balance: i128,
}

/// Storage key types for contract state.
#[derive(Clone, Debug)]
#[contracttype]
pub enum StorageKey {
    // Admin address
    Admin,

    // Market state
    MarketCounter,
    Market(u64),
    MarketList,

    // Token balances: (user, market_id, outcome_index)
    TokenBalance(Address, u64, u32),

    // Resolution state
    Resolution(u64),

    // Emergency pause flag
    EmergencyPaused,

    // Configuration
    Config,
}

/// Global contract configuration.
#[derive(Clone, Debug)]
#[contracttype]
pub struct Config {
    pub dispute_window_secs: u64,
    pub emergency_paused: bool,
}

impl Config {
    /// Creates a new config with default dispute window of 24 hours (86400 seconds).
    pub fn new() -> Self {
        Config {
            dispute_window_secs: 86400,
            emergency_paused: false,
        }
    }
}
