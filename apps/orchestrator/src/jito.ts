import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import type { OrchConfig } from "./config.js";

export async function sendJitoBundle(
  cfg: OrchConfig,
  serializedBase58: string[],
): Promise<{ ok: true; bundleId: string } | { ok: false; error: string }> {
  const url = `${cfg.jito.blockEngineUrl.replace(/\/$/, "")}${cfg.jito.bundleApiPath}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [serializedBase58],
      }),
    });
    const json = (await res.json()) as {
      result?: string;
      error?: { message?: string };
    };
    if (json.error) return { ok: false, error: json.error.message ?? "jito error" };
    if (!json.result) return { ok: false, error: "empty jito result" };
    return { ok: true, bundleId: json.result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function tipTx(
  connection: Connection,
  payer: Keypair,
  cfg: OrchConfig,
): Promise<VersionedTransaction> {
  const tips = cfg.jito.tipAccounts;
  const to = new PublicKey(tips[Math.floor(Math.random() * tips.length)]!);
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: to,
        lamports: cfg.jito.tipLamports,
      }),
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  return tx;
}

export function b58(tx: VersionedTransaction): string {
  return bs58.encode(tx.serialize());
}
