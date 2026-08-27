use crate::error::BatchitError;
use crate::events::Contributed;
use crate::state::{Contribution, Pool, PoolStatus};
use anchor_lang::prelude::*;
use anchor_lang::system_program;

pub fn handler(ctx: Context<Contribute>, amount: u64) -> Result<()> {
    require!(amount > 0, BatchitError::ZeroAmount);
    let pool = &mut ctx.accounts.pool;
    require!(pool.status == PoolStatus::Open, BatchitError::BadStatus);

    let now = Clock::get()?.unix_timestamp;
    require!(now < pool.launch_at, BatchitError::ContributionClosed);
    require!(
        amount >= pool.min_contribution_lamports,
        BatchitError::ContributionTooSmall
    );

    let new_total = pool
        .total_contributed
        .checked_add(amount)
        .ok_or(BatchitError::MathOverflow)?;
    require!(
        new_total <= pool.max_pool_lamports,
        BatchitError::MaxPoolExceeded
    );

    // Transfer SOL into pool account (escrow).
    let cpi = CpiContext::new(
        ctx.accounts.system_program.key(),
        system_program::Transfer {
            from: ctx.accounts.contributor.to_account_info(),
            to: pool.to_account_info(),
        },
    );
    system_program::transfer(cpi, amount)?;

    let contrib = &mut ctx.accounts.contribution;
    let is_new = contrib.contributor == Pubkey::default() || contrib.amount == 0 && !contrib.refunded && contrib.pool == Pubkey::default();
    if is_new || contrib.contributor == Pubkey::default() {
        // First contribution into this PDA (init_if_needed)
        contrib.bump = ctx.bumps.contribution;
        contrib.pool = pool.key();
        contrib.contributor = ctx.accounts.contributor.key();
        contrib.claimed = false;
        contrib.refunded = false;
        if is_new {
            pool.contributor_count = pool
                .contributor_count
                .checked_add(1)
                .ok_or(BatchitError::MathOverflow)?;
        }
    }
    require!(
        contrib.contributor == ctx.accounts.contributor.key(),
        BatchitError::NotContributor
    );
    require!(contrib.pool == pool.key(), BatchitError::NotContributor);
    require!(!contrib.refunded, BatchitError::NothingToRefund);
    require!(!contrib.claimed, BatchitError::NothingToClaim);

    contrib.amount = contrib
        .amount
        .checked_add(amount)
        .ok_or(BatchitError::MathOverflow)?;
    pool.total_contributed = new_total;

    emit!(Contributed {
        pool: pool.key(),
        contributor: contrib.contributor,
        amount,
        total_contributed: pool.total_contributed,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.seed.to_le_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init_if_needed,
        payer = contributor,
        space = Contribution::LEN,
        seeds = [b"contribution", pool.key().as_ref(), contributor.key().as_ref()],
        bump
    )]
    pub contribution: Account<'info, Contribution>,

    pub system_program: Program<'info, System>,
}
