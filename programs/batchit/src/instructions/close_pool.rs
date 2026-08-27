use crate::error::BatchitError;
use crate::state::{Pool, PoolStatus};
use anchor_lang::prelude::*;

/// Close empty pool account; rent to creator.
pub fn handler(ctx: Context<ClosePool>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    require!(
        pool.status == PoolStatus::Refundable
            || pool.status == PoolStatus::Finalized
            || pool.status == PoolStatus::Closed,
        BatchitError::BadStatus
    );
    require!(pool.total_contributed == 0, BatchitError::PoolNotEmpty);
    // Note: contribution accounts closed separately by users if needed.
    Ok(())
}

#[derive(Accounts)]
pub struct ClosePool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        close = creator,
        seeds = [b"pool", creator.key().as_ref(), &pool.seed.to_le_bytes()],
        bump = pool.bump,
        has_one = creator,
        constraint = pool.total_contributed == 0 @ BatchitError::PoolNotEmpty,
    )]
    pub pool: Account<'info, Pool>,
}
