/**
 * Fee plumbing probe: create + buy with ephemeral keypair buyer.
 * remaining_accounts: [bonding_curve_v2, buyback_fee_recipient] per @pump-fun/pump-sdk
 */
import fs from "node:fs";
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { keypairPath, loadConfig } from "./config.js";
import {
  buildBuyExactSolInIx,
  buildCreateIx,
  decodeGlobalFees,
  globalPda,
  pickFeeRecipient,
} from "./pump.js";

function loadKeypair(p: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const funder = loadKeypair(keypairPath());
  const buyer = Keypair.generate();
  const mintKp = Keypair.generate();

  const globalInfo = await connection.getAccountInfo(globalPda());
  if (!globalInfo) throw new Error("no global");
  const fees = decodeGlobalFees(Buffer.from(globalInfo.data));
  const feeRecipient = pickFeeRecipient(fees);
  const buyback = fees.buybackFeeRecipients[0]!;

  console.log("funder", funder.publicKey.toBase58());
  console.log("buyer", buyer.publicKey.toBase58());
  console.log("mint", mintKp.publicKey.toBase58());
  console.log("fee_recipient", feeRecipient.toBase58());
  console.log("buyback", buyback.toBase58());

  const fundLamports = cfg.spike.buySolLamports + 10_000_000;
  const createIx = buildCreateIx({
    mint: mintKp.publicKey,
    user: funder.publicKey,
    creator: buyer.publicKey,
    name: "BatchIt FeeProbe",
    symbol: "BIFP",
    uri: cfg.spike.tokenUri,
  });

  const buyIx = buildBuyExactSolInIx({
    user: buyer.publicKey,
    mint: mintKp.publicKey,
    creator: buyer.publicKey,
    spendableSolIn: cfg.spike.buySolLamports,
    minTokensOut: cfg.spike.minTokensOut,
    feeRecipient,
    buybackFeeRecipient: buyback,
    trackVolume: false,
  });

  const ata = getAssociatedTokenAddressSync(
    mintKp.publicKey,
    buyer.publicKey,
    false,
    TOKEN_PROGRAM_ID,
  );

  // create+buy slightly exceeds 1232 with all accounts → split (Jito bundle on mainnet)
  const createTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: buyer.publicKey,
      lamports: fundLamports,
    }),
    createIx,
    createAssociatedTokenAccountIdempotentInstruction(
      funder.publicKey,
      ata,
      buyer.publicKey,
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
  console.log("create", createSig);

  const buyTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    buyIx,
  );
  buyTx.feePayer = buyer.publicKey;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  buyTx.recentBlockhash = blockhash;
  buyTx.sign(buyer);

  const sim = await connection.simulateTransaction(buyTx);
  if (sim.value.err) {
    console.error("BUY SIM FAIL", JSON.stringify(sim.value.err));
    console.error((sim.value.logs ?? []).slice(-50).join("\n"));
    process.exit(1);
  }
  console.log("buy sim OK cu", sim.value.unitsConsumed);

  const buySig = await sendAndConfirmTransaction(connection, buyTx, [buyer], {
    commitment: "confirmed",
  });
  console.log("buy", buySig);
  const acc = await getAccount(connection, ata, "confirmed");
  console.log("buyer token balance", acc.amount.toString());
  console.log("FEE PROBE SUCCESS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
