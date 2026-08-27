use crate::error::BatchitError;
use crate::events::Finalized;
use crate::math::compute_distributable;
use crate::state::{Pool, PoolStatus};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Token, TokenAccount};

/// Compute distributable from on-chain curve reserves (stored at buy), burn surplus via SPL burn.
pub fn handler(ctx: Context<Finalize>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    require!(pool.status == PoolStatus::Bought, BatchitError::BadStatus);
    require!(pool.tokens_bought > 0, BatchitError::ZeroTokensBought);

    // Prefer live curve reserves if available; else snapshot from buy.
    let (vtok, vquote) = {
        let data = ctx.accounts.bonding_curve.try_borrow_data()?;
        if data.len() >= 40 {
            let r = crate::pump::decode_bonding_curve_reserves(&data)?;
            (r.virtual_token_reserves, r.virtual_quote_reserves)
        } else {
            (
                pool.post_virtual_token_reserves,
                pool.post_virtual_quote_reserves,
            )
        }
    };
    require!(vquote > 0 && vtok > 0, BatchitError::MathOverflow);

    let (distributable, burned) = compute_distributable(
        pool.total_contributed,
        pool.tokens_bought,
        vtok,
        vquote,
    )?;

    // Burn from buyer ATA (vault).
    if burned > 0 {
        let pool_key = pool.key();
        let seeds: &[&[u8]] = &[b"buyer", pool_key.as_ref(), &[pool.buyer_bump]];
        let signer = &[seeds];
        let cpi = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.associated_user.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
            signer,
        );
        token::burn(cpi, burned)?;
    }

    pool.distributable = distributable;
    pool.burned = burned;
    pool.post_virtual_token_reserves = vtok;
    pool.post_virtual_quote_reserves = vquote;
    pool.status = PoolStatus::Finalized;

    emit!(Finalized {
        pool: pool.key(),
        mint: pool.mint,
        total_contributed: pool.total_contributed,
        tokens_bought: pool.tokens_bought,
        distributable,
        burned,
        post_virtual_token_reserves: vtok,
        post_virtual_quote_reserves: vquote,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Finalize<'info> {
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.seed.to_le_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: buyer PDA is mint authority for burn of its ATA
    #[account(
        seeds = [b"buyer", pool.key().as_ref()],
        bump = pool.buyer_bump,
    )]
    pub buyer: UncheckedAccount<'info>,

    /// CHECK: mint
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = associated_user.owner == buyer.key() @ BatchitError::Unauthorized,
        constraint = associated_user.mint == pool.mint @ BatchitError::MintMismatch,
    )]
    pub associated_user: Account<'info, TokenAccount>,

    /// CHECK: bonding curve for live price
    pub bonding_curve: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}
