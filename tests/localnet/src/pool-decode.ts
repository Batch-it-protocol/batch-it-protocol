import { PublicKey } from "@solana/web3.js";
import { PoolStatus } from "./constants.js";

export type DecodedPool = {
  status: number;
  statusName: string;
  creator: PublicKey;
  seed: bigint;
  mint: PublicKey;
  launchAt: bigint;
  graceEndsAt: bigint;
  minRaise: bigint;
  maxPool: bigint;
  minContribution: bigint;
  totalContributed: bigint;
  contributorCount: number;
  tokensBought: bigint;
  distributable: bigint;
  burned: bigint;
};

const STATUS_NAMES = [
  "Open",
  "Launching",
  "Bought",
  "Finalized",
  "Refundable",
  "Closed",
];

export function decodePool(data: Buffer): DecodedPool {
  // Anchor disc 8 + fields per state.rs
  let o = 8;
  const u8 = () => data[o++]!;
  const pubkey = () => {
    const p = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return p;
  };
  const u64 = () => {
    const v = data.readBigUInt64LE(o);
    o += 8;
    return v;
  };
  const i64 = () => {
    const v = data.readBigInt64LE(o);
    o += 8;
    return v;
  };
  const u32 = () => {
    const v = data.readUInt32LE(o);
    o += 4;
    return v;
  };

  u8(); // bump
  u8(); // buyer_bump
  const status = u8();
  const creator = pubkey();
  const seed = u64();
  const mint = pubkey();
  const launchAt = i64();
  const graceEndsAt = i64();
  const minRaise = u64();
  const maxPool = u64();
  const minContribution = u64();
  const totalContributed = u64();
  const contributorCount = u32();
  const tokensBought = u64();
  const distributable = u64();
  const burned = u64();

  return {
    status,
    statusName: STATUS_NAMES[status] ?? `unknown(${status})`,
    creator,
    seed,
    mint,
    launchAt,
    graceEndsAt,
    minRaise,
    maxPool,
    minContribution,
    totalContributed,
    contributorCount,
    tokensBought,
    distributable,
    burned,
  };
}

export function assertStatus(pool: DecodedPool, expected: number, label: string): void {
  if (pool.status !== expected) {
    throw new Error(
      `${label}: expected status ${STATUS_NAMES[expected]} (${expected}), got ${pool.statusName} (${pool.status})`,
    );
  }
}

export { PoolStatus };
