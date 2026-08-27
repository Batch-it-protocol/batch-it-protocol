import fs from "node:fs";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { keypairPath, loadConfig, spikeProgramIdStr } from "./config.js";
import { buyerPda } from "./spike-program.js";
import { PUMP_PROGRAM_ID, globalPda } from "./pump.js";

function loadKeypair(p: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const funder = loadKeypair(keypairPath());
  const programId = new PublicKey(spikeProgramIdStr());
  const [buyer] = buyerPda(programId);

  const [fBal, bBal, prog, pump, global] = await Promise.all([
    connection.getBalance(funder.publicKey),
    connection.getBalance(buyer),
    connection.getAccountInfo(programId),
    connection.getAccountInfo(PUMP_PROGRAM_ID),
    connection.getAccountInfo(globalPda()),
  ]);

  console.log("RPC:", cfg.rpcUrl);
  console.log("Funder:", funder.publicKey.toBase58(), "—", fBal / LAMPORTS_PER_SOL, "SOL");
  console.log("Buyer PDA:", buyer.toBase58(), "—", bBal / LAMPORTS_PER_SOL, "SOL");
  console.log(
    "Spike program:",
    programId.toBase58(),
    prog?.executable ? "DEPLOYED" : "NOT DEPLOYED",
  );
  console.log(
    "Pump program:",
    PUMP_PROGRAM_ID.toBase58(),
    pump?.executable ? "ok" : "MISSING",
  );
  console.log("Pump global:", globalPda().toBase58(), global ? "ok" : "MISSING");
  console.log(
    "\nFund funder if needed:",
    funder.publicKey.toBase58(),
  );
}

main().catch(console.error);
