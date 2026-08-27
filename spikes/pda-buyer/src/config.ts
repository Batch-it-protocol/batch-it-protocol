import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(REPO_ROOT, ".env") });

export type BatchitConfig = {
  cluster: string;
  rpcUrl: string;
  wsUrl: string;
  jito: {
    blockEngineUrl: string;
    bundleApiPath: string;
    tipLamports: number;
    tipAccounts: string[];
    note?: string;
  };
  pump: {
    programId: string;
    feeProgramId: string;
    mayhemProgramId: string;
    idlCommit: string;
    feeRecipient: string;
    buybackFeeRecipient: string;
  };
  spike: {
    buySolLamports: number;
    minTokensOut: number;
    tokenName: string;
    tokenSymbol: string;
    tokenUri: string;
  };
  poolDefaults: Record<string, unknown>;
};

function deepMerge<T extends Record<string, unknown>>(base: T, over: Partial<T>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof base[k as keyof T] === "object" &&
      base[k as keyof T] !== null
    ) {
      out[k] = deepMerge(
        base[k as keyof T] as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

export function loadConfig(): BatchitConfig {
  const defaultPath = path.join(REPO_ROOT, "config", "default.json");
  const localPath = path.join(REPO_ROOT, "config", "local.json");
  const base = JSON.parse(fs.readFileSync(defaultPath, "utf8")) as BatchitConfig;
  let cfg = base;
  if (fs.existsSync(localPath)) {
    cfg = deepMerge(base, JSON.parse(fs.readFileSync(localPath, "utf8")));
  }

  // Env overrides (never hard-code RPC/Jito for production paths)
  if (process.env.BATCHIT_RPC_URL) cfg.rpcUrl = process.env.BATCHIT_RPC_URL;
  if (process.env.BATCHIT_WS_URL) cfg.wsUrl = process.env.BATCHIT_WS_URL;
  if (process.env.BATCHIT_JITO_BLOCK_ENGINE_URL) {
    cfg.jito.blockEngineUrl = process.env.BATCHIT_JITO_BLOCK_ENGINE_URL;
  }
  if (process.env.BATCHIT_JITO_TIP_LAMPORTS) {
    cfg.jito.tipLamports = Number(process.env.BATCHIT_JITO_TIP_LAMPORTS);
  }

  return cfg;
}

export function repoRoot(): string {
  return REPO_ROOT;
}

export function keypairPath(): string {
  return (
    process.env.BATCHIT_KEYPAIR_PATH ??
    path.join(REPO_ROOT, "keys", "devnet-funder.json")
  );
}

export function spikeProgramIdStr(): string {
  return (
    process.env.BATCHIT_SPIKE_PROGRAM_ID ??
    "2i6MFa3CJVu3WYTZmGMuef9tSciU35A7MRagcMQdnAsE"
  );
}
