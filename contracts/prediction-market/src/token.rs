use crate::errors::PredictionMarketError;
use crate::market::{get_market, set_market_status};
use crate::types::{MarketStatus, StorageKey};
use soroban_sdk::{Address, Env, Symbol};
use soroban_token_sdk::Client as TokenClient;

/// Mints outcome tokens for a user.
///
/// User deposits `collateral_amount` of the market's collateral token and receives
/// one complete set of outcome tokens (one token for each outcome in the market).
/// For example, in a binary market (YES/NO), depositing 1 USDC gives 1 YES token + 1 NO token.
///
/// # Arguments
/// * `env` - The contract environment
/// * `user` - Address of the user minting tokens
/// * `market_id` - ID of the market
/// * `collateral_amount` - Amount of collateral to deposit (in the collateral token's native units)
///
/// # Returns
/// Ok(()) on success
///
/// # Errors
/// * `MarketNotFound` - Market doesn't exist
/// * `MarketNotOpen` - Market is not in Open status
/// * `InsufficientCollateral` - User doesn't have enough collateral tokens
/// * `TokenTransferFailed` - Transfer of collateral failed
pub fn mint_outcome_tokens(
    env: &Env,
    user: &Address,
    market_id: u64,
    collateral_amount: i128,
) -> Result<(), PredictionMarketError> {
    // Get market and validate it exists and is open
    let market = get_market(env, market_id)?;

    if market.status != MarketStatus::Open {
        return Err(PredictionMarketError::MarketNotOpen);
    }

    if collateral_amount <= 0 {
        return Err(PredictionMarketError::InvalidTokenAmount);
    }

    // Transfer collateral from user to contract
    let token_client = TokenClient::new(env, &market.collateral_token);
    token_client.transfer(&user, &env.current_contract_address(), &collateral_amount);

    // Mint one of each outcome token for the user
    for outcome_index in 0..market.outcomes.len() as u32 {
        mint_tokens(
            env,
            user,
            market_id,
            outcome_index,
            collateral_amount,
        )?;
    }

    Ok(())
}

/// Redeems a complete set of outcome tokens for collateral.
///
/// Burns one token of each outcome from the user and returns the equivalent collateral.
/// This allows users to exit positions without selling on a market.
///
/// # Arguments
/// * `env` - The contract environment
/// * `user` - Address of the user redeeming tokens
/// * `market_id` - ID of the market
/// * `amount` - Number of complete sets to redeem
///
/// # Returns
/// Ok(()) on success
///
/// # Errors
/// * `MarketNotFound` - Market doesn't exist
/// * `InsufficientBalance` - User lacks required tokens for one or more outcomes
pub fn redeem_complete_set(
    env: &Env,
    user: &Address,
    market_id: u64,
    amount: i128,
) -> Result<(), PredictionMarketError> {
    let market = get_market(env, market_id)?;

    if amount <= 0 {
        return Err(PredictionMarketError::InvalidTokenAmount);
    }

    // Check user has sufficient balance of all outcome tokens
    for outcome_index in 0..market.outcomes.len() as u32 {
        let balance = get_token_balance(env, user, market_id, outcome_index);
        if balance < amount {
            return Err(PredictionMarketError::InsufficientBalance);
        }
    }

    // Burn one of each outcome token
    for outcome_index in 0..market.outcomes.len() as u32 {
        burn_tokens(env, user, market_id, outcome_index, amount)?;
    }

    // Transfer collateral back to user
    let token_client = TokenClient::new(env, &market.collateral_token);
    token_client.transfer(
        &env.current_contract_address(),
        &user,
        &amount,
    );

    Ok(())
}

/// Redeems winning tokens for collateral after market resolution.
///
/// Burns winning outcome tokens from the user and returns collateral at a 1:1 rate.
/// Can only be called after the market has been resolved.
///
/// # Arguments
/// * `env` - The contract environment
/// * `user` - Address of the user redeeming
/// * `market_id` - ID of the market
///
/// # Returns
/// The amount of collateral returned to the user
///
/// # Errors
/// * `MarketNotFound` - Market doesn't exist
/// * `MarketAlreadyResolved` - Market is not yet resolved
/// * `InsufficientBalance` - User has no winning tokens
pub fn redeem_winning_tokens(
    env: &Env,
    user: &Address,
    market_id: u64,
) -> Result<i128, PredictionMarketError> {
    let market = get_market(env, market_id)?;

    // Market must be resolved
    if market.status != MarketStatus::Resolved {
        return Err(PredictionMarketError::MarketAlreadyResolved);
    }

    let winning_outcome = market
        .resolved_outcome
        .ok_or(PredictionMarketError::InvalidOutcomeIndex)?;

    // Get user's balance of winning tokens
    let winning_balance = get_token_balance(env, user, market_id, winning_outcome);

    if winning_balance <= 0 {
        return Err(PredictionMarketError::InsufficientBalance);
    }

    // Burn winning tokens
    burn_tokens(env, user, market_id, winning_outcome, winning_balance)?;

    // Transfer collateral to user (1 winning token = 1 collateral)
    let token_client = TokenClient::new(env, &market.collateral_token);
    token_client.transfer(
        &env.current_contract_address(),
        &user,
        &winning_balance,
    );

    Ok(winning_balance)
}

/// Mints tokens internally.
fn mint_tokens(
    env: &Env,
    user: &Address,
    market_id: u64,
    outcome_index: u32,
    amount: i128,
) -> Result<(), PredictionMarketError> {
    let current_balance = get_token_balance(env, user, market_id, outcome_index);
    let new_balance = current_balance
        .checked_add(amount)
        .ok_or(PredictionMarketError::OperationFailed)?;

    set_token_balance(env, user, market_id, outcome_index, new_balance);
    Ok(())
}

/// Burns tokens internally.
fn burn_tokens(
    env: &Env,
    user: &Address,
    market_id: u64,
    outcome_index: u32,
    amount: i128,
) -> Result<(), PredictionMarketError> {
    let current_balance = get_token_balance(env, user, market_id, outcome_index);

    if current_balance < amount {
        return Err(PredictionMarketError::InsufficientBalance);
    }

    let new_balance = current_balance - amount;
    set_token_balance(env, user, market_id, outcome_index, new_balance);
    Ok(())
}

/// Gets a user's token balance for a specific outcome.
///
/// # Arguments
/// * `env` - The contract environment
/// * `user` - The user address
/// * `market_id` - The market ID
/// * `outcome_index` - The outcome index (0 to outcomes.len()-1)
///
/// # Returns
/// The token balance (0 if no balance stored)
pub fn get_token_balance(env: &Env, user: &Address, market_id: u64, outcome_index: u32) -> i128 {
    env.storage()
        .persistent()
        .get(&StorageKey::TokenBalance(user.clone(), market_id, outcome_index))
        .unwrap_or(0)
}

/// Sets a user's token balance for a specific outcome.
fn set_token_balance(
    env: &Env,
    user: &Address,
    market_id: u64,
    outcome_index: u32,
    balance: i128,
) {
    if balance == 0 {
        // Remove balance entry if zero to save storage
        env.storage()
            .persistent()
            .remove(&StorageKey::TokenBalance(user.clone(), market_id, outcome_index));
    } else {
        env.storage()
            .persistent()
            .set(&StorageKey::TokenBalance(user.clone(), market_id, outcome_index), &balance);
    }
}
