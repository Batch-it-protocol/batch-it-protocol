/**
 * Jito bundle submission behind config (no hard-coded production endpoints).
 *
 * Note: public Jito block engines are mainnet-oriented. On devnet this module
 * still builds the bundle payload for path validation; landing may fail and the
 * spike falls back to same-tx / sequential RPC submission.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import type { BatchitConfig } from "./config.js";

export type BundleResult =
  | { ok: true; bundleId: string; method: "jito" }
  | { ok: false; error: string; method: "jito" };

export async function sendBundle(
  cfg: BatchitConfig,
  serializedTxsBase58: string[],
): Promise<BundleResult> {
  const url = `${cfg.jito.blockEngineUrl.replace(/\/$/, "")}${cfg.jito.bundleApiPath}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [serializedTxsBase58],
      }),
    });
    const json = (await res.json()) as {
      result?: string;
      error?: { message?: string; code?: number };
    };
    if (json.error) {
      return {
        ok: false,
        error: json.error.message ?? JSON.stringify(json.error),
        method: "jito",
      };
    }
    if (!json.result) {
      return { ok: false, error: "empty result", method: "jito" };
    }
    return { ok: true, bundleId: json.result, method: "jito" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      method: "jito",
    };
  }
}

export function pickTipAccount(cfg: BatchitConfig): PublicKey {
  const list = cfg.jito.tipAccounts;
  const idx = Math.floor(Math.random() * list.length);
  return new PublicKey(list[idx]!);
}

export async function buildTipTx(
  connection: Connection,
  payer: Keypair,
  cfg: BatchitConfig,
): Promise<VersionedTransaction> {
  const tipTo = pickTipAccount(cfg);
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: tipTo,
        lamports: cfg.jito.tipLamports,
      }),
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  return tx;
}

export function serializeTxBase58(tx: VersionedTransaction): string {
  return bs58.encode(tx.serialize());
}
