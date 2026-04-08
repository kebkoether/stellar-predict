#![no_std]

mod admin;
mod errors;
mod market;
mod resolution;
mod token;
mod types;

pub use admin::*;
pub use errors::*;
pub use market::*;
pub use resolution::*;
pub use token::*;
pub use types::*;

use soroban_sdk::{contractimpl, Address, Env, String as SorobanString, Vec};

/// The Prediction Market smart contract.
///
/// This contract implements a decentralized prediction market platform where users can:
/// 1. Create binary or multi-outcome markets
/// 2. Mint outcome tokens by depositing collateral
/// 3. Trade outcome tokens on secondary markets
/// 4. Redeem winning tokens for collateral after resolution
/// 5. Redeem complete sets to exit without trading
///
/// Markets progress through states: Open → Paused (optional) → Resolved → closed
/// Resolution involves admin proposal → dispute window → finalization
pub struct PredictionMarketContract;

#[contractimpl]
impl PredictionMarketContract {
    /// Initializes the contract with an admin address.
    ///
    /// This function must be called exactly once to set up the contract.
    /// After initialization, the specified admin can create markets and manage the system.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Address to be granted admin privileges
    ///
    /// # Returns
    /// Ok(()) on success
    ///
    /// # Errors
    /// * `InvalidAdmin` - If contract is already initialized
    pub fn initialize(env: Env, admin: Address) -> Result<(), PredictionMarketError> {
        market::initialize_admin(&env, &admin)?;
        let config = Config::new();
        market::set_config(&env, config);
        Ok(())
    }

    // ========== MARKET CREATION & LIFECYCLE ==========

    /// Creates a new prediction market.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Address that will administer this market (must be contract admin)
    /// * `question` - The market question (e.g., "Will BTC reach $100k?")
    /// * `description` - Detailed description of market rules and criteria
    /// * `outcomes` - Vector of outcome names (e.g., ["YES", "NO"])
    /// * `resolution_time` - Unix timestamp when market can be resolved
    /// * `collateral_token` - Address of the collateral token contract (e.g., USDC)
    ///
    /// # Returns
    /// The ID of the newly created market
    pub fn create_market(
        env: Env,
        admin: Address,
        question: SorobanString,
        description: SorobanString,
        outcomes: Vec<SorobanString>,
        resolution_time: u64,
        collateral_token: Address,
    ) -> Result<u64, PredictionMarketError> {
        market::create_market(
            &env,
            admin,
            question,
            description,
            outcomes,
            resolution_time,
            collateral_token,
        )
    }

    /// Retrieves information about a specific market.
    ///
    /// # Returns
    /// MarketInfo struct with all market details
    pub fn get_market(env: Env, market_id: u64) -> Result<MarketInfo, PredictionMarketError> {
        market::get_market(&env, market_id)
    }

    /// Lists all markets in the contract.
    ///
    /// # Returns
    /// Vector of all MarketInfo structs
    pub fn list_markets(env: Env) -> Vec<MarketInfo> {
        market::list_markets(&env)
    }

    /// Gets the total count of markets created.
    pub fn get_market_count(env: Env) -> u64 {
        market::get_market_count(&env)
    }

    // ========== TOKEN MINTING & REDEMPTION ==========

    /// Mints outcome tokens for a user.
    ///
    /// User deposits collateral and receives one complete set of outcome tokens.
    /// For a binary market: 1 USDC → 1 YES token + 1 NO token
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `user` - User minting the tokens
    /// * `market_id` - The market ID
    /// * `collateral_amount` - Amount of collateral to deposit
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn mint_outcome_tokens(
        env: Env,
        user: Address,
        market_id: u64,
        collateral_amount: i128,
    ) -> Result<(), PredictionMarketError> {
        // Check if system is in emergency pause
        if admin::is_emergency_paused(&env) {
            return Err(PredictionMarketError::MarketPaused);
        }

        token::mint_outcome_tokens(&env, &user, market_id, collateral_amount)
    }

    /// Redeems a complete set of outcome tokens for collateral.
    ///
    /// Burns one token of each outcome and returns equivalent collateral.
    /// Allows users to exit without selling on secondary market.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `user` - User redeeming tokens
    /// * `market_id` - The market ID
    /// * `amount` - Number of complete sets to redeem
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn redeem_complete_set(
        env: Env,
        user: Address,
        market_id: u64,
        amount: i128,
    ) -> Result<(), PredictionMarketError> {
        token::redeem_complete_set(&env, &user, market_id, amount)
    }

    /// Redeems winning tokens for collateral after market resolution.
    ///
    /// Burns winning outcome tokens and returns collateral at 1:1 rate.
    /// Can only be called after market is resolved.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `user` - User redeeming tokens
    /// * `market_id` - The market ID
    ///
    /// # Returns
    /// Amount of collateral returned
    pub fn redeem_winning_tokens(
        env: Env,
        user: Address,
        market_id: u64,
    ) -> Result<i128, PredictionMarketError> {
        token::redeem_winning_tokens(&env, &user, market_id)
    }

    /// Gets a user's outcome token balance.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `user` - User address
    /// * `market_id` - The market ID
    /// * `outcome_index` - The outcome index (0 to outcomes.len()-1)
    ///
    /// # Returns
    /// The token balance for this outcome
    pub fn get_user_outcome_balance(
        env: Env,
        user: Address,
        market_id: u64,
        outcome_index: u32,
    ) -> i128 {
        token::get_token_balance(&env, &user, market_id, outcome_index)
    }

    // ========== RESOLUTION & ORACLE ==========

    /// Proposes a resolution for a market.
    ///
    /// Admin proposes the winning outcome. This starts the dispute window.
    /// Anyone can challenge during the dispute window.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must be contract admin)
    /// * `market_id` - The market ID
    /// * `outcome_index` - Index of the winning outcome
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn propose_resolution(
        env: Env,
        admin: Address,
        market_id: u64,
        outcome_index: u32,
    ) -> Result<(), PredictionMarketError> {
        resolution::propose_resolution(&env, &admin, market_id, outcome_index)
    }

    /// Challenges a proposed resolution.
    ///
    /// Anyone can challenge during the dispute window.
    /// A challenge prevents automatic finalization.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `challenger` - Address challenging the resolution
    /// * `market_id` - The market ID
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn challenge_resolution(
        env: Env,
        challenger: Address,
        market_id: u64,
    ) -> Result<(), PredictionMarketError> {
        resolution::challenge_resolution(&env, &challenger, market_id)
    }

    /// Finalizes a resolution after the dispute window expires.
    ///
    /// Anyone can call this. The resolution becomes locked in and
    /// users can redeem their winning tokens.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `market_id` - The market ID
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn finalize_resolution(env: Env, market_id: u64) -> Result<(), PredictionMarketError> {
        resolution::finalize_resolution(&env, market_id)
    }

    /// Gets the resolution status for a market.
    ///
    /// # Returns
    /// (proposed_outcome_index, resolution_status)
    pub fn get_resolution_status(
        env: Env,
        market_id: u64,
    ) -> Result<(Option<u32>, ResolutionStatus), PredictionMarketError> {
        resolution::get_resolution_status(&env, market_id)
    }

    /// Gets seconds remaining in the dispute window.
    ///
    /// Returns 0 if no dispute window is active.
    pub fn get_dispute_window_remaining(env: Env, market_id: u64) -> Result<u64, PredictionMarketError> {
        resolution::get_dispute_window_remaining(&env, market_id)
    }

    // ========== ADMIN FUNCTIONS ==========

    /// Pauses a market (prevents new token minting).
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must be contract admin)
    /// * `market_id` - The market ID to pause
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn pause_market(
        env: Env,
        admin: Address,
        market_id: u64,
    ) -> Result<(), PredictionMarketError> {
        admin::pause_market(&env, &admin, market_id)
    }

    /// Resumes a paused market (enables token minting again).
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must be contract admin)
    /// * `market_id` - The market ID to resume
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn resume_market(
        env: Env,
        admin: Address,
        market_id: u64,
    ) -> Result<(), PredictionMarketError> {
        admin::resume_market(&env, &admin, market_id)
    }

    /// Cancels a market.
    ///
    /// Prevents further operations and should trigger refunds to users.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must be contract admin)
    /// * `market_id` - The market ID to cancel
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn cancel_market(
        env: Env,
        admin: Address,
        market_id: u64,
    ) -> Result<(), PredictionMarketError> {
        admin::cancel_market(&env, &admin, market_id)
    }

    /// Transfers admin role to a new address.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `current_admin` - Current admin address
    /// * `new_admin` - Address to grant admin to
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn set_admin(
        env: Env,
        current_admin: Address,
        new_admin: Address,
    ) -> Result<(), PredictionMarketError> {
        admin::set_admin(&env, &current_admin, &new_admin)
    }

    /// Gets the current contract admin address.
    pub fn get_admin(env: Env) -> Result<Address, PredictionMarketError> {
        admin::get_admin(&env)
    }

    /// Emergency pause all markets globally.
    ///
    /// Prevents all new token minting. Users can still redeem existing positions.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must be contract admin)
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn emergency_pause_all(env: Env, admin: Address) -> Result<(), PredictionMarketError> {
        admin::emergency_pause_all(&env, &admin)
    }

    /// Lifts the emergency pause.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must be contract admin)
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn emergency_resume_all(env: Env, admin: Address) -> Result<(), PredictionMarketError> {
        admin::emergency_resume_all(&env, &admin)
    }

    /// Checks if the system is in emergency pause mode.
    pub fn is_emergency_paused(env: Env) -> bool {
        admin::is_emergency_paused(&env)
    }

    /// Sets the dispute window duration for future resolutions.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - Admin address (must be contract admin)
    /// * `dispute_window_secs` - New duration in seconds (must be 1 to 31,536,000)
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn set_dispute_window(
        env: Env,
        admin: Address,
        dispute_window_secs: u64,
    ) -> Result<(), PredictionMarketError> {
        admin::set_dispute_window(&env, &admin, dispute_window_secs)
    }

    /// Gets the current dispute window duration.
    pub fn get_dispute_window(env: Env) -> u64 {
        admin::get_dispute_window(&env)
    }
}
