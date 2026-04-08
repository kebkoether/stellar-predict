use crate::errors::PredictionMarketError;
use crate::market::{get_config, get_contract_admin, get_market, get_resolution, resolve_market, set_market_status, set_resolution};
use crate::types::{MarketStatus, Resolution, ResolutionStatus};
use soroban_sdk::{Address, Env};

/// Proposes a resolution for a market (admin only).
///
/// The admin proposes which outcome won. This starts a dispute window during which
/// challengers can dispute the resolution. After the dispute window expires without
/// successful challenges, the resolution can be finalized.
///
/// # Arguments
/// * `env` - The contract environment
/// * `admin` - The admin address proposing the resolution
/// * `market_id` - ID of the market to resolve
/// * `outcome_index` - Index of the winning outcome (0 to outcomes.len()-1)
///
/// # Returns
/// Ok(()) on success
///
/// # Errors
/// * `Unauthorized` - Caller is not the contract admin
/// * `MarketNotFound` - Market doesn't exist
/// * `MarketNotOpen` - Market is not in Open status (must resolve before pausing)
/// * `InvalidOutcomeIndex` - Outcome index is out of bounds
/// * `ResolutionAlreadyProposed` - Resolution already proposed for this market
/// * `ResolutionTimeNotReached` - Cannot propose resolution before resolution_time
pub fn propose_resolution(
    env: &Env,
    admin: &Address,
    market_id: u64,
    outcome_index: u32,
) -> Result<(), PredictionMarketError> {
    // Only contract admin can propose resolution
    let contract_admin = get_contract_admin(env)?;
    if admin != &contract_admin {
        return Err(PredictionMarketError::Unauthorized);
    }

    // Get and validate market
    let market = get_market(env, market_id)?;
    if market.status != MarketStatus::Open {
        return Err(PredictionMarketError::MarketNotOpen);
    }

    // Validate outcome index
    if outcome_index >= market.outcomes.len() as u32 {
        return Err(PredictionMarketError::InvalidOutcomeIndex);
    }

    // Cannot resolve before resolution time
    let current_time = env.ledger().timestamp();
    if current_time < market.resolution_time {
        return Err(PredictionMarketError::ResolutionTimeNotReached);
    }

    // Check if resolution already proposed
    let current_resolution = get_resolution(env, market_id)?;
    if current_resolution.status != ResolutionStatus::Unresolved {
        return Err(PredictionMarketError::ResolutionAlreadyProposed);
    }

    // Create proposed resolution
    let config = get_config(env);
    let now = env.ledger().timestamp();
    let challenge_deadline = now + config.dispute_window_secs;

    let new_resolution = Resolution {
        market_id,
        proposed_outcome: Some(outcome_index),
        proposer: Some(admin.clone()),
        status: ResolutionStatus::Proposed,
        proposed_at: Some(now),
        challenge_deadline: Some(challenge_deadline),
    };

    set_resolution(env, market_id, new_resolution);

    Ok(())
}

/// Challenges a proposed resolution.
///
/// Any account can challenge a resolution during the dispute window. After a challenge,
/// the resolution status becomes "Challenged" and requires additional review before finalization.
/// (In a production system, this could trigger a formal dispute process or DAO vote.)
///
/// # Arguments
/// * `env` - The contract environment
/// * `challenger` - Address challenging the resolution
/// * `market_id` - ID of the market with the proposed resolution
///
/// # Returns
/// Ok(()) on success
///
/// # Errors
/// * `MarketNotFound` - Market doesn't exist
/// * `ResolutionNotProposed` - No resolution is currently proposed
/// * `DisputeWindowExpired` - The dispute window has closed
pub fn challenge_resolution(
    env: &Env,
    _challenger: &Address,
    market_id: u64,
) -> Result<(), PredictionMarketError> {
    // Get market (validate it exists)
    let _market = get_market(env, market_id)?;

    // Get resolution
    let mut resolution = get_resolution(env, market_id)?;

    // Must have a proposed resolution
    if resolution.status != ResolutionStatus::Proposed {
        return Err(PredictionMarketError::ResolutionNotProposed);
    }

    // Check dispute window hasn't expired
    let current_time = env.ledger().timestamp();
    let challenge_deadline = resolution
        .challenge_deadline
        .ok_or(PredictionMarketError::DisputeWindowExpired)?;

    if current_time > challenge_deadline {
        return Err(PredictionMarketError::DisputeWindowExpired);
    }

    // Mark as challenged
    resolution.status = ResolutionStatus::Challenged;
    set_resolution(env, market_id, resolution);

    Ok(())
}

/// Finalizes a resolution after the dispute window passes.
///
/// Once the dispute window expires, anyone can call this function to lock in the resolution.
/// This actually resolves the market and allows users to redeem their winning tokens.
///
/// # Arguments
/// * `env` - The contract environment
/// * `market_id` - ID of the market to finalize
///
/// # Returns
/// Ok(()) on success
///
/// # Errors
/// * `MarketNotFound` - Market doesn't exist
/// * `ResolutionNotProposed` - No resolution proposed for this market
/// * `DisputeWindowNotExpired` - Dispute window still active
/// * `ResolutionInDispute` - Resolution was challenged; cannot finalize
pub fn finalize_resolution(
    env: &Env,
    market_id: u64,
) -> Result<(), PredictionMarketError> {
    // Get market
    let _market = get_market(env, market_id)?;

    // Get resolution
    let mut resolution = get_resolution(env, market_id)?;

    // Must have proposed resolution
    if resolution.status == ResolutionStatus::Unresolved {
        return Err(PredictionMarketError::ResolutionNotProposed);
    }

    // If challenged, cannot finalize automatically
    if resolution.status == ResolutionStatus::Challenged {
        return Err(PredictionMarketError::ResolutionInDispute);
    }

    // If already finalized, nothing to do
    if resolution.status == ResolutionStatus::Finalized {
        return Ok(());
    }

    // Check dispute window has expired
    let current_time = env.ledger().timestamp();
    let challenge_deadline = resolution
        .challenge_deadline
        .ok_or(PredictionMarketError::DisputeWindowExpired)?;

    if current_time <= challenge_deadline {
        return Err(PredictionMarketError::DisputeWindowNotExpired);
    }

    // Finalize resolution
    let outcome_index = resolution
        .proposed_outcome
        .ok_or(PredictionMarketError::InvalidOutcomeIndex)?;

    // Mark resolution as finalized
    resolution.status = ResolutionStatus::Finalized;
    set_resolution(env, market_id, resolution);

    // Actually resolve the market (allow token redemption)
    resolve_market(env, market_id, outcome_index)?;

    Ok(())
}

/// Gets the current resolution status for a market.
///
/// Returns the proposed outcome (if any), proposer, and current resolution status.
pub fn get_resolution_status(
    env: &Env,
    market_id: u64,
) -> Result<(Option<u32>, ResolutionStatus), PredictionMarketError> {
    let resolution = get_resolution(env, market_id)?;
    Ok((resolution.proposed_outcome, resolution.status))
}

/// Calculates seconds remaining in the dispute window for a proposed resolution.
///
/// Returns 0 if the dispute window has already expired.
pub fn get_dispute_window_remaining(env: &Env, market_id: u64) -> Result<u64, PredictionMarketError> {
    let resolution = get_resolution(env, market_id)?;

    if resolution.status == ResolutionStatus::Unresolved {
        return Ok(0);
    }

    let challenge_deadline = resolution
        .challenge_deadline
        .ok_or(PredictionMarketError::DisputeWindowExpired)?;
    let current_time = env.ledger().timestamp();

    if current_time >= challenge_deadline {
        Ok(0)
    } else {
        Ok(challenge_deadline - current_time)
    }
}
