use crate::error::BatchitError;
use crate::events::PoolCreated;
use crate::state::{Pool, PoolStatus};
use anchor_lang::prelude::*;

pub fn handler(
    ctx: Context<CreatePool>,
    seed: u64,
    launch_at: i64,
    grace_secs: i64,
    min_raise_lamports: u64,
    max_pool_lamports: u64,
    min_contribution_lamports: u64,
) -> Result<()> {
    require!(grace_secs > 0, BatchitError::InvalidParams);
    require!(min_contribution_lamports > 0, BatchitError::InvalidParams);
    require!(
        min_raise_lamports >= min_contribution_lamports,
        BatchitError::InvalidParams
    );
    require!(
        max_pool_lamports >= min_raise_lamports,
        BatchitError::InvalidParams
    );
    let now = Clock::get()?.unix_timestamp;
    require!(launch_at > now, BatchitError::InvalidParams);

    let grace_ends_at = launch_at
        .checked_add(grace_secs)
        .ok_or(BatchitError::MathOverflow)?;

    let pool = &mut ctx.accounts.pool;
    pool.bump = ctx.bumps.pool;
    pool.buyer_bump = ctx.bumps.buyer;
    pool.status = PoolStatus::Open;
    pool.creator = ctx.accounts.creator.key();
    pool.seed = seed;
    pool.mint = Pubkey::default();
    pool.launch_at = launch_at;
    pool.grace_ends_at = grace_ends_at;
    pool.min_raise_lamports = min_raise_lamports;
    pool.max_pool_lamports = max_pool_lamports;
    pool.min_contribution_lamports = min_contribution_lamports;
    pool.total_contributed = 0;
    pool.contributor_count = 0;
    pool.tokens_bought = 0;
    pool.distributable = 0;
    pool.burned = 0;
    pool.post_virtual_token_reserves = 0;
    pool.post_virtual_quote_reserves = 0;
    pool.total_claimed = 0;
    pool.total_refunded = 0;

    emit!(PoolCreated {
        pool: pool.key(),
        creator: pool.creator,
        seed,
        launch_at,
        grace_ends_at,
        min_raise_lamports,
        max_pool_lamports,
        min_contribution_lamports,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = Pool::LEN,
        seeds = [b"pool", creator.key().as_ref(), &seed.to_le_bytes()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: buyer PDA — only holds lamports / signs CPI; no data.
    #[account(
        seeds = [b"buyer", pool.key().as_ref()],
        bump
    )]
    pub buyer: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
