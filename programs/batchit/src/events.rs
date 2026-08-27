use anchor_lang::prelude::*;

#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub creator: Pubkey,
    pub seed: u64,
    pub launch_at: i64,
    pub grace_ends_at: i64,
    pub min_raise_lamports: u64,
    pub max_pool_lamports: u64,
    pub min_contribution_lamports: u64,
}

#[event]
pub struct Contributed {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
    pub total_contributed: u64,
}

#[event]
pub struct LaunchBegun {
    pub pool: Pubkey,
    pub mint: Pubkey,
    pub total_contributed: u64,
}

#[event]
pub struct BuyCompleted {
    pub pool: Pubkey,
    pub mint: Pubkey,
    pub spendable_sol: u64,
    pub tokens_bought: u64,
    pub post_virtual_token_reserves: u64,
    pub post_virtual_quote_reserves: u64,
}

/// Full burn breakdown for public audit.
#[event]
pub struct Finalized {
    pub pool: Pubkey,
    pub mint: Pubkey,
    pub total_contributed: u64,
    pub tokens_bought: u64,
    pub distributable: u64,
    pub burned: u64,
    pub post_virtual_token_reserves: u64,
    pub post_virtual_quote_reserves: u64,
}

#[event]
pub struct Claimed {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
    pub tokens: u64,
}

#[event]
pub struct Refunded {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MarkedRefundable {
    pub pool: Pubkey,
}
