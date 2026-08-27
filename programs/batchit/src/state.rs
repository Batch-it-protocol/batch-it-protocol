use anchor_lang::prelude::*;

/// Pool lifecycle. Partial-landing design:
/// - `Launching`: mint committed; SOL still in escrow until `Bought`.
/// - Create-without-buy: stay `Launching`, retry buy-only, or grace → `Refundable`.
/// - Buy-without-create: impossible — complete_buy fails with CreateNotLanded.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[borsh(use_discriminant = true)]
#[repr(u8)]
pub enum PoolStatus {
    Open = 0,
    Launching = 1,
    Bought = 2,
    Finalized = 3,
    Refundable = 4,
    Closed = 5,
}

impl Default for PoolStatus {
    fn default() -> Self {
        Self::Open
    }
}

#[account]
pub struct Pool {
    /// Bump for this pool PDA.
    pub bump: u8,
    /// Bump for buyer PDA `["buyer", pool]`.
    pub buyer_bump: u8,
    pub status: PoolStatus,
    /// create_pool payer (not fund custodian).
    pub creator: Pubkey,
    /// Client-chosen seed for PDA uniqueness.
    pub seed: u64,
    /// Pump mint. Default until begin_launch.
    pub mint: Pubkey,
    /// Unix timestamp: last moment to contribute (exclusive of launch).
    pub launch_at: i64,
    /// Unix timestamp: end of execute window (launch_at + grace).
    pub grace_ends_at: i64,
    pub min_raise_lamports: u64,
    pub max_pool_lamports: u64,
    pub min_contribution_lamports: u64,
    /// Sum of contributions still active (not refunded).
    pub total_contributed: u64,
    pub contributor_count: u32,
    /// Tokens received by buyer PDA on complete_buy (raw units).
    pub tokens_bought: u64,
    /// Tokens available to claim after finalize.
    pub distributable: u64,
    /// Permanently burned.
    pub burned: u64,
    /// Post-buy curve virtual reserves (for audit).
    pub post_virtual_token_reserves: u64,
    pub post_virtual_quote_reserves: u64,
    /// Total claimed (tokens) for close checks.
    pub total_claimed: u64,
    /// Total refunded (lamports).
    pub total_refunded: u64,
}

impl Pool {
    pub const LEN: usize = 8 // disc
        + 1  // bump
        + 1  // buyer_bump
        + 1  // status
        + 32 // creator
        + 8  // seed
        + 32 // mint
        + 8  // launch_at
        + 8  // grace_ends_at
        + 8  // min_raise
        + 8  // max_pool
        + 8  // min_contribution
        + 8  // total_contributed
        + 4  // contributor_count
        + 8  // tokens_bought
        + 8  // distributable
        + 8  // burned
        + 8  // post_virtual_token
        + 8  // post_virtual_quote
        + 8  // total_claimed
        + 8; // total_refunded
}

#[account]
pub struct Contribution {
    pub bump: u8,
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
    pub claimed: bool,
    pub refunded: bool,
}

impl Contribution {
    pub const LEN: usize = 8 + 1 + 32 + 32 + 8 + 1 + 1;
}
