import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
dotenv.config({ path: path.join(ROOT, ".env") });

export type OrchConfig = {
  rpcUrl: string;
  jito: {
    blockEngineUrl: string;
    bundleApiPath: string;
    tipLamports: number;
    tipAccounts: string[];
  };
  pump: {
    programId: string;
    feeProgramId: string;
    buyLayoutPin: string;
  };
  /** If true, allow sequential RPC submit (DEBUG ONLY — fails anti-snipe acceptance). */
  allowSequentialRpc: boolean;
};

export function loadOrchConfig(): OrchConfig {
  const def = JSON.parse(
    fs.readFileSync(path.join(ROOT, "config/default.json"), "utf8"),
  ) as {
    rpcUrl: string;
    jito: OrchConfig["jito"];
    pump: Record<string, string>;
  };
  let rpcUrl = def.rpcUrl;
  if (process.env.BATCHIT_RPC_URL) rpcUrl = process.env.BATCHIT_RPC_URL;
  if (process.env.BATCHIT_JITO_BLOCK_ENGINE_URL) {
    def.jito.blockEngineUrl = process.env.BATCHIT_JITO_BLOCK_ENGINE_URL;
  }
  return {
    rpcUrl,
    jito: def.jito,
    pump: {
      programId: def.pump.programId,
      feeProgramId: def.pump.feeProgramId,
      buyLayoutPin: def.pump.buyLayoutPin ?? "@pump-fun/pump-sdk@1.36.0",
    },
    allowSequentialRpc: process.env.BATCHIT_ALLOW_SEQUENTIAL_RPC === "1",
  };
}

export function repoRoot(): string {
  return ROOT;
}

export function statePath(pool: string): string {
  return path.join(ROOT, "apps/orchestrator/state", `${pool}.json`);
}
