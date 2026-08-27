use crate::error::BatchitError;
use crate::events::BuyCompleted;
use crate::pump::{self, decode_bonding_curve_reserves};
use crate::state::{Pool, PoolStatus};
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

/// PDA-signed pump buy. Partial-landing recovery:
/// - If bonding curve missing → CreateNotLanded (retry create+buy bundle).
/// - If already Bought → no-op success (idempotent).
/// - Buy-without-create is impossible: CPI fails without curve.
pub fn handler(ctx: Context<CompleteBuy>, min_tokens_out: u64) -> Result<()> {
    let pool_key = ctx.accounts.pool.key();
    let pool = &mut ctx.accounts.pool;

    if pool.status == PoolStatus::Bought {
        msg!("complete_buy idempotent: already Bought");
        return Ok(());
    }
    require!(pool.status == PoolStatus::Launching, BatchitError::BadStatus);

    let now = Clock::get()?.unix_timestamp;
    require!(now < pool.grace_ends_at, BatchitError::LaunchGraceExpired);
    require!(pool.mint != Pubkey::default(), BatchitError::MintNotSet);
    require!(
        ctx.accounts.mint.key() == pool.mint,
        BatchitError::MintMismatch
    );

    // Create-not-landed detection: bonding curve account empty / wrong owner.
    let bc_info = ctx.accounts.bonding_curve.to_account_info();
    require!(
        !bc_info.data_is_empty() && *bc_info.owner == pump::PUMP_PROGRAM_ID,
        BatchitError::CreateNotLanded
    );

    let spendable = pool.total_contributed;
    require!(spendable > 0, BatchitError::ZeroAmount);

    // Move SOL pool → buyer PDA (buyer pays pump).
    **pool.to_account_info().try_borrow_mut_lamports()? = pool
        .to_account_info()
        .lamports()
        .checked_sub(spendable)
        .ok_or(BatchitError::MathOverflow)?;
    **ctx.accounts.buyer.try_borrow_mut_lamports()? = ctx
        .accounts
        .buyer
        .lamports()
        .checked_add(spendable)
        .ok_or(BatchitError::MathOverflow)?;

    let buyer_bump = pool.buyer_bump;
    let buyer_seeds: &[&[u8]] = &[b"buyer", pool_key.as_ref(), &[buyer_bump]];

    let token_before = ctx.accounts.associated_user.amount;

    #[cfg(not(feature = "test-mock-buy"))]
    {
        pump::cpi_buy_exact_sol_in(
            ctx.accounts.buyer.to_account_info(),
            buyer_seeds,
            ctx.accounts.global.to_account_info(),
            ctx.accounts.fee_recipient.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.bonding_curve.to_account_info(),
            ctx.accounts.associated_bonding_curve.to_account_info(),
            ctx.accounts.associated_user.to_account_info(),
            ctx.accounts.creator_vault.to_account_info(),
            ctx.accounts.event_authority.to_account_info(),
            ctx.accounts.pump_program.to_account_info(),
            ctx.accounts.global_volume_accumulator.to_account_info(),
            ctx.accounts.user_volume_accumulator.to_account_info(),
            ctx.accounts.fee_config.to_account_info(),
            ctx.accounts.fee_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.bonding_curve_v2.to_account_info(),
            ctx.accounts.buyback_fee_recipient.to_account_info(),
            spendable,
            min_tokens_out,
        )?;
    }

    #[cfg(feature = "test-mock-buy")]
    {
        msg!("test-mock-buy: skipping pump CPI; min_tokens_out={}", min_tokens_out);
        let _ = (min_tokens_out, buyer_seeds);
    }

    ctx.accounts.associated_user.reload()?;
    let token_after = ctx.accounts.associated_user.amount;
    let mut tokens_bought = token_after.saturating_sub(token_before);

    #[cfg(feature = "test-mock-buy")]
    if tokens_bought == 0 {
        tokens_bought = ctx.accounts.associated_user.amount;
    }

    #[cfg(not(feature = "test-mock-buy"))]
    require!(tokens_bought > 0, BatchitError::ZeroTokensBought);

    let reserves = decode_bonding_curve_reserves(
        &ctx.accounts.bonding_curve.to_account_info().data.borrow(),
    )
    .unwrap_or(pump::BondingCurveReserves {
        virtual_token_reserves: 0,
        virtual_quote_reserves: 0,
        real_token_reserves: 0,
        real_quote_reserves: 0,
    });

    pool.tokens_bought = tokens_bought;
    pool.post_virtual_token_reserves = reserves.virtual_token_reserves;
    pool.post_virtual_quote_reserves = reserves.virtual_quote_reserves;
    pool.status = PoolStatus::Bought;

    emit!(BuyCompleted {
        pool: pool_key,
        mint: pool.mint,
        spendable_sol: spendable,
        tokens_bought,
        post_virtual_token_reserves: reserves.virtual_token_reserves,
        post_virtual_quote_reserves: reserves.virtual_quote_reserves,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CompleteBuy<'info> {
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.seed.to_le_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: buyer PDA
    #[account(
        mut,
        seeds = [b"buyer", pool.key().as_ref()],
        bump = pool.buyer_bump,
    )]
    pub buyer: UncheckedAccount<'info>,

    /// CHECK: mint must match pool.mint
    pub mint: UncheckedAccount<'info>,

    /// CHECK: pump global
    pub global: UncheckedAccount<'info>,
    /// CHECK: fee recipient
    #[account(mut)]
    pub fee_recipient: UncheckedAccount<'info>,
    /// CHECK: bonding curve
    #[account(mut)]
    pub bonding_curve: UncheckedAccount<'info>,
    /// CHECK: curve ATA
    #[account(mut)]
    pub associated_bonding_curve: UncheckedAccount<'info>,
    #[account(mut)]
    pub associated_user: Account<'info, TokenAccount>,
    /// CHECK: creator vault
    #[account(mut)]
    pub creator_vault: UncheckedAccount<'info>,
    /// CHECK: event authority
    pub event_authority: UncheckedAccount<'info>,
    /// CHECK: pump program
    #[account(address = pump::PUMP_PROGRAM_ID)]
    pub pump_program: UncheckedAccount<'info>,
    /// CHECK: global volume
    pub global_volume_accumulator: UncheckedAccount<'info>,
    /// CHECK: user volume for buyer
    #[account(mut)]
    pub user_volume_accumulator: UncheckedAccount<'info>,
    /// CHECK: fee config
    pub fee_config: UncheckedAccount<'info>,
    /// CHECK: fee program
    pub fee_program: UncheckedAccount<'info>,
    /// CHECK: bonding_curve_v2
    pub bonding_curve_v2: UncheckedAccount<'info>,
    /// CHECK: buyback fee recipient
    #[account(mut)]
    pub buyback_fee_recipient: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
