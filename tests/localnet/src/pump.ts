/**
 * Real pump instruction builders — remaining accounts per @pump-fun/pump-sdk@1.36.0 pin.
 */
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  MPL_TOKEN_METADATA,
  PUMP_FEE_PROGRAM_ID,
  PUMP_PROGRAM_ID,
} from "./constants.js";

const CREATE_DISC = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);
const BUY_EXACT_DISC = Buffer.from([56, 252, 116, 8, 158, 223, 205, 95]);

export function pumpPda(seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PUMP_PROGRAM_ID)[0];
}

export function globalPda(): PublicKey {
  return pumpPda([Buffer.from("global")]);
}
export function eventAuthorityPda(): PublicKey {
  return pumpPda([Buffer.from("__event_authority")]);
}
export function mintAuthorityPda(): PublicKey {
  return pumpPda([Buffer.from("mint-authority")]);
}
export function bondingCurvePda(mint: PublicKey): PublicKey {
  return pumpPda([Buffer.from("bonding-curve"), mint.toBuffer()]);
}
export function bondingCurveV2Pda(mint: PublicKey): PublicKey {
  return pumpPda([Buffer.from("bonding-curve-v2"), mint.toBuffer()]);
}
export function creatorVaultPda(creator: PublicKey): PublicKey {
  return pumpPda([Buffer.from("creator-vault"), creator.toBuffer()]);
}
export function globalVolumeAccumulatorPda(): PublicKey {
  return pumpPda([Buffer.from("global_volume_accumulator")]);
}
export function userVolumeAccumulatorPda(user: PublicKey): PublicKey {
  return pumpPda([Buffer.from("user_volume_accumulator"), user.toBuffer()]);
}
export function feeConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_config"), PUMP_PROGRAM_ID.toBuffer()],
    PUMP_FEE_PROGRAM_ID,
  )[0];
}
export function metadataPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), MPL_TOKEN_METADATA.toBuffer(), mint.toBuffer()],
    MPL_TOKEN_METADATA,
  )[0];
}

function encodeString(s: string): Buffer {
  const b = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length);
  return Buffer.concat([len, b]);
}

export function buildCreateIx(params: {
  mint: PublicKey;
  user: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}): TransactionInstruction {
  const bondingCurve = bondingCurvePda(params.mint);
  const assocBc = getAssociatedTokenAddressSync(
    params.mint,
    bondingCurve,
    true,
    TOKEN_PROGRAM_ID,
  );
  const data = Buffer.concat([
    CREATE_DISC,
    encodeString(params.name),
    encodeString(params.symbol),
    encodeString(params.uri),
    params.creator.toBuffer(),
  ]);
  return new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys: [
      { pubkey: params.mint, isSigner: true, isWritable: true },
      { pubkey: mintAuthorityPda(), isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: assocBc, isSigner: false, isWritable: true },
      { pubkey: globalPda(), isSigner: false, isWritable: false },
      { pubkey: MPL_TOKEN_METADATA, isSigner: false, isWritable: false },
      { pubkey: metadataPda(params.mint), isSigner: false, isWritable: true },
      { pubkey: params.user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: eventAuthorityPda(), isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildBuyExactSolInIx(params: {
  user: PublicKey;
  mint: PublicKey;
  creator: PublicKey;
  spendableSolIn: bigint;
  minTokensOut: bigint;
  feeRecipient: PublicKey;
  buybackFeeRecipient: PublicKey;
}): TransactionInstruction {
  const bondingCurve = bondingCurvePda(params.mint);
  const assocBc = getAssociatedTokenAddressSync(
    params.mint,
    bondingCurve,
    true,
    TOKEN_PROGRAM_ID,
  );
  const associatedUser = getAssociatedTokenAddressSync(
    params.mint,
    params.user,
    true,
    TOKEN_PROGRAM_ID,
  );
  const data = Buffer.alloc(8 + 8 + 8 + 1);
  BUY_EXACT_DISC.copy(data, 0);
  data.writeBigUInt64LE(params.spendableSolIn, 8);
  data.writeBigUInt64LE(params.minTokensOut, 16);
  data[24] = 0;

  return new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys: [
      { pubkey: globalPda(), isSigner: false, isWritable: false },
      { pubkey: params.feeRecipient, isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: assocBc, isSigner: false, isWritable: true },
      { pubkey: associatedUser, isSigner: false, isWritable: true },
      { pubkey: params.user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
        pubkey: userVolumeAccumulatorPda(params.user),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: feeConfigPda(), isSigner: false, isWritable: false },
      { pubkey: PUMP_FEE_PROGRAM_ID, isSigner: false, isWritable: false },
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
    ],
    data,
  });
}

export { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync };
