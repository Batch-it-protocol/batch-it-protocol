//! Spike program: prove pump.fun accepts a PDA as `user` on buy via `invoke_signed`.
//!
//! Remaining accounts for pump `buy_exact_sol_in` (from @pump-fun/pump-sdk):
//!   [0] bonding_curve_v2 PDA (readonly)  seeds = ["bonding-curve-v2", mint]
//!   [1] buyback_fee_recipient (writable) one of Global.buyback_fee_recipients

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
    system_instruction,
};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{TokenAccount, TokenInterface};

declare_id!("2i6MFa3CJVu3WYTZmGMuef9tSciU35A7MRagcMQdnAsE");

pub const PUMP_PROGRAM_ID: Pubkey = pubkey!("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const BUY_EXACT_SOL_IN_DISCRIMINATOR: [u8; 8] = [56, 252, 116, 8, 158, 223, 205, 95];
pub const BUYER_SEED: &[u8] = b"buyer";

#[program]
pub mod spike_pda_buyer {
    use super::*;

    pub fn fund_buyer(ctx: Context<FundBuyer>, lamports: u64) -> Result<()> {
        require!(lamports > 0, SpikeError::ZeroAmount);
        let ix = system_instruction::transfer(
            &ctx.accounts.payer.key(),
            &ctx.accounts.buyer.key(),
            lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        msg!(
            "spike_fund_buyer buyer={} lamports={}",
            ctx.accounts.buyer.key(),
            lamports
        );
        Ok(())
    }

    /// CPI buy_exact_sol_in with PDA as user.
    /// remaining_accounts: [bonding_curve_v2, buyback_fee_recipient]
    pub fn buy_exact_sol_in_with_pda<'a>(
        ctx: Context<'a, BuyExactSolInWithPda<'a>>,
        spendable_sol_in: u64,
        min_tokens_out: u64,
        track_volume: bool,
    ) -> Result<()> {
        require!(spendable_sol_in > 0, SpikeError::ZeroAmount);
        require!(
            ctx.remaining_accounts.len() == 2,
            SpikeError::BadRemainingAccounts
        );

        let buyer_key = ctx.accounts.buyer.key();
        let bump = ctx.bumps.buyer;
        let seeds: &[&[u8]] = &[BUYER_SEED, &[bump]];
        let signer_seeds = &[seeds];

        let bonding_curve_v2 = &ctx.remaining_accounts[0];
        let buyback_fee_recipient = &ctx.remaining_accounts[1];

        let mut accounts = vec![
            AccountMeta::new_readonly(ctx.accounts.global.key(), false),
            AccountMeta::new(ctx.accounts.fee_recipient.key(), false),
            AccountMeta::new_readonly(ctx.accounts.mint.key(), false),
            AccountMeta::new(ctx.accounts.bonding_curve.key(), false),
            AccountMeta::new(ctx.accounts.associated_bonding_curve.key(), false),
            AccountMeta::new(ctx.accounts.associated_user.key(), false),
            AccountMeta::new(buyer_key, true),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
            AccountMeta::new(ctx.accounts.creator_vault.key(), false),
            AccountMeta::new_readonly(ctx.accounts.event_authority.key(), false),
            AccountMeta::new_readonly(ctx.accounts.pump_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.global_volume_accumulator.key(), false),
            AccountMeta::new(ctx.accounts.user_volume_accumulator.key(), false),
            AccountMeta::new_readonly(ctx.accounts.fee_config.key(), false),
            AccountMeta::new_readonly(ctx.accounts.fee_program.key(), false),
            // remaining
            AccountMeta::new_readonly(bonding_curve_v2.key(), false),
            AccountMeta::new(buyback_fee_recipient.key(), false),
        ];
        let _ = &mut accounts; // silence if optimized

        let mut data = Vec::with_capacity(8 + 8 + 8 + 1);
        data.extend_from_slice(&BUY_EXACT_SOL_IN_DISCRIMINATOR);
        data.extend_from_slice(&spendable_sol_in.to_le_bytes());
        data.extend_from_slice(&min_tokens_out.to_le_bytes());
        data.push(if track_volume { 1 } else { 0 });

        let ix = Instruction {
            program_id: PUMP_PROGRAM_ID,
            accounts,
            data,
        };

        let account_infos = vec![
            ctx.accounts.global.to_account_info(),
            ctx.accounts.fee_recipient.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.bonding_curve.to_account_info(),
            ctx.accounts.associated_bonding_curve.to_account_info(),
            ctx.accounts.associated_user.to_account_info(),
            ctx.accounts.buyer.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.creator_vault.to_account_info(),
            ctx.accounts.event_authority.to_account_info(),
            ctx.accounts.pump_program.to_account_info(),
            ctx.accounts.global_volume_accumulator.to_account_info(),
            ctx.accounts.user_volume_accumulator.to_account_info(),
            ctx.accounts.fee_config.to_account_info(),
            ctx.accounts.fee_program.to_account_info(),
            bonding_curve_v2.to_account_info(),
            buyback_fee_recipient.to_account_info(),
        ];

        msg!(
            "spike_pda_buy invoke_signed buyer={} spendable_sol_in={} bc_v2={} buyback={}",
            buyer_key,
            spendable_sol_in,
            bonding_curve_v2.key(),
            buyback_fee_recipient.key()
        );

        invoke_signed(&ix, &account_infos, signer_seeds).map_err(|e| {
            msg!("spike_pda_buy FAILED: {:?}", e);
            error!(SpikeError::PumpBuyRejected)
        })?;

        msg!(
            "spike_pda_buy SUCCESS buyer={} mint={}",
            buyer_key,
            ctx.accounts.mint.key()
        );

        emit!(PdaBuySucceeded {
            buyer: buyer_key,
            mint: ctx.accounts.mint.key(),
            spendable_sol_in,
            min_tokens_out,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct FundBuyer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: PDA buyer
    #[account(mut, seeds = [BUYER_SEED], bump)]
    pub buyer: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyExactSolInWithPda<'info> {
    /// CHECK: PDA buyer
    #[account(mut, seeds = [BUYER_SEED], bump)]
    pub buyer: UncheckedAccount<'info>,
    /// CHECK: pump global
    pub global: UncheckedAccount<'info>,
    /// CHECK: fee recipient
    #[account(mut)]
    pub fee_recipient: UncheckedAccount<'info>,
    /// CHECK: mint
    pub mint: UncheckedAccount<'info>,
    /// CHECK: bonding curve
    #[account(mut)]
    pub bonding_curve: UncheckedAccount<'info>,
    /// CHECK: curve ATA
    #[account(mut)]
    pub associated_bonding_curve: UncheckedAccount<'info>,
    #[account(mut)]
    pub associated_user: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: creator vault
    #[account(mut)]
    pub creator_vault: UncheckedAccount<'info>,
    /// CHECK: event authority
    pub event_authority: UncheckedAccount<'info>,
    /// CHECK: pump program
    #[account(address = PUMP_PROGRAM_ID)]
    pub pump_program: UncheckedAccount<'info>,
    /// CHECK: global volume
    pub global_volume_accumulator: UncheckedAccount<'info>,
    /// CHECK: user volume
    #[account(mut)]
    pub user_volume_accumulator: UncheckedAccount<'info>,
    /// CHECK: fee config
    pub fee_config: UncheckedAccount<'info>,
    /// CHECK: fee program
    pub fee_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[event]
pub struct PdaBuySucceeded {
    pub buyer: Pubkey,
    pub mint: Pubkey,
    pub spendable_sol_in: u64,
    pub min_tokens_out: u64,
}

#[error_code]
pub enum SpikeError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("pump.fun rejected PDA buyer CPI")]
    PumpBuyRejected,
    #[msg("remaining_accounts must be [bonding_curve_v2, buyback_fee_recipient]")]
    BadRemainingAccounts,
}
