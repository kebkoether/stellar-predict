use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum PredictionMarketError {
    // Admin & Authorization errors
    Unauthorized = 1,
    InvalidAdmin = 2,

    // Market lifecycle errors
    MarketNotFound = 3,
    MarketAlreadyExists = 4,
    MarketNotOpen = 5,
    MarketAlreadyResolved = 6,
    InvalidMarketStatus = 7,
    MarketPaused = 8,

    // Input validation errors
    InvalidOutcomeIndex = 9,
    InvalidOutcomeCount = 10,
    InvalidDescription = 11,
    InvalidResolutionTime = 12,
    InvalidDisputeWindow = 13,
    EmptyOutcomes = 14,

    // Token operation errors
    InsufficientBalance = 15,
    InsufficientCollateral = 16,
    TokenTransferFailed = 17,
    InvalidTokenAmount = 18,
    InvalidCollateralToken = 19,

    // Resolution errors
    ResolutionAlreadyProposed = 20,
    ResolutionNotProposed = 21,
    ResolutionInDispute = 22,
    InvalidResolutionOutcome = 23,
    DisputeWindowExpired = 24,
    DisputeWindowNotExpired = 25,
    ChallengeNotAllowed = 26,

    // Time-related errors
    ResolutionTimePassed = 27,
    ResolutionTimeNotReached = 28,
    InvalidTimeWindow = 29,

    // Other errors
    OperationFailed = 30,
    DataSerializationFailed = 31,
    InternalError = 32,
}
