/**
 * OPTION A proof using spike_pda_buyer_lite (minimal non-Anchor program).
 * remaining: [bonding_curve_v2, buyback_fee_recipient]
 */
import fs from "node:fs";
import path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { keypairPath, loadConfig, repoRoot } from "./config.js";
import {
  buildCreateIx,
  bondingCurvePda,
  bondingCurveV2Pda,
  associatedBondingCurve,
  creatorVaultPda,
  decodeGlobalFees,
  eventAuthorityPda,
  feeConfigPda,
  globalPda,
  globalVolumeAccumulatorPda,
  pickFeeRecipient,
  userVolumeAccumulatorPda,
  PUMP_PROGRAM_ID,
  PUMP_FEE_PROGRAM_ID,
} from "./pump.js";

const LITE_PROGRAM_ID = new PublicKey(
  process.env.BATCHIT_SPIKE_LITE_PROGRAM_ID ??
    "HkwzdYe7nK4bvENKw2oZ1CgaFZTSqynowahT9vwLtNGb",
);

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[]),
  );
}

function buyerPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("buyer")], programId);
}

function fundIx(
  programId: PublicKey,
  payer: PublicKey,
  lamports: bigint,
): TransactionInstruction {
  const [buyer] = buyerPda(programId);
  const data = Buffer.alloc(1 + 8);
  data[0] = 0; // fund
  data.writeBigUInt64LE(lamports, 1);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: buyer, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function buyIx(params: {
  programId: PublicKey;
  mint: PublicKey;
  creator: PublicKey;
  feeRecipient: PublicKey;
  buybackFeeRecipient: PublicKey;
  spendableSolIn: bigint;
  minTokensOut: bigint;
}): TransactionInstruction {
  const [buyer] = buyerPda(params.programId);
  const bondingCurve = bondingCurvePda(params.mint);
  const assocBc = associatedBondingCurve(bondingCurve, params.mint);
  const associatedUser = getAssociatedTokenAddressSync(
    params.mint,
    buyer,
    true,
    TOKEN_PROGRAM_ID,
  );

  const data = Buffer.alloc(1 + 8 + 8 + 1);
  data[0] = 1; // buy
  data.writeBigUInt64LE(params.spendableSolIn, 1);
  data.writeBigUInt64LE(params.minTokensOut, 9);
  data[17] = 0; // track_volume false

  return new TransactionInstruction({
    programId: params.programId,
    keys: [
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
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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

async function main(): Promise<void> {
  const cfg = loadConfig();
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const funder = loadKeypair(keypairPath());
  const [buyer, bump] = buyerPda(LITE_PROGRAM_ID);

  console.log("=== OPTION A (lite program) ===");
  console.log("program", LITE_PROGRAM_ID.toBase58());
  console.log("buyer PDA", buyer.toBase58(), "bump", bump);
  console.log("funder", funder.publicKey.toBase58());

  const bal = await connection.getBalance(funder.publicKey);
  console.log("funder bal", bal / 1e9, "SOL");
  if (bal < 0.15e9) throw new Error("need ~0.15+ SOL for create+buy");

  const globalInfo = await connection.getAccountInfo(globalPda());
  if (!globalInfo) throw new Error("no global");
  const fees = decodeGlobalFees(Buffer.from(globalInfo.data));
  const feeRecipient = pickFeeRecipient(fees);
  const buyback = fees.buybackFeeRecipients[0]!;

  const mintKp = Keypair.generate();
  const creator = buyer; // neutral PDA creator
  const spendable = BigInt(cfg.spike.buySolLamports);

  console.log("mint", mintKp.publicKey.toBase58());
  console.log("fee_recipient", feeRecipient.toBase58());
  console.log("buyback", buyback.toBase58());

  // 1) create token + fund PDA + ATA
  const createTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    buildCreateIx({
      mint: mintKp.publicKey,
      user: funder.publicKey,
      creator,
      name: cfg.spike.tokenName,
      symbol: cfg.spike.tokenSymbol,
      uri: cfg.spike.tokenUri,
    }),
    fundIx(LITE_PROGRAM_ID, funder.publicKey, spendable + 5_000_000n),
    createAssociatedTokenAccountIdempotentInstruction(
      funder.publicKey,
      getAssociatedTokenAddressSync(
        mintKp.publicKey,
        buyer,
        true,
        TOKEN_PROGRAM_ID,
      ),
      buyer,
      mintKp.publicKey,
      TOKEN_PROGRAM_ID,
    ),
  );
  const createSig = await sendAndConfirmTransaction(
    connection,
    createTx,
    [funder, mintKp],
    { commitment: "confirmed" },
  );
  console.log("create+fund+ata", createSig);

  // 2) PDA buy via lite program
  const buyInstruction = buyIx({
    programId: LITE_PROGRAM_ID,
    mint: mintKp.publicKey,
    creator,
    feeRecipient,
    buybackFeeRecipient: buyback,
    spendableSolIn: spendable,
    minTokensOut: BigInt(cfg.spike.minTokensOut),
  });

  const buyTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    buyInstruction,
  );
  buyTx.feePayer = funder.publicKey;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  buyTx.recentBlockhash = blockhash;
  buyTx.sign(funder);

  const sim = await connection.simulateTransaction(buyTx);
  if (sim.value.err) {
    console.error("PDA BUY SIM FAIL", JSON.stringify(sim.value.err));
    console.error((sim.value.logs ?? []).join("\n"));
    writeResult({
      option: "A",
      success: false,
      error: JSON.stringify(sim.value.err),
      logs: sim.value.logs ?? [],
      mint: mintKp.publicKey.toBase58(),
      buyer: buyer.toBase58(),
      program: LITE_PROGRAM_ID.toBase58(),
      signatures: [createSig],
    });
    process.exit(1);
  }
  console.log("buy sim OK cu", sim.value.unitsConsumed);

  const buySig = await sendAndConfirmTransaction(connection, buyTx, [funder], {
    commitment: "confirmed",
  });
  console.log("pda buy", buySig);

  const ata = getAssociatedTokenAddressSync(
    mintKp.publicKey,
    buyer,
    true,
    TOKEN_PROGRAM_ID,
  );
  const acc = await getAccount(connection, ata, "confirmed");
  console.log("buyer ATA amount", acc.amount.toString());

  if (acc.amount === 0n) {
    writeResult({
      option: "A",
      success: false,
      error: "zero balance after buy",
      mint: mintKp.publicKey.toBase58(),
      buyer: buyer.toBase58(),
      program: LITE_PROGRAM_ID.toBase58(),
      signatures: [createSig, buySig],
    });
    process.exit(1);
  }

  writeResult({
    option: "A",
    success: true,
    mint: mintKp.publicKey.toBase58(),
    buyer: buyer.toBase58(),
    program: LITE_PROGRAM_ID.toBase58(),
    tokenAmount: acc.amount.toString(),
    signatures: [createSig, buySig],
    notes: [
      "OPTION A PROVEN: pump.fun accepted PDA as buy user via invoke_signed",
      "creator was PDA (neutral)",
      "fee_recipient + bonding_curve_v2 + buyback remaining accounts required",
      "create+buy must be split (tx size); use Jito bundle on mainnet for atomicity",
    ],
  });

  console.log("\n========== SPIKE VERDICT ==========");
  console.log("✓ OPTION A PROVEN — PDA buyer via invoke_signed");
  console.log("===================================\n");
}

function writeResult(result: Record<string, unknown>): void {
  const outDir = path.join(repoRoot(), "spikes", "pda-buyer", "results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "spike-result.json"),
    JSON.stringify({ ...result, timestamp: new Date().toISOString() }, null, 2),
  );
  const md = [
    "# SPIKE RESULT — PDA buyer (option A)",
    "",
    `**Timestamp:** ${new Date().toISOString()}`,
    `**Option:** ${result.option}`,
    `**Success:** ${result.success}`,
    `**Program:** \`${result.program}\``,
    `**Buyer PDA:** \`${result.buyer}\``,
    result.mint ? `**Mint:** \`${result.mint}\`` : "",
    result.tokenAmount ? `**Token amount:** ${result.tokenAmount}` : "",
    result.error ? `**Error:** ${result.error}` : "",
    "",
    "## Signatures",
    ...((result.signatures as string[]) || []).map((s) => `- \`${s}\``),
    "",
    "## Notes",
    ...((result.notes as string[]) || []).map((n) => `- ${n}`),
    "",
    "## Threat-model implication",
    result.success
      ? "Threat model MAY claim: pooled buy is signed by a program PDA via invoke_signed; orchestrator cannot redirect the buy signer. Creator can be a program-controlled PDA."
      : "Threat model MUST NOT claim PDA-signed buys until proven.",
    "",
  ]
    .filter(Boolean)
    .join("\n");
  fs.writeFileSync(path.join(outDir, "SPIKE_RESULT.md"), md);
  console.log("wrote results/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
