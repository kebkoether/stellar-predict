use crate::errors::PredictionMarketError;
use crate::market::{get_config, get_contract_admin, get_market, set_config, set_contract_admin, set_market_status};
use crate::types::{Config, MarketStatus, StorageKey};
use soroban_sdk::{Address, Env};

/// Pauses a market, preventing new token minting.
///
/// Only the contract admin can pause markets. When paused, users cannot mint new outcome tokens
/// but can still redeem complete sets or winning tokens if already resolved.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - The admin address (must be contract admin)
/// * `market_id` - ID of the market to pause
///
/// # Returns
/// Ok(()) on success
///
/// # Errors
/// * `Unauthorized` - Caller is not the contract admin
/// * `MarketNotFound` - Market doesn't exist
/// * `InvalidMarketStatus` - Market is already paused or resolved
pub fn pause_market(
    env: &Env,
    admin: &Address,
    market_id: u64,
) -> Result<(), PredictionMarketError> {
    // Verify admin
    let contract_admin = get_contract_admin(env)?;
    if admin != &contract_admin {
        return Err(PredictionMarketError::Unauthorized);
    }

    // Get market and validate status
    let market = get_market(env, market_id)?;

    match market.status {
        MarketStatus::Open => {
            // Can pause from Open
            set_market_status(env, market_id, MarketStatus::Paused)
        }
        MarketStatus::Paused => {
            // Already paused
            Err(PredictionMarketError::InvalidMarketStatus)
        }
        MarketStatus::Resolved => {
            // Cannot pause resolved market
            Err(PredictionMarketError::InvalidMarketStatus)
        }
        MarketStatus::Cancelled => {
            // Cannot pause cancelled market
            Err(PredictionMarketError::InvalidMarketStatus)
        }
    }
}

/// Resumes a paused market.
///
/// Only the contract admin can resume markets. After resumption, users can mint tokens again.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - The admin address (must be contract admin)
/// * `market_id` - ID of the market to resume
///
/// # Returns
/// Ok(()) on success
///
/// # Errors
/// * `Unauthorized` - Caller is not the contract admin
/// * `MarketNotFound` - Market doesn't exist
/// * `InvalidMarketStatus` - Market is not paused
pub fn resume_market(
    env: &Env,
    admin: &Address,
    market_id: u64,
) -> Result<(), PredictionMarketError> {
    // Verify admin
    let contract_admin = get_contract_admin(env)?;
    if admin != &contract_admin {
        return Err(PredictionMarketError::Unauthorized);
    }

    // Get market and validate status
    let market = get_market(env, market_id)?;

    match market.status {
        MarketStatus::Paused => {
            // Can resume from Paused
            set_market_status(env, market_id, MarketStatus::Open)
        }
        MarketStatus::Open => {
            // Already open
            Err(PredictionMarketError::InvalidMarketStatus)
        }
        MarketStatus::Resolved => {
            // Cannot reopen resolved market
            Err(PredictionMarketError::InvalidMarketStatus)
        }
        MarketStatus::Cancelled => {
            // Cannot reopen cancelled market
            Err(PredictionMarketError::InvalidMarketStatus)
        }
    }
}

/// Cancels a market.
///
/// Cancels a market and prevents further minting. In a production system,
/// this should trigger refunds of deposited collateral to users.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - The admin address (must be contract admin)
/// * `market_id` - ID of the market to cancel
///
/// # Returns
/// Ok(()) on success
///
/// # Errors
/// * `Unauthorized` - Caller is not the contract admin
/// * `MarketNotFound` - Market doesn't exist
/// * `InvalidMarketStatus` - Market is already resolved or cancelled
pub fn cancel_market(
    env: &Env,
    admin: &Address,
    market_id: u64,
) -> Result<(), PredictionMarketError> {
    // Verify admin
    let contract_admin = get_contract_admin(env)?;
    if admin != &contract_admin {
        return Err(PredictionMarketError::Unauthorized);
    }

    // Get market and validate status
    let market = get_market(env, market_id)?;

    match market.status {
        MarketStatus::Open | MarketStatus::Paused => {
            // Can cancel from Open or Paused
            set_market_status(env, market_id, MarketStatus::Cancelled)
        }
        MarketStatus::Resolved => {
            // Cannot cancel resolved market
            Err(PredictionMarketError::InvalidMarketStatus)
        }
        MarketStatus::Cancelled => {
            // Already cancelled
            Err(PredictionMarketError::InvalidMarketStatus)
        }
    }
}

/// Transfers admin role to a new address.
///
/// Only the current admin can transfer the admin role. The new admin immediately
/// gains all admin privileges.
///
/// # Arguments
/// * `env` - The contract environment
/// * `current_admin` - Current admin address
/// * `new_admin` - The new admin address
///
/// # Returns
/// Ok(()) on success
///
/// # Errors
/// * `Unauthorized` - Caller is not the current admin
pub fn set_admin(
    env: &Env,
    current_admin: &Address,
    new_admin: &Address,
) -> Result<(), PredictionMarketError> {
    set_contract_admin(env, current_admin, new_admin)
}

/// Gets the current contract admin address.
pub fn get_admin(env: &Env) -> Result<Address, PredictionMarketError> {
    get_contract_admin(env)
}

/// Emergency pause: pauses all markets globally.
///
/// This is a kill switch for emergencies. When activated, no new tokens can be minted
/// in any market. Users can still redeem existing positions.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - The admin address (must be contract admin)
///
/// # Returns
/// Ok(()) on success
///
/// # Errors
/// * `Unauthorized` - Caller is not the contract admin
pub fn emergency_pause_all(
    env: &Env,
    admin: &Address,
) -> Result<(), PredictionMarketError> {
    // Verify admin
    let contract_admin = get_contract_admin(env)?;
    if admin != &contract_admin {
        return Err(PredictionMarketError::Unauthorized);
    }

    let mut config = get_config(env);
    config.emergency_paused = true;
    set_config(env, config);

    Ok(())
}

/// Lifts the emergency pause.
///
/// Re-enables normal market operations after emergency pause.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - The admin address (must be contract admin)
///
/// # Returns
/// Ok(()) on success
///
/// # Errors
/// * `Unauthorized` - Caller is not the contract admin
pub fn emergency_resume_all(
    env: &Env,
    admin: &Address,
) -> Result<(), PredictionMarketError> {
    // Verify admin
    let contract_admin = get_contract_admin(env)?;
    if admin != &contract_admin {
        return Err(PredictionMarketError::Unauthorized);
    }

    let mut config = get_config(env);
    config.emergency_paused = false;
    set_config(env, config);

    Ok(())
}

/// Checks if emergency pause is active.
pub fn is_emergency_paused(env: &Env) -> bool {
    let config = get_config(env);
    config.emergency_paused
}

/// Sets the dispute window duration.
///
/// Only admin can change the dispute window. This affects future resolutions.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - The admin address (must be contract admin)
/// * `dispute_window_secs` - New dispute window duration in seconds
///
/// # Returns
/// Ok(()) on success
///
/// # Errors
/// * `Unauthorized` - Caller is not the contract admin
/// * `InvalidDisputeWindow` - Dispute window is 0 or unreasonably large
pub fn set_dispute_window(
    env: &Env,
    admin: &Address,
    dispute_window_secs: u64,
) -> Result<(), PredictionMarketError> {
    // Verify admin
    let contract_admin = get_contract_admin(env)?;
    if admin != &contract_admin {
        return Err(PredictionMarketError::Unauthorized);
    }

    // Validate: must be at least 1 second, at most 365 days
    if dispute_window_secs == 0 || dispute_window_secs > 31_536_000 {
        return Err(PredictionMarketError::InvalidDisputeWindow);
    }

    let mut config = get_config(env);
    config.dispute_window_secs = dispute_window_secs;
    set_config(env, config);

    Ok(())
}

/// Gets the current dispute window duration.
pub fn get_dispute_window(env: &Env) -> u64 {
    let config = get_config(env);
    config.dispute_window_secs
}
