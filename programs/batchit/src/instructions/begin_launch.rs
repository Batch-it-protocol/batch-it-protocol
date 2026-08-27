use crate::error::BatchitError;
use crate::events::LaunchBegun;
use crate::state::{Pool, PoolStatus};
use anchor_lang::prelude::*;

/// Permissionless after launch_at (locked decision). Commits mint; SOL stays in escrow.
pub fn handler(ctx: Context<BeginLaunch>, mint: Pubkey) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    require!(pool.status == PoolStatus::Open, BatchitError::BadStatus);
    require!(mint != Pubkey::default(), BatchitError::InvalidParams);

    let now = Clock::get()?.unix_timestamp;
    require!(now >= pool.launch_at, BatchitError::LaunchTooEarly);
    require!(now < pool.grace_ends_at, BatchitError::LaunchGraceExpired);
    require!(
        pool.total_contributed >= pool.min_raise_lamports,
        BatchitError::MinRaiseNotMet
    );
    require!(pool.mint == Pubkey::default(), BatchitError::MintAlreadySet);

    pool.mint = mint;
    pool.status = PoolStatus::Launching;

    emit!(LaunchBegun {
        pool: pool.key(),
        mint,
        total_contributed: pool.total_contributed,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct BeginLaunch<'info> {
    /// Anyone may call once launch window is open (liveness without orchestrator).
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.seed.to_le_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,
}
