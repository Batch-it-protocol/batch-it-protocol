/**
 * SPIKE: Prove pump.fun accepts a PDA buyer via invoke_signed (option A).
 *
 * Flow:
 *  1. Check funder balance (user funds the printed address)
 *  2. Deploy/upgrade spike_pda_buyer if needed
 *  3. Create pump token with creator = buyer PDA
 *  4. Fund buyer PDA, create ATA, CPI buy_exact_sol_in with PDA signer
 *  5. Attempt Jito bundle path; fall back to same-tx / sequential RPC on devnet
 *
 * Success criterion: on-chain PDA buy lands → option A proven.
 * If PDA buy is rejected: STOP, write redesign notes, do not build escrow.
 */
import fs from "node:fs";
import path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
} from "@solana/spl-token";
import {
  keypairPath,
  loadConfig,
  repoRoot,
  spikeProgramIdStr,
} from "./config.js";
import {
  buildCreateIx,
  bondingCurvePda,
  creatorVaultPda,
  decodeGlobalFees,
  globalPda,
  pickFeeRecipient,
  PUMP_PROGRAM_ID,
} from "./pump.js";
import {
  associatedUserAta,
  buildFundBuyerIx,
  buildPdaBuyIx,
  buyerPda,
} from "./spike-program.js";
import { buildTipTx, sendBundle, serializeTxBase58 } from "./jito.js";

type SpikeResult = {
  option: "A" | "B" | "UNPROVEN";
  success: boolean;
  buyer: string;
  mint?: string;
  signatures: string[];
  notes: string[];
  error?: string;
  jito?: unknown;
};

function loadKeypair(p: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureProgramDeployed(
  connection: Connection,
  payer: Keypair,
  programId: PublicKey,
): Promise<string[]> {
  const notes: string[] = [];
  const info = await connection.getAccountInfo(programId);
  const soPath = path.join(
    repoRoot(),
    "target",
    "deploy",
    "spike_pda_buyer.so",
  );
  const keypairPathProg = path.join(
    repoRoot(),
    "target",
    "deploy",
    "spike_pda_buyer-keypair.json",
  );

  if (!fs.existsSync(soPath)) {
    throw new Error(
      `Missing ${soPath}. Run: cargo build-sbf --manifest-path programs/spike_pda_buyer/Cargo.toml`,
    );
  }

  // Prefer solana CLI deploy for reliability
  const { execFileSync } = await import("node:child_process");
  const solanaBin =
    process.env.SOLANA_BIN ??
    path.join(
      process.env.USERPROFILE ?? "",
      ".local",
      "share",
      "solana",
      "install",
      "active_release",
      "bin",
      "solana.exe",
    );

  if (info?.executable) {
    notes.push(`program already deployed at ${programId.toBase58()}`);
    // Upgrade only when FORCE_SPIKE_UPGRADE=1 (saves SOL on repeated runs)
    if (process.env.FORCE_SPIKE_UPGRADE === "1") {
      const out = execFileSync(
        solanaBin,
        [
          "program",
          "deploy",
          soPath,
          "--program-id",
          keypairPathProg,
          "--url",
          connection.rpcEndpoint,
          "--keypair",
          keypairPath(),
          "--max-len",
          "300000",
        ],
        { encoding: "utf8" },
      );
      notes.push(`program upgrade:\n${out}`);
    } else {
      notes.push(
        "skipping upgrade (set FORCE_SPIKE_UPGRADE=1 to redeploy after code changes)",
      );
    }
    return notes;
  }

  const out = execFileSync(
    solanaBin,
    [
      "program",
      "deploy",
      soPath,
      "--program-id",
      keypairPathProg,
      "--url",
      connection.rpcEndpoint,
      "--keypair",
      keypairPath(),
      "--max-len",
      "300000",
    ],
    { encoding: "utf8" },
  );
  notes.push(`program deploy:\n${out}`);
  return notes;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const result: SpikeResult = {
    option: "UNPROVEN",
    success: false,
    buyer: "",
    signatures: [],
    notes: [],
  };

  console.log("=== Batch It! PDA buyer spike (option A) ===");
  console.log(`cluster/rpc: ${cfg.cluster} / ${cfg.rpcUrl}`);
  console.log(`pump IDL commit: ${cfg.pump.idlCommit}`);
  console.log(`jito block engine: ${cfg.jito.blockEngineUrl}`);

  const funder = loadKeypair(keypairPath());
  const programId = new PublicKey(spikeProgramIdStr());
  const [buyer, buyerBump] = buyerPda(programId);
  result.buyer = buyer.toBase58();

  console.log(`\nFunder:  ${funder.publicKey.toBase58()}`);
  console.log(`Program: ${programId.toBase58()}`);
  console.log(`Buyer PDA (seeds=["buyer"], bump=${buyerBump}): ${buyer.toBase58()}`);
  console.log(
    "\n>>> FUND THIS ADDRESS ON DEVNET, then re-run if balance is low:",
  );
  console.log(`>>> ${funder.publicKey.toBase58()}`);

  const connection = new Connection(cfg.rpcUrl, {
    commitment: "confirmed",
    wsEndpoint: cfg.wsUrl,
  });

  const bal = await connection.getBalance(funder.publicKey);
  console.log(`\nFunder balance: ${bal / 1e9} SOL`);
  if (bal < 0.5 * 1e9) {
    result.notes.push(
      `Insufficient funder balance (${bal} lamports). Need ~0.5+ SOL for deploy+create+buy.`,
    );
    result.error = "UNFUNDED";
    writeResult(result);
    console.error(
      "\n[WAIT] Fund the address above with devnet SOL, then re-run:",
    );
    console.error("  cd spikes/pda-buyer && npm run spike");
    process.exit(2);
  }

  // 1) Deploy program
  console.log("\n--- Deploy spike_pda_buyer ---");
  try {
    const deployNotes = await ensureProgramDeployed(
      connection,
      funder,
      programId,
    );
    result.notes.push(...deployNotes);
    console.log(deployNotes.join("\n"));
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    result.notes.push(`deploy failed: ${result.error}`);
    writeResult(result);
    throw e;
  }

  // Resolve fee recipient from on-chain Global (devnet ≠ mainnet docs)
  const globalInfo = await connection.getAccountInfo(globalPda());
  if (!globalInfo) throw new Error("pump Global account missing on this cluster");
  const globalFees = decodeGlobalFees(Buffer.from(globalInfo.data));
  const feeRecipient = pickFeeRecipient(globalFees);
  result.notes.push(
    `on-chain fee_recipient=${feeRecipient.toBase58()} (not config mainnet default)`,
  );
  console.log(`\nOn-chain fee_recipient: ${feeRecipient.toBase58()}`);
  console.log(
    `fee_bps=${globalFees.feeBasisPoints} creator_fee_bps=${globalFees.creatorFeeBasisPoints}`,
  );

  // 2) Create mint + token on pump with creator = buyer PDA
  const mintKp = Keypair.generate();
  result.mint = mintKp.publicKey.toBase58();
  console.log(`\n--- Create pump token ---`);
  console.log(`mint: ${mintKp.publicKey.toBase58()}`);
  console.log(`creator (PDA): ${buyer.toBase58()}`);

  const createIx = buildCreateIx({
    mint: mintKp.publicKey,
    user: funder.publicKey,
    creator: buyer,
    name: cfg.spike.tokenName,
    symbol: cfg.spike.tokenSymbol,
    uri: cfg.spike.tokenUri,
  });

  // Fund PDA enough for buy + volume accumulator rent + buffer
  // Buyer already holds residual from prior run — top up if needed.
  const buyerBal = await connection.getBalance(buyer);
  const needBuy = BigInt(cfg.spike.buySolLamports) + 5_000_000n;
  const topUp =
    buyerBal >= Number(needBuy) ? 0n : needBuy - BigInt(buyerBal);
  result.notes.push(`buyer_balance=${buyerBal} top_up_lamports=${topUp}`);

  const fundIx =
    topUp > 0n
      ? buildFundBuyerIx({
          programId,
          payer: funder.publicKey,
          lamports: topUp,
        })
      : null;

  // Create ATA for buyer PDA
  const buyerAta = associatedUserAta(mintKp.publicKey, buyer, TOKEN_PROGRAM_ID);
  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    funder.publicKey,
    buyerAta,
    buyer,
    mintKp.publicKey,
    TOKEN_PROGRAM_ID,
  );

  const buybackFeeRecipient = globalFees.buybackFeeRecipients[0]!;
  result.notes.push(`buyback_fee_recipient=${buybackFeeRecipient.toBase58()}`);

  const buyIx = buildPdaBuyIx({
    programId,
    mint: mintKp.publicKey,
    creator: buyer,
    feeRecipient,
    buybackFeeRecipient,
    spendableSolIn: cfg.spike.buySolLamports,
    minTokensOut: cfg.spike.minTokensOut,
    trackVolume: false,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
  const cuPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 50_000,
  });

  // Preferred atomic path: create + fund + ata + pda-buy in ONE transaction.
  // Same-tx atomicity already prevents create→buy sniping; Jito is for multi-tx.
  console.log("\n--- Attempt same-tx create+fund+ata+pda_buy (atomic) ---");
  try {
    const tx = new Transaction().add(cuIx, cuPriceIx, createIx);
    if (fundIx) tx.add(fundIx);
    tx.add(createAtaIx, buyIx);
    tx.feePayer = funder.publicKey;
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.sign(funder, mintKp);

    // Simulate first for clear diagnostics
    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) {
      console.error("Simulation failed:", JSON.stringify(sim.value.err));
      console.error((sim.value.logs ?? []).join("\n"));
      result.notes.push(
        `same-tx sim failed: ${JSON.stringify(sim.value.err)}`,
      );
      result.notes.push(...(sim.value.logs ?? []).slice(-40));
      throw new Error(`same-tx simulation failed: ${JSON.stringify(sim.value.err)}`);
    }
    console.log("Simulation OK, CU:", sim.value.unitsConsumed);

    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    result.signatures.push(sig);
    console.log("same-tx landed:", sig);

    // Verify ATA balance
    const ata = await getAccount(connection, buyerAta, "confirmed");
    console.log(`Buyer ATA amount: ${ata.amount.toString()}`);
    if (ata.amount === 0n) {
      throw new Error("Buy appeared to land but ATA balance is 0");
    }

    result.option = "A";
    result.success = true;
    result.notes.push(
      "OPTION A PROVEN: pump.fun accepted PDA buyer via invoke_signed CPI.",
    );
    result.notes.push(
      `bonding_curve=${bondingCurvePda(mintKp.publicKey).toBase58()}`,
    );
    result.notes.push(
      `creator_vault=${creatorVaultPda(buyer).toBase58()}`,
    );

    // Also try Jito bundle path (create tip + noop style validation) for wiring
    try {
      const tipTx = await buildTipTx(connection, funder, cfg);
      const jitoRes = await sendBundle(cfg, [serializeTxBase58(tipTx)]);
      result.jito = jitoRes;
      result.notes.push(`jito tip-only probe: ${JSON.stringify(jitoRes)}`);
      console.log("Jito probe:", jitoRes);
    } catch (je) {
      result.notes.push(
        `jito probe error (non-fatal on devnet): ${
          je instanceof Error ? je.message : String(je)
        }`,
      );
    }

    writeResult(result);
    printVerdict(result);
    return;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("same-tx path failed:", msg);
    result.notes.push(`same-tx path failed: ${msg}`);
  }

  // Fallback path: split create then buy (still PDA), for diagnostics
  console.log("\n--- Split path: create, then PDA buy ---");
  try {
    const createTx = new Transaction().add(cuIx, cuPriceIx, createIx);
    const createSig = await sendAndConfirmTransaction(
      connection,
      createTx,
      [funder, mintKp],
      { commitment: "confirmed" },
    );
    result.signatures.push(createSig);
    console.log("create sig:", createSig);

    const prepTx = new Transaction();
    if (fundIx) prepTx.add(fundIx);
    prepTx.add(createAtaIx);
    const prepSig = await sendAndConfirmTransaction(
      connection,
      prepTx,
      [funder],
      { commitment: "confirmed" },
    );
    result.signatures.push(prepSig);
    console.log("fund+ata sig:", prepSig);

    const buyTx = new Transaction().add(cuIx, buyIx);
    // Simulate
    buyTx.feePayer = funder.publicKey;
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    buyTx.recentBlockhash = blockhash;
    buyTx.sign(funder);
    const sim = await connection.simulateTransaction(buyTx);
    if (sim.value.err) {
      console.error("PDA buy simulation failed:", JSON.stringify(sim.value.err));
      console.error((sim.value.logs ?? []).join("\n"));
      result.notes.push(
        `PDA buy sim failed: ${JSON.stringify(sim.value.err)}`,
      );
      result.notes.push(...(sim.value.logs ?? []).slice(-50));
      result.option = "UNPROVEN";
      result.success = false;
      result.error = "PDA_BUY_REJECTED";
      result.notes.push(
        "OPTION A FAILED on simulation. Do NOT build escrow on A. See SPIKE_RESULT.md.",
      );
      writeResult(result);
      printVerdict(result);
      process.exit(1);
    }

    const buySig = await sendAndConfirmTransaction(
      connection,
      buyTx,
      [funder],
      { commitment: "confirmed" },
    );
    result.signatures.push(buySig);
    console.log("pda buy sig:", buySig);

    const ata = await getAccount(connection, buyerAta, "confirmed");
    console.log(`Buyer ATA amount: ${ata.amount.toString()}`);

    result.option = "A";
    result.success = true;
    result.notes.push(
      "OPTION A PROVEN (split txs): pump.fun accepted PDA buyer via invoke_signed.",
    );
    writeResult(result);
    printVerdict(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.error = msg;
    result.success = false;
    result.option = "UNPROVEN";
    result.notes.push(`split path failed: ${msg}`);
    result.notes.push(
      "If logs show PDA-related rejection from pump, option A is disproven → redesign (B).",
    );
    writeResult(result);
    printVerdict(result);
    process.exit(1);
  }
}

function writeResult(result: SpikeResult): void {
  const outDir = path.join(repoRoot(), "spikes", "pda-buyer", "results");
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "spike-result.json");
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  const md = [
    "# SPIKE RESULT — PDA buyer (option A)",
    "",
    `**Timestamp:** ${new Date().toISOString()}`,
    `**Option proven:** ${result.option}`,
    `**Success:** ${result.success}`,
    `**Buyer PDA:** \`${result.buyer}\``,
    result.mint ? `**Mint:** \`${result.mint}\`` : "",
    result.error ? `**Error:** ${result.error}` : "",
    "",
    "## Signatures",
    ...result.signatures.map((s) => `- \`${s}\``),
    "",
    "## Notes",
    ...result.notes.map((n) => `- ${n}`),
    "",
    "## Threat-model implication",
    result.success && result.option === "A"
      ? "Threat model MAY claim: pooled buy is signed by a program PDA; orchestrator cannot redirect the buy signer. Creator is a program-controlled pubkey (PDA)."
      : "Threat model MUST NOT claim PDA-signed buys until option A is proven or option B is formally adopted with its weaker custody story.",
    "",
    result.success
      ? "Next: escrow program + tests (do not start mainnet work)."
      : "STOP: write redesign notes for option B before touching escrow.",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  fs.writeFileSync(path.join(outDir, "SPIKE_RESULT.md"), md);
  console.log(`\nWrote ${jsonPath}`);
}

function printVerdict(result: SpikeResult): void {
  console.log("\n========== SPIKE VERDICT ==========");
  if (result.success && result.option === "A") {
    console.log("✓ OPTION A PROVEN — PDA buyer via invoke_signed accepted by pump.fun");
    console.log("  Threat model may claim program-signed pooled buy.");
  } else if (result.error === "UNFUNDED") {
    console.log("○ WAITING FOR DEVNET FUNDS");
    console.log(`  Fund: ${result.buyer ? "(see funder above)" : ""}`);
  } else {
    console.log("✗ OPTION A NOT PROVEN");
    console.log("  Do not build escrow on A. See results/SPIKE_RESULT.md");
  }
  console.log("===================================\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
