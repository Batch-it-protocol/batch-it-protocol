use crate::error::BatchitError;
use crate::events::Refunded;
use crate::state::{Contribution, Pool, PoolStatus};
use anchor_lang::prelude::*;

/// Permissionless when Open (before launch? only if we allow — plan: after Refundable or grace-failed Launching).
/// Also: if Open and past grace without ever launching — mark path via mark_refundable first.
pub fn handler(ctx: Context<Refund>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let now = Clock::get()?.unix_timestamp;

    let allowed = match pool.status {
        PoolStatus::Refundable => true,
        // Launching past grace without buy — allow refund without separate mark
        PoolStatus::Launching if now >= pool.grace_ends_at => true,
        // Open past grace without begin_launch — stuck raise
        PoolStatus::Open if now >= pool.grace_ends_at => true,
        _ => false,
    };
    require!(allowed, BatchitError::RefundNotAllowed);

    // Auto-transition for clarity
    if pool.status == PoolStatus::Launching || pool.status == PoolStatus::Open {
        if now >= pool.grace_ends_at && pool.status != PoolStatus::Bought {
            pool.status = PoolStatus::Refundable;
        }
    }

    let contrib = &mut ctx.accounts.contribution;
    require!(
        contrib.contributor == ctx.accounts.contributor.key(),
        BatchitError::NotContributor
    );
    require!(!contrib.refunded, BatchitError::NothingToRefund);
    require!(!contrib.claimed, BatchitError::NothingToRefund);
    require!(contrib.amount > 0, BatchitError::NothingToRefund);

    let amount = contrib.amount;
    contrib.refunded = true;
    contrib.amount = 0;

    pool.total_contributed = pool
        .total_contributed
        .checked_sub(amount)
        .ok_or(BatchitError::MathOverflow)?;
    pool.total_refunded = pool
        .total_refunded
        .checked_add(amount)
        .ok_or(BatchitError::MathOverflow)?;

    // Transfer lamports pool → contributor
    **pool.to_account_info().try_borrow_mut_lamports()? = pool
        .to_account_info()
        .lamports()
        .checked_sub(amount)
        .ok_or(BatchitError::MathOverflow)?;
    **ctx
        .accounts
        .contributor
        .to_account_info()
        .try_borrow_mut_lamports()? = ctx
        .accounts
        .contributor
        .to_account_info()
        .lamports()
        .checked_add(amount)
        .ok_or(BatchitError::MathOverflow)?;

    emit!(Refunded {
        pool: pool.key(),
        contributor: contrib.contributor,
        amount,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.seed.to_le_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"contribution", pool.key().as_ref(), contributor.key().as_ref()],
        bump = contribution.bump,
        has_one = pool,
    )]
    pub contribution: Account<'info, Contribution>,
}
