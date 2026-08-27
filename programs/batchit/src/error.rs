use anchor_lang::prelude::*;

#[error_code]
pub enum BatchitError {
    #[msg("Pool is not in the expected status for this instruction")]
    BadStatus,
    #[msg("Contribution below min_contribution")]
    ContributionTooSmall,
    #[msg("Would exceed max_pool")]
    MaxPoolExceeded,
    #[msg("Contribution window closed (launch_at reached)")]
    ContributionClosed,
    #[msg("Launch window not open yet")]
    LaunchTooEarly,
    #[msg("Launch grace period expired")]
    LaunchGraceExpired,
    #[msg("min_raise not met")]
    MinRaiseNotMet,
    #[msg("Mint already committed")]
    MintAlreadySet,
    #[msg("Mint not committed — call begin_launch first")]
    MintNotSet,
    #[msg("Mint account mismatch with pool.mint")]
    MintMismatch,
    #[msg("Bonding curve missing — create has not landed (CreateNotLanded)")]
    CreateNotLanded,
    #[msg("Bonding curve exists but buy cannot proceed")]
    BuyFailed,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Nothing to claim / already claimed")]
    NothingToClaim,
    #[msg("Nothing to refund / already refunded")]
    NothingToRefund,
    #[msg("Refund not available in this state")]
    RefundNotAllowed,
    #[msg("Claim only after finalize")]
    ClaimNotAllowed,
    #[msg("Not a contributor")]
    NotContributor,
    #[msg("Fee recipient not authorized by Global")]
    BadFeeRecipient,
    #[msg("Invalid remaining accounts for pump buy")]
    BadPumpRemaining,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Pool not empty — cannot close")]
    PoolNotEmpty,
    #[msg("Invalid pool params")]
    InvalidParams,
    #[msg("Zero amount")]
    ZeroAmount,
    #[msg("Tokens bought is zero")]
    ZeroTokensBought,
    #[msg("Distributable would exceed tokens bought")]
    DistributableTooLarge,
}
