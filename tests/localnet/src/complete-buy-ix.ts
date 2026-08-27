import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { disc, poolPda, buyerPda } from "./anchor-ix.js";
import {
  bondingCurvePda,
  bondingCurveV2Pda,
  creatorVaultPda,
  eventAuthorityPda,
  feeConfigPda,
  globalPda,
  globalVolumeAccumulatorPda,
  userVolumeAccumulatorPda,
  getAssociatedTokenAddressSync,
} from "./pump.js";
import {
  BATCHIT_PROGRAM_ID,
  PUMP_FEE_PROGRAM_ID,
  PUMP_PROGRAM_ID,
} from "./constants.js";

/** Build batchit complete_buy — real pump remaining accounts. */
export function completeBuyIx(params: {
  caller: PublicKey;
  creator: PublicKey;
  seed: bigint | number;
  mint: PublicKey;
  feeRecipient: PublicKey;
  buybackFeeRecipient: PublicKey;
  minTokensOut?: bigint;
}): TransactionInstruction {
  const [pool] = poolPda(params.creator, params.seed);
  const [buyer] = buyerPda(pool);
  const bondingCurve = bondingCurvePda(params.mint);
  const assocBc = getAssociatedTokenAddressSync(
    params.mint,
    bondingCurve,
    true,
    TOKEN_PROGRAM_ID,
  );
  const associatedUser = getAssociatedTokenAddressSync(
    params.mint,
    buyer,
    true,
    TOKEN_PROGRAM_ID,
  );

  const data = Buffer.alloc(8 + 8);
  disc("complete_buy").copy(data, 0);
  data.writeBigUInt64LE(params.minTokensOut ?? 1n, 8);

  return new TransactionInstruction({
    programId: BATCHIT_PROGRAM_ID,
    keys: [
      { pubkey: params.caller, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: globalPda(), isSigner: false, isWritable: false },
      { pubkey: params.feeRecipient, isSigner: false, isWritable: true },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: assocBc, isSigner: false, isWritable: true },
      { pubkey: associatedUser, isSigner: false, isWritable: true },
      {
        pubkey: creatorVaultPda(buyer), // creator = buyer PDA (neutral)
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
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}
