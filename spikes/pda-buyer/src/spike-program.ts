/**
 * Client helpers for the spike_pda_buyer program
 * (PDA fund + buy_exact_sol_in via invoke_signed).
 */
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  bondingCurvePda,
  bondingCurveV2Pda,
  associatedBondingCurve,
  creatorVaultPda,
  eventAuthorityPda,
  feeConfigPda,
  globalPda,
  globalVolumeAccumulatorPda,
  userVolumeAccumulatorPda,
  PUMP_PROGRAM_ID,
  PUMP_FEE_PROGRAM_ID,
} from "./pump.js";

/** Anchor instruction discriminator = first 8 bytes of sha256("global:<name>") */
import { createHash } from "node:crypto";

function anchorDisc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export function buyerPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("buyer")], programId);
}

export function buildFundBuyerIx(params: {
  programId: PublicKey;
  payer: PublicKey;
  lamports: bigint | number;
}): TransactionInstruction {
  const [buyer] = buyerPda(params.programId);
  const data = Buffer.alloc(8 + 8);
  anchorDisc("fund_buyer").copy(data, 0);
  data.writeBigUInt64LE(BigInt(params.lamports), 8);

  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: buyer, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildPdaBuyIx(params: {
  programId: PublicKey;
  mint: PublicKey;
  creator: PublicKey;
  feeRecipient: PublicKey;
  /** One of Global.buyback_fee_recipients */
  buybackFeeRecipient: PublicKey;
  spendableSolIn: bigint | number;
  minTokensOut: bigint | number;
  trackVolume?: boolean;
  tokenProgram?: PublicKey;
}): TransactionInstruction {
  const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;
  const [buyer] = buyerPda(params.programId);
  const bondingCurve = bondingCurvePda(params.mint);
  const assocBc = associatedBondingCurve(bondingCurve, params.mint, tokenProgram);
  const associatedUser = getAssociatedTokenAddressSync(
    params.mint,
    buyer,
    true,
    tokenProgram,
  );

  const data = Buffer.alloc(8 + 8 + 8 + 1);
  anchorDisc("buy_exact_sol_in_with_pda").copy(data, 0);
  data.writeBigUInt64LE(BigInt(params.spendableSolIn), 8);
  data.writeBigUInt64LE(BigInt(params.minTokensOut), 16);
  data[24] = params.trackVolume ? 1 : 0;

  const keys = [
    { pubkey: buyer, isSigner: false, isWritable: true },
    { pubkey: globalPda(), isSigner: false, isWritable: false },
    { pubkey: params.feeRecipient, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: assocBc, isSigner: false, isWritable: true },
    { pubkey: associatedUser, isSigner: false, isWritable: true },
    {
      pubkey: creatorVaultPda(params.creator),
      isSigner: false,
      isWritable: true,
    },
    { pubkey: eventAuthorityPda(), isSigner: false, isWritable: false },
    { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    {
      pubkey: globalVolumeAccumulatorPda(),
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: userVolumeAccumulatorPda(buyer),
      isSigner: false,
      isWritable: true,
    },
    { pubkey: feeConfigPda(), isSigner: false, isWritable: false },
    { pubkey: PUMP_FEE_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    {
      pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    // remaining: [bonding_curve_v2, buyback_fee_recipient] per pump-sdk
    {
      pubkey: bondingCurveV2Pda(params.mint),
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: params.buybackFeeRecipient,
      isSigner: false,
      isWritable: true,
    },
  ];

  return new TransactionInstruction({
    programId: params.programId,
    keys,
    data,
  });
}

export function associatedUserAta(
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
}
