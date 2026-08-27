/**
 * Pump.fun instruction builders from pinned IDL
 * (third_party/pump-public-docs @ 9c82f61).
 * Do not invent account order — match the IDL exactly.
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
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";

export const PUMP_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
);
export const PUMP_FEE_PROGRAM_ID = new PublicKey(
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ",
);
export const MAYHEM_PROGRAM_ID = new PublicKey(
  "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e",
);
export const MPL_TOKEN_METADATA = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
export const NATIVE_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112",
);

// Discriminators from pinned IDL
export const DISCRIMINATOR = {
  create: Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]),
  create_v2: Buffer.from([214, 144, 76, 236, 95, 139, 49, 180]),
  buy: Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]),
  buy_exact_sol_in: Buffer.from([56, 252, 116, 8, 158, 223, 205, 95]),
} as const;

export function pumpPda(seeds: (Buffer | Uint8Array)[]): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, PUMP_PROGRAM_ID);
}

export function globalPda(): PublicKey {
  return pumpPda([Buffer.from("global")])[0];
}

/**
 * Authorized fee recipients for the cluster, read from on-chain Global.
 * Mainnet docs ≠ devnet values — never hard-code mainnet recipients for devnet.
 * Valid set: Global.fee_recipient + Global.fee_recipients[0..7].
 */
export type PumpGlobalFees = {
  feeRecipient: PublicKey;
  feeRecipients: PublicKey[];
  reservedFeeRecipient: PublicKey;
  reservedFeeRecipients: PublicKey[];
  buybackFeeRecipients: PublicKey[];
  feeBasisPoints: bigint;
  creatorFeeBasisPoints: bigint;
};

export function decodeGlobalFees(data: Buffer): PumpGlobalFees {
  // Anchor account: 8-byte discriminator + Global fields (pinned IDL layout)
  let o = 8;
  const readBool = (): boolean => {
    const v = data[o]! !== 0;
    o += 1;
    return v;
  };
  const readPubkey = (): PublicKey => {
    const p = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return p;
  };
  const readU64 = (): bigint => {
    const v = data.readBigUInt64LE(o);
    o += 8;
    return v;
  };

  readBool(); // initialized
  readPubkey(); // authority
  const feeRecipient = readPubkey();
  readU64(); // initial_virtual_token_reserves
  readU64(); // initial_virtual_sol_reserves
  readU64(); // initial_real_token_reserves
  readU64(); // token_total_supply
  const feeBasisPoints = readU64();
  readPubkey(); // withdraw_authority
  readBool(); // enable_migrate
  readU64(); // pool_migration_fee
  const creatorFeeBasisPoints = readU64();
  const feeRecipients: PublicKey[] = [];
  for (let i = 0; i < 7; i++) feeRecipients.push(readPubkey());
  readPubkey(); // set_creator_authority
  readPubkey(); // admin_set_creator_authority
  readBool(); // create_v2_enabled
  readPubkey(); // whitelist_pda
  const reservedFeeRecipient = readPubkey();
  readBool(); // mayhem_mode_enabled
  const reservedFeeRecipients: PublicKey[] = [];
  for (let i = 0; i < 7; i++) reservedFeeRecipients.push(readPubkey());
  readBool(); // is_cashback_enabled
  const buybackFeeRecipients: PublicKey[] = [];
  for (let i = 0; i < 8; i++) buybackFeeRecipients.push(readPubkey());

  return {
    feeRecipient,
    feeRecipients,
    reservedFeeRecipient,
    reservedFeeRecipients,
    buybackFeeRecipients,
    feeBasisPoints,
    creatorFeeBasisPoints,
  };
}

/** Pick any authorized normal (non-mayhem) fee recipient for buys. */
export function pickFeeRecipient(fees: PumpGlobalFees): PublicKey {
  return fees.feeRecipient;
}

export function eventAuthorityPda(): PublicKey {
  return pumpPda([Buffer.from("__event_authority")])[0];
}

export function mintAuthorityPda(): PublicKey {
  return pumpPda([Buffer.from("mint-authority")])[0];
}

export function bondingCurvePda(mint: PublicKey): PublicKey {
  return pumpPda([Buffer.from("bonding-curve"), mint.toBuffer()])[0];
}

/** Official @pump-fun/pump-sdk: seeds ["bonding-curve-v2", mint] */
export function bondingCurveV2Pda(mint: PublicKey): PublicKey {
  return pumpPda([Buffer.from("bonding-curve-v2"), mint.toBuffer()])[0];
}

export function creatorVaultPda(creator: PublicKey): PublicKey {
  return pumpPda([Buffer.from("creator-vault"), creator.toBuffer()])[0];
}

export function globalVolumeAccumulatorPda(): PublicKey {
  return pumpPda([Buffer.from("global_volume_accumulator")])[0];
}

export function userVolumeAccumulatorPda(user: PublicKey): PublicKey {
  return pumpPda([Buffer.from("user_volume_accumulator"), user.toBuffer()])[0];
}

/** fee_config PDA on the fee program: seeds ["fee_config", pump_program_id] */
export function feeConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_config"), PUMP_PROGRAM_ID.toBuffer()],
    PUMP_FEE_PROGRAM_ID,
  )[0];
}

export function associatedBondingCurve(
  bondingCurve: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    bondingCurve,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}

export function metadataPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      MPL_TOKEN_METADATA.toBuffer(),
      mint.toBuffer(),
    ],
    MPL_TOKEN_METADATA,
  )[0];
}

function encodeString(s: string): Buffer {
  const b = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length, 0);
  return Buffer.concat([len, b]);
}

/**
 * Legacy `create` (SPL Token + Metaplex metadata).
 * `creator` is a pubkey arg only — may be a PDA.
 * `user` must sign and pay.
 */
export function buildCreateIx(params: {
  mint: PublicKey;
  user: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}): TransactionInstruction {
  const { mint, user, creator, name, symbol, uri } = params;
  const bondingCurve = bondingCurvePda(mint);
  const assocBc = associatedBondingCurve(bondingCurve, mint, TOKEN_PROGRAM_ID);

  const data = Buffer.concat([
    DISCRIMINATOR.create,
    encodeString(name),
    encodeString(symbol),
    encodeString(uri),
    creator.toBuffer(),
  ]);

  const keys = [
    { pubkey: mint, isSigner: true, isWritable: true },
    { pubkey: mintAuthorityPda(), isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: assocBc, isSigner: false, isWritable: true },
    { pubkey: globalPda(), isSigner: false, isWritable: false },
    { pubkey: MPL_TOKEN_METADATA, isSigner: false, isWritable: false },
    { pubkey: metadataPda(mint), isSigner: false, isWritable: true },
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: eventAuthorityPda(), isSigner: false, isWritable: false },
    { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Direct (non-CPI) buy_exact_sol_in — used for fallback B (ephemeral keypair).
 */
export function buildBuyExactSolInIx(params: {
  user: PublicKey;
  mint: PublicKey;
  creator: PublicKey;
  spendableSolIn: BN | number | bigint;
  minTokensOut: BN | number | bigint;
  feeRecipient: PublicKey;
  buybackFeeRecipient?: PublicKey;
  tokenProgram?: PublicKey;
  trackVolume?: boolean;
}): TransactionInstruction {
  const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;
  const bondingCurve = bondingCurvePda(params.mint);
  const assocBc = associatedBondingCurve(bondingCurve, params.mint, tokenProgram);
  const associatedUser = getAssociatedTokenAddressSync(
    params.mint,
    params.user,
    true,
    tokenProgram,
  );
  const spendable = Buffer.alloc(8);
  spendable.writeBigUInt64LE(BigInt(params.spendableSolIn.toString()), 0);
  const minOut = Buffer.alloc(8);
  minOut.writeBigUInt64LE(BigInt(params.minTokensOut.toString()), 0);

  const data = Buffer.concat([
    DISCRIMINATOR.buy_exact_sol_in,
    spendable,
    minOut,
    Buffer.from([params.trackVolume ? 1 : 0]),
  ]);

  // remaining_accounts per @pump-fun/pump-sdk getBuyInstructionRaw:
  // [0] bonding_curve_v2 (readonly), [1] buyback_fee_recipient (writable)
  const buyback =
    params.buybackFeeRecipient ??
    new PublicKey("5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD");

  const keys = [
    { pubkey: globalPda(), isSigner: false, isWritable: false },
    { pubkey: params.feeRecipient, isSigner: false, isWritable: true },
    { pubkey: params.mint, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: assocBc, isSigner: false, isWritable: true },
    { pubkey: associatedUser, isSigner: false, isWritable: true },
    { pubkey: params.user, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: creatorVaultPda(params.creator), isSigner: false, isWritable: true },
    { pubkey: eventAuthorityPda(), isSigner: false, isWritable: false },
    { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: globalVolumeAccumulatorPda(), isSigner: false, isWritable: false },
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
    { pubkey: buyback, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys,
    data,
  });
}

export { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID };
