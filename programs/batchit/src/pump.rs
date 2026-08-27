//! Pump CPI helpers — layout from third_party/pump-sdk/PIN.md (@pump-fun/pump-sdk@1.36.0).

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

pub const PUMP_PROGRAM_ID: Pubkey = pubkey!("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
pub const PUMP_FEE_PROGRAM_ID: Pubkey = pubkey!("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");

const BUY_EXACT_SOL_IN_DISCRIMINATOR: [u8; 8] = [56, 252, 116, 8, 158, 223, 205, 95];

/// Bonding curve layout (partial) for reading reserves after buy.
/// Matches BondingCurve in pinned pump-sdk IDL (first fields).
#[derive(Clone, Copy, Debug)]
pub struct BondingCurveReserves {
    pub virtual_token_reserves: u64,
    pub virtual_quote_reserves: u64,
    pub real_token_reserves: u64,
    pub real_quote_reserves: u64,
}

/// Decode reserves from bonding curve account data (8-byte Anchor disc + fields).
pub fn decode_bonding_curve_reserves(data: &[u8]) -> Result<BondingCurveReserves> {
    require!(data.len() >= 8 + 32, crate::error::BatchitError::CreateNotLanded);
    let d = &data[8..];
    Ok(BondingCurveReserves {
        virtual_token_reserves: u64::from_le_bytes(d[0..8].try_into().unwrap()),
        virtual_quote_reserves: u64::from_le_bytes(d[8..16].try_into().unwrap()),
        real_token_reserves: u64::from_le_bytes(d[16..24].try_into().unwrap()),
        real_quote_reserves: u64::from_le_bytes(d[24..32].try_into().unwrap()),
    })
}

pub fn bonding_curve_pda(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"bonding-curve", mint.as_ref()], &PUMP_PROGRAM_ID)
}

pub fn bonding_curve_v2_pda(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"bonding-curve-v2", mint.as_ref()], &PUMP_PROGRAM_ID)
}

pub fn creator_vault_pda(creator: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"creator-vault", creator.as_ref()], &PUMP_PROGRAM_ID)
}

pub fn global_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"global"], &PUMP_PROGRAM_ID)
}

pub fn event_authority_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"__event_authority"], &PUMP_PROGRAM_ID)
}

pub fn global_volume_accumulator_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"global_volume_accumulator"], &PUMP_PROGRAM_ID)
}

pub fn user_volume_accumulator_pda(user: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"user_volume_accumulator", user.as_ref()],
        &PUMP_PROGRAM_ID,
    )
}

pub fn fee_config_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"fee_config", PUMP_PROGRAM_ID.as_ref()],
        &PUMP_FEE_PROGRAM_ID,
    )
}

/// CPI buy_exact_sol_in with buyer PDA as signer.
/// remaining on the outer instruction must already be validated; here we take AccountInfos.
#[allow(clippy::too_many_arguments)]
pub fn cpi_buy_exact_sol_in<'info>(
    buyer: AccountInfo<'info>,
    buyer_seeds: &[&[u8]],
    global: AccountInfo<'info>,
    fee_recipient: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    bonding_curve: AccountInfo<'info>,
    associated_bonding_curve: AccountInfo<'info>,
    associated_user: AccountInfo<'info>,
    creator_vault: AccountInfo<'info>,
    event_authority: AccountInfo<'info>,
    pump_program: AccountInfo<'info>,
    global_volume_accumulator: AccountInfo<'info>,
    user_volume_accumulator: AccountInfo<'info>,
    fee_config: AccountInfo<'info>,
    fee_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    bonding_curve_v2: AccountInfo<'info>,
    buyback_fee_recipient: AccountInfo<'info>,
    spendable_sol_in: u64,
    min_tokens_out: u64,
) -> Result<()> {
    let mut data = Vec::with_capacity(25);
    data.extend_from_slice(&BUY_EXACT_SOL_IN_DISCRIMINATOR);
    data.extend_from_slice(&spendable_sol_in.to_le_bytes());
    data.extend_from_slice(&min_tokens_out.to_le_bytes());
    data.push(0); // track_volume = false

    let buyer_key = *buyer.key;
    let accounts = vec![
        AccountMeta::new_readonly(*global.key, false),
        AccountMeta::new(*fee_recipient.key, false),
        AccountMeta::new_readonly(*mint.key, false),
        AccountMeta::new(*bonding_curve.key, false),
        AccountMeta::new(*associated_bonding_curve.key, false),
        AccountMeta::new(*associated_user.key, false),
        AccountMeta::new(buyer_key, true),
        AccountMeta::new_readonly(*system_program.key, false),
        AccountMeta::new_readonly(*token_program.key, false),
        AccountMeta::new(*creator_vault.key, false),
        AccountMeta::new_readonly(*event_authority.key, false),
        AccountMeta::new_readonly(*pump_program.key, false),
        AccountMeta::new_readonly(*global_volume_accumulator.key, false),
        AccountMeta::new(*user_volume_accumulator.key, false),
        AccountMeta::new_readonly(*fee_config.key, false),
        AccountMeta::new_readonly(*fee_program.key, false),
        AccountMeta::new_readonly(*bonding_curve_v2.key, false),
        AccountMeta::new(*buyback_fee_recipient.key, false),
    ];

    let ix = Instruction {
        program_id: PUMP_PROGRAM_ID,
        accounts,
        data,
    };

    let infos = [
        global,
        fee_recipient,
        mint,
        bonding_curve,
        associated_bonding_curve,
        associated_user,
        buyer,
        system_program,
        token_program,
        creator_vault,
        event_authority,
        pump_program,
        global_volume_accumulator,
        user_volume_accumulator,
        fee_config,
        fee_program,
        bonding_curve_v2,
        buyback_fee_recipient,
    ];

    invoke_signed(&ix, &infos, &[buyer_seeds]).map_err(|e| {
        msg!("pump buy CPI failed: {:?}", e);
        error!(crate::error::BatchitError::BuyFailed)
    })?;
    Ok(())
}
