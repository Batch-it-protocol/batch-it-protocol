//! Minimal PDA buyer for pump.fun — no Anchor, small binary.
//! Instruction tag 0: fund_buyer (system transfer payer → PDA)
//! Instruction tag 1: buy_exact_sol_in_with_pda
//!
//! Buy accounts (same order as client):
//! 0 buyer PDA (writable, seeds=["buyer"])
//! 1 global
//! 2 fee_recipient (w)
//! 3 mint
//! 4 bonding_curve (w)
//! 5 associated_bonding_curve (w)
//! 6 associated_user (w)
//! 7 creator_vault (w)
//! 8 event_authority
//! 9 pump_program
//! 10 global_volume_accumulator
//! 11 user_volume_accumulator (w)
//! 12 fee_config
//! 13 fee_program
//! 14 system_program
//! 15 token_program
//! 16 bonding_curve_v2
//! 17 buyback_fee_recipient (w)
//! 18 payer (signer, unused for buy but may be present)
//!
//! Data for buy: [tag=1 u8][spendable_sol_in u64 LE][min_tokens_out u64 LE][track_volume u8]

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
    system_program,
};

entrypoint!(process_instruction);

pub const BUYER_SEED: &[u8] = b"buyer";
pub const PUMP_PROGRAM_ID: Pubkey =
    solana_program::pubkey!("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const BUY_EXACT_SOL_IN_DISCRIMINATOR: [u8; 8] = [56, 252, 116, 8, 158, 223, 205, 95];

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }
    match data[0] {
        0 => fund_buyer(program_id, accounts, &data[1..]),
        1 => buy_exact_sol_in_with_pda(program_id, accounts, &data[1..]),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn fund_buyer(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let lamports = u64::from_le_bytes(data[0..8].try_into().unwrap());
    if lamports == 0 {
        return Err(ProgramError::InvalidArgument);
    }

    let acc = &mut accounts.iter();
    let payer = next_account_info(acc)?;
    let buyer = next_account_info(acc)?;
    let system = next_account_info(acc)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let (expected, _bump) = Pubkey::find_program_address(&[BUYER_SEED], program_id);
    if buyer.key != &expected {
        return Err(ProgramError::InvalidSeeds);
    }
    if system.key != &system_program::id() {
        return Err(ProgramError::IncorrectProgramId);
    }

    invoke(
        &system_instruction::transfer(payer.key, buyer.key, lamports),
        &[payer.clone(), buyer.clone(), system.clone()],
    )?;
    msg!("lite_fund_buyer {} {}", buyer.key, lamports);
    Ok(())
}

fn buy_exact_sol_in_with_pda(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 17 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let spendable_sol_in = u64::from_le_bytes(data[0..8].try_into().unwrap());
    let min_tokens_out = u64::from_le_bytes(data[8..16].try_into().unwrap());
    let track_volume = data[16] != 0;
    if spendable_sol_in == 0 {
        return Err(ProgramError::InvalidArgument);
    }

    let acc = &mut accounts.iter();
    let buyer = next_account_info(acc)?;
    let global = next_account_info(acc)?;
    let fee_recipient = next_account_info(acc)?;
    let mint = next_account_info(acc)?;
    let bonding_curve = next_account_info(acc)?;
    let associated_bonding_curve = next_account_info(acc)?;
    let associated_user = next_account_info(acc)?;
    let creator_vault = next_account_info(acc)?;
    let event_authority = next_account_info(acc)?;
    let pump_program = next_account_info(acc)?;
    let global_volume_accumulator = next_account_info(acc)?;
    let user_volume_accumulator = next_account_info(acc)?;
    let fee_config = next_account_info(acc)?;
    let fee_program = next_account_info(acc)?;
    let system = next_account_info(acc)?;
    let token_program = next_account_info(acc)?;
    let bonding_curve_v2 = next_account_info(acc)?;
    let buyback_fee_recipient = next_account_info(acc)?;

    let (expected, bump) = Pubkey::find_program_address(&[BUYER_SEED], program_id);
    if buyer.key != &expected {
        return Err(ProgramError::InvalidSeeds);
    }
    if pump_program.key != &PUMP_PROGRAM_ID {
        return Err(ProgramError::IncorrectProgramId);
    }

    let mut ix_data = Vec::with_capacity(8 + 8 + 8 + 1);
    ix_data.extend_from_slice(&BUY_EXACT_SOL_IN_DISCRIMINATOR);
    ix_data.extend_from_slice(&spendable_sol_in.to_le_bytes());
    ix_data.extend_from_slice(&min_tokens_out.to_le_bytes());
    ix_data.push(if track_volume { 1 } else { 0 });

    let metas = vec![
        AccountMeta::new_readonly(*global.key, false),
        AccountMeta::new(*fee_recipient.key, false),
        AccountMeta::new_readonly(*mint.key, false),
        AccountMeta::new(*bonding_curve.key, false),
        AccountMeta::new(*associated_bonding_curve.key, false),
        AccountMeta::new(*associated_user.key, false),
        AccountMeta::new(*buyer.key, true),
        AccountMeta::new_readonly(*system.key, false),
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
        accounts: metas,
        data: ix_data,
    };

    let infos = vec![
        global.clone(),
        fee_recipient.clone(),
        mint.clone(),
        bonding_curve.clone(),
        associated_bonding_curve.clone(),
        associated_user.clone(),
        buyer.clone(),
        system.clone(),
        token_program.clone(),
        creator_vault.clone(),
        event_authority.clone(),
        pump_program.clone(),
        global_volume_accumulator.clone(),
        user_volume_accumulator.clone(),
        fee_config.clone(),
        fee_program.clone(),
        bonding_curve_v2.clone(),
        buyback_fee_recipient.clone(),
    ];

    let seeds: &[&[u8]] = &[BUYER_SEED, &[bump]];
    msg!(
        "lite_pda_buy attempting buyer={} spendable={}",
        buyer.key,
        spendable_sol_in
    );
    invoke_signed(&ix, &infos, &[seeds])?;
    msg!("lite_pda_buy SUCCESS mint={}", mint.key);
    Ok(())
}
