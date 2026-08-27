use crate::error::BatchitError;
use crate::events::Claimed;
use crate::math::allocation;
use crate::state::{Contribution, Pool, PoolStatus};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer, Token, TokenAccount};

pub fn handler(ctx: Context<Claim>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    require!(pool.status == PoolStatus::Finalized, BatchitError::ClaimNotAllowed);

    let contrib = &mut ctx.accounts.contribution;
    require!(
        contrib.contributor == ctx.accounts.contributor.key(),
        BatchitError::NotContributor
    );
    require!(!contrib.claimed, BatchitError::NothingToClaim);
    require!(!contrib.refunded, BatchitError::NothingToClaim);
    require!(contrib.amount > 0, BatchitError::NothingToClaim);

    let tokens = allocation(
        pool.distributable,
        contrib.amount,
        pool.total_contributed,
    )?;
    require!(tokens > 0 || pool.distributable == 0, BatchitError::NothingToClaim);

    if tokens > 0 {
        let pool_key = pool.key();
        let seeds: &[&[u8]] = &[b"buyer", pool_key.as_ref(), &[pool.buyer_bump]];
        let signer = &[seeds];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault_ata.to_account_info(),
                    to: ctx.accounts.contributor_ata.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
                signer,
            ),
            tokens,
        )?;
    }

    contrib.claimed = true;
    pool.total_claimed = pool
        .total_claimed
        .checked_add(tokens)
        .ok_or(BatchitError::MathOverflow)?;

    emit!(Claimed {
        pool: pool.key(),
        contributor: contrib.contributor,
        amount: contrib.amount,
        tokens,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Claim<'info> {
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

    /// CHECK: buyer PDA
    #[account(
        seeds = [b"buyer", pool.key().as_ref()],
        bump = pool.buyer_bump,
    )]
    pub buyer: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = vault_ata.owner == buyer.key() @ BatchitError::Unauthorized,
        constraint = vault_ata.mint == pool.mint @ BatchitError::MintMismatch,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = contributor_ata.owner == contributor.key() @ BatchitError::Unauthorized,
        constraint = contributor_ata.mint == pool.mint @ BatchitError::MintMismatch,
    )]
    pub contributor_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
