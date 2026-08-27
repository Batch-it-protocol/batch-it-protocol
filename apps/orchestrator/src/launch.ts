/**
 * Thin launch executor — crash-safe stages, Jito-only production path.
 *
 * Usage:
 *   BATCHIT_POOL=<pool pubkey> BATCHIT_MINT_KEYPAIR=... npm run launch
 *
 * Anti-snipe: create+buy only via sendJitoBundle unless BATCHIT_ALLOW_SEQUENTIAL_RPC=1
 * (debug; fails acceptance CI).
 */
import fs from "node:fs";
import path from "node:path";
import { loadOrchConfig, repoRoot, statePath } from "./config.js";
import { bundleKind, type LaunchState } from "./state-machine.js";
import { b58, sendJitoBundle, tipTx } from "./jito.js";
import { Connection, Keypair } from "@solana/web3.js";

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[]),
  );
}

function save(state: LaunchState): void {
  const p = statePath(state.pool);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

async function main(): Promise<void> {
  const cfg = loadOrchConfig();
  const pool = process.env.BATCHIT_POOL;
  if (!pool) {
    console.error("Set BATCHIT_POOL to pool address");
    process.exit(1);
  }

  const mode = cfg.allowSequentialRpc ? "sequential_debug" : "jito";
  if (mode === "sequential_debug") {
    console.warn(
      "WARNING: BATCHIT_ALLOW_SEQUENTIAL_RPC=1 — NOT production. Anti-snipe acceptance MUST fail this path.",
    );
  }

  const stateFile = statePath(pool);
  let state: LaunchState = fs.existsSync(stateFile)
    ? (JSON.parse(fs.readFileSync(stateFile, "utf8")) as LaunchState)
    : {
        pool,
        mint: process.env.BATCHIT_MINT ?? "",
        stage: "idle",
        submissionMode: mode,
        updatedAt: new Date().toISOString(),
      };

  state.submissionMode = mode;
  console.log("orchestrator resume", state);
  console.log("buy layout pin", cfg.pump.buyLayoutPin);
  console.log("rpc", cfg.rpcUrl);
  console.log("jito", cfg.jito.blockEngineUrl);

  // Chain-first resume is the contract: inspect pool status + curve before building bundle.
  // Full ix builders live in packages/adapters (next iteration); this stage wires reliability.
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const keypairPath =
    process.env.BATCHIT_KEYPAIR_PATH ??
    path.join(repoRoot(), "keys/devnet-funder.json");
  const payer = loadKeypair(keypairPath);

  // Placeholder: operator supplies pre-built signed txs as base58 JSON for now
  // while adapters package is completed.
  const bundlePath = process.env.BATCHIT_BUNDLE_TXS;
  if (!bundlePath) {
    console.log(`
Stage machine ready. To submit a bundle:
  1. Build create (+ complete_buy) VersionedTransactions
  2. Write base58 array to a file
  3. BATCHIT_BUNDLE_TXS=./bundle.json npm run launch

Partial landing recovery:
  curve missing → create_and_buy
  curve exists, not Bought → buy_only
  grace expired → do not retry buy; contributors refund

Current local stage: ${state.stage}
Bundle kind helper: use chain status with bundleKind()
`);
    const kind = bundleKind({
      poolStatus: process.env.BATCHIT_POOL_STATUS ?? "Launching",
      curveExists: process.env.BATCHIT_CURVE_EXISTS === "1",
    });
    console.log("inferred bundle kind (env override):", kind);
    state.stage = "building_bundle";
    save(state);
    return;
  }

  const txs = JSON.parse(fs.readFileSync(bundlePath, "utf8")) as string[];
  if (mode === "jito") {
    const tip = await tipTx(connection, payer, cfg);
    const all = [...txs, b58(tip)];
    state.stage = "bundle_submitted";
    save(state);
    const res = await sendJitoBundle(cfg, all);
    if (!res.ok) {
      state.stage = "failed";
      state.lastError = res.error;
      save(state);
      console.error("Jito bundle failed:", res.error);
      process.exit(1);
    }
    state.lastBundleId = res.bundleId;
    state.stage = "confirming";
    save(state);
    console.log("bundle id", res.bundleId);
  } else {
    console.error("Sequential path not implemented for signed bundle files in phase-1 stub");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
