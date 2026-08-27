import { PublicKey } from "@solana/web3.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOCALNET_ROOT = path.resolve(__dirname, "..");
export const FIXTURES = path.join(LOCALNET_ROOT, "fixtures");
export const REPO_ROOT = path.resolve(LOCALNET_ROOT, "../..");

export const RPC = process.env.BATCHIT_LOCAL_RPC ?? "http://127.0.0.1:8899";

export const BATCHIT_PROGRAM_ID = new PublicKey(
  "4wnT3AC6ZM6hCUL95WdAR6i7aTsefmRqZ3cZGbvWnrMv",
);
export const PUMP_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
);
export const PUMP_FEE_PROGRAM_ID = new PublicKey(
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ",
);
export const MPL_TOKEN_METADATA = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

/** Devnet Global fee_recipient (cloned into localnet fixture). */
export const DEVNET_FEE_RECIPIENT = new PublicKey(
  "68yFSZxzLWJXkxxRGydZ63C6mHx1NLEDWmwN9Lb5yySg",
);
export const DEVNET_BUYBACK = new PublicKey(
  "5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD",
);

export const PoolStatus = {
  Open: 0,
  Launching: 1,
  Bought: 2,
  Finalized: 3,
  Refundable: 4,
  Closed: 5,
} as const;

export type PoolStatusName = keyof typeof PoolStatus;
