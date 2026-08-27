use crate::error::BatchitError;
use crate::events::MarkedRefundable;
use crate::state::{Pool, PoolStatus};
use anchor_lang::prelude::*;

/// Permissionless after grace if never Bought. Explicit state for clients/indexers.
pub fn handler(ctx: Context<MarkRefundable>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let now = Clock::get()?.unix_timestamp;
    require!(now >= pool.grace_ends_at, BatchitError::LaunchTooEarly);
    require!(
        pool.status == PoolStatus::Launching || pool.status == PoolStatus::Open,
        BatchitError::BadStatus
    );
    pool.status = PoolStatus::Refundable;
    emit!(MarkedRefundable { pool: pool.key() });
    Ok(())
}

#[derive(Accounts)]
pub struct MarkRefundable<'info> {
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.seed.to_le_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,
}
