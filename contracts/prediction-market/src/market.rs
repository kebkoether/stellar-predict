use crate::errors::PredictionMarketError;
use crate::types::{Config, MarketInfo, MarketStatus, Resolution, ResolutionStatus, StorageKey};
use soroban_sdk::{Address, Env, String as SorobanString, Vec};

/// Creates a new prediction market.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - Address of the market admin who can pause/resolve
/// * `question` - The main question for the market (e.g., "Will BTC reach $100k by year end?")
/// * `description` - Detailed description of market rules
/// * `outcomes` - List of possible outcomes (e.g., vec!["YES", "NO"])
/// * `resolution_time` - Unix timestamp when market can be resolved
/// * `collateral_token` - Address of the collateral token contract (e.g., USDC)
///
/// # Returns
/// The newly created market_id
///
/// # Errors
/// * `Unauthorized` - Caller is not the contract admin
/// * `InvalidOutcomeCount` - Too few or too many outcomes
/// * `InvalidDescription` - Description is empty or too long
/// * `InvalidResolutionTime` - Resolution time is in the past
pub fn create_market(
    env: &Env,
    admin: Address,
    question: SorobanString,
    description: SorobanString,
    outcomes: Vec<SorobanString>,
    resolution_time: u64,
    collateral_token: Address,
) -> Result<u64, PredictionMarketError> {
    // Check contract admin authorization
    let contract_admin = get_contract_admin(env)?;
    if admin != contract_admin {
        return Err(PredictionMarketError::InvalidAdmin);
    }

    // Validate inputs
    if outcomes.is_empty() {
        return Err(PredictionMarketError::EmptyOutcomes);
    }
    if outcomes.len() > 256 {
        // Limit to prevent excessive storage
        return Err(PredictionMarketError::InvalidOutcomeCount);
    }
    if description.is_empty() || description.len() > 1000 {
        return Err(PredictionMarketError::InvalidDescription);
    }

    let current_time = env.ledger().timestamp();
    if resolution_time <= current_time {
        return Err(PredictionMarketError::InvalidResolutionTime);
    }

    // Get next market ID
    let market_counter: u64 = env
        .storage()
        .persistent()
        .get(&StorageKey::MarketCounter)
        .unwrap_or(0);
    let new_market_id = market_counter + 1;

    // Create market info
    let market = MarketInfo {
        id: new_market_id,
        admin: admin.clone(),
        question,
        description,
        outcomes,
        status: MarketStatus::Open,
        created_at: current_time,
        resolution_time,
        collateral_token,
        resolved_outcome: None,
    };

    // Store market
    env.storage()
        .persistent()
        .set(&StorageKey::Market(new_market_id), &market);

    // Update counter
    env.storage()
        .persistent()
        .set(&StorageKey::MarketCounter, &new_market_id);

    // Initialize resolution state
    let resolution = Resolution {
        market_id: new_market_id,
        proposed_outcome: None,
        proposer: None,
        status: ResolutionStatus::Unresolved,
        proposed_at: None,
        challenge_deadline: None,
    };
    env.storage()
        .persistent()
        .set(&StorageKey::Resolution(new_market_id), &resolution);

    Ok(new_market_id)
}

/// Retrieves market information by ID.
///
/// # Arguments
/// * `env` - The contract environment
/// * `market_id` - The market ID to retrieve
///
/// # Returns
/// The MarketInfo struct
///
/// # Errors
/// * `MarketNotFound` - Market with given ID does not exist
pub fn get_market(env: &Env, market_id: u64) -> Result<MarketInfo, PredictionMarketError> {
    env.storage()
        .persistent()
        .get(&StorageKey::Market(market_id))
        .ok_or(PredictionMarketError::MarketNotFound)
}

/// Lists all existing markets.
///
/// # Arguments
/// * `env` - The contract environment
///
/// # Returns
/// Vector of MarketInfo structs for all markets
pub fn list_markets(env: &Env) -> Vec<MarketInfo> {
    let market_counter: u64 = env
        .storage()
        .persistent()
        .get(&StorageKey::MarketCounter)
        .unwrap_or(0);

    let mut markets = Vec::new();
    for market_id in 1..=market_counter {
        if let Ok(market) = get_market(env, market_id) {
            markets.push_back(market);
        }
    }
    markets
}

/// Returns the total number of markets created.
pub fn get_market_count(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&StorageKey::MarketCounter)
        .unwrap_or(0)
}

/// Retrieves resolution information for a market.
pub fn get_resolution(env: &Env, market_id: u64) -> Result<Resolution, PredictionMarketError> {
    env.storage()
        .persistent()
        .get(&StorageKey::Resolution(market_id))
        .ok_or(PredictionMarketError::MarketNotFound)
}

/// Updates resolution information for a market.
pub fn set_resolution(env: &Env, market_id: u64, resolution: Resolution) {
    env.storage()
        .persistent()
        .set(&StorageKey::Resolution(market_id), &resolution);
}

/// Updates market status.
pub fn set_market_status(
    env: &Env,
    market_id: u64,
    new_status: MarketStatus,
) -> Result<(), PredictionMarketError> {
    let mut market = get_market(env, market_id)?;
    market.status = new_status;
    env.storage()
        .persistent()
        .set(&StorageKey::Market(market_id), &market);
    Ok(())
}

/// Marks a market as resolved with a specific outcome.
pub fn resolve_market(
    env: &Env,
    market_id: u64,
    outcome_index: u32,
) -> Result<(), PredictionMarketError> {
    let mut market = get_market(env, market_id)?;

    if outcome_index >= market.outcomes.len() as u32 {
        return Err(PredictionMarketError::InvalidOutcomeIndex);
    }

    market.status = MarketStatus::Resolved;
    market.resolved_outcome = Some(outcome_index);

    env.storage()
        .persistent()
        .set(&StorageKey::Market(market_id), &market);
    Ok(())
}

/// Gets the contract admin address.
pub fn get_contract_admin(env: &Env) -> Result<Address, PredictionMarketError> {
    env.storage()
        .persistent()
        .get(&StorageKey::Admin)
        .ok_or(PredictionMarketError::Unauthorized)
}

/// Sets the contract admin address (only callable by current admin).
pub fn set_contract_admin(
    env: &Env,
    caller: &Address,
    new_admin: &Address,
) -> Result<(), PredictionMarketError> {
    let current_admin = get_contract_admin(env)?;
    if caller != &current_admin {
        return Err(PredictionMarketError::Unauthorized);
    }

    env.storage()
        .persistent()
        .set(&StorageKey::Admin, new_admin);
    Ok(())
}

/// Initializes the contract admin (should only be called once).
pub fn initialize_admin(env: &Env, admin: &Address) -> Result<(), PredictionMarketError> {
    if env
        .storage()
        .persistent()
        .has(&StorageKey::Admin)
    {
        return Err(PredictionMarketError::InvalidAdmin);
    }

    env.storage()
        .persistent()
        .set(&StorageKey::Admin, admin);
    Ok(())
}

/// Gets the global configuration.
pub fn get_config(env: &Env) -> Config {
    env.storage()
        .persistent()
        .get(&StorageKey::Config)
        .unwrap_or_else(Config::new)
}

/// Sets the global configuration.
pub fn set_config(env: &Env, config: Config) {
    env.storage()
        .persistent()
        .set(&StorageKey::Config, &config);
}
