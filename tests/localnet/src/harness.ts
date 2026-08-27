import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "node:fs";
import path from "node:path";
import {
  BATCHIT_PROGRAM_ID,
  DEVNET_BUYBACK,
  DEVNET_FEE_RECIPIENT,
  FIXTURES,
  RPC,
} from "./constants.js";
import {
  beginLaunchIx,
  contributeIx,
  createPoolIx,
  markRefundableIx,
  poolPda,
  refundIx,
  buyerPda,
} from "./anchor-ix.js";
import { completeBuyIx } from "./complete-buy-ix.js";
import {
  bondingCurvePda,
  buildCreateIx,
  getAssociatedTokenAddressSync,
} from "./pump.js";
import { decodePool, type DecodedPool } from "./pool-decode.js";

export type Ctx = {
  connection: Connection;
  payer: Keypair;
  creator: Keypair;
  contributor: Keypair;
};

export async function connect(): Promise<Ctx> {
  const connection = new Connection(RPC, "confirmed");
  // health
  for (let i = 0; i < 30; i++) {
    try {
      await connection.getLatestBlockhash();
      break;
    } catch {
      await sleep(500);
    }
  }

  const payer = Keypair.generate();
  const creator = Keypair.generate();
  const contributor = Keypair.generate();

  // Fund via airdrop (local validator faucet)
  for (const kp of [payer, creator, contributor]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 100 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  // Fund fee recipients so pump can write to them
  for (const pk of [DEVNET_FEE_RECIPIENT, DEVNET_BUYBACK]) {
    try {
      const sig = await connection.requestAirdrop(pk, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
    } catch {
      // may already exist with lamports from clone
    }
  }

  // Ensure batchit deployed
  const info = await connection.getAccountInfo(BATCHIT_PROGRAM_ID);
  if (!info?.executable) {
    throw new Error(
      `batchit not deployed at ${BATCHIT_PROGRAM_ID.toBase58()}. Run: npm run deploy`,
    );
  }

  // Ensure pump present
  const pump = await connection.getAccountInfo(
    new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
  );
  if (!pump?.executable) {
    throw new Error("pump program missing — start validator with fixtures");
  }

  return { connection, payer, creator, contributor };
}

export async function sendIx(
  ctx: Ctx,
  ixs: TransactionInstruction[],
  signers: Keypair[] = [],
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  return sendAndConfirmTransaction(
    ctx.connection,
    tx,
    [ctx.payer, ...signers],
    { commitment: "confirmed" },
  );
}

export async function fetchPool(
  ctx: Ctx,
  creator: PublicKey,
  seed: number | bigint,
): Promise<DecodedPool> {
  const [pool] = poolPda(creator, seed);
  const info = await ctx.connection.getAccountInfo(pool);
  if (!info) throw new Error(`pool missing ${pool.toBase58()}`);
  return decodePool(Buffer.from(info.data));
}

export async function poolLamports(
  ctx: Ctx,
  creator: PublicKey,
  seed: number | bigint,
): Promise<number> {
  const [pool] = poolPda(creator, seed);
  return ctx.connection.getBalance(pool);
}

export async function curveExists(ctx: Ctx, mint: PublicKey): Promise<boolean> {
  const bc = bondingCurvePda(mint);
  const info = await ctx.connection.getAccountInfo(bc);
  return !!(info && info.data.length > 0 && info.owner.equals(
    new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
  ));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitUntil(ts: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (ts > now) {
    await sleep((ts - now + 1) * 1000);
  }
}

/** Open pool, contribute, wait for launch_at, begin_launch with mint. */
export async function setupLaunching(params: {
  ctx: Ctx;
  seed: number;
  contribution: bigint;
  graceSecs: number;
  launchDelaySecs?: number;
  mint?: Keypair;
}): Promise<{ mint: Keypair; seed: number; launchAt: number; graceEndsAt: number }> {
  const { ctx, seed, contribution, graceSecs } = params;
  const delay = params.launchDelaySecs ?? 3;
  const mint = params.mint ?? Keypair.generate();
  const now = Math.floor(Date.now() / 1000);
  const launchAt = now + delay;

  await sendIx(ctx, [
    createPoolIx({
      creator: ctx.creator.publicKey,
      seed,
      launchAt,
      graceSecs,
      minRaise: contribution,
      maxPool: contribution * 10n,
      minContribution: contribution,
    }),
  ], [ctx.creator]);

  await sendIx(ctx, [
    contributeIx({
      contributor: ctx.contributor.publicKey,
      creator: ctx.creator.publicKey,
      seed,
      amount: contribution,
    }),
  ], [ctx.contributor]);

  await waitUntil(launchAt);

  await sendIx(ctx, [
    beginLaunchIx({
      caller: ctx.payer.publicKey,
      creator: ctx.creator.publicKey,
      seed,
      mint: mint.publicKey,
    }),
  ]);

  return { mint, seed, launchAt, graceEndsAt: launchAt + graceSecs };
}

/** Real pump create for committed mint; creator = buyer PDA (neutral). */
export async function pumpCreate(params: {
  ctx: Ctx;
  mint: Keypair;
  creator: PublicKey;
}): Promise<string> {
  const ix = buildCreateIx({
    mint: params.mint.publicKey,
    user: params.ctx.payer.publicKey,
    creator: params.creator,
    name: "PL Test",
    symbol: "PLT",
    uri: "https://batchit.fun/pl.json",
  });
  return sendIx(params.ctx, [ix], [params.mint]);
}

export async function prepareBuyerAta(
  ctx: Ctx,
  poolCreator: PublicKey,
  seed: number | bigint,
  mint: PublicKey,
): Promise<PublicKey> {
  const [pool] = poolPda(poolCreator, seed);
  const [buyer] = buyerPda(pool);
  const ata = getAssociatedTokenAddressSync(mint, buyer, true, TOKEN_PROGRAM_ID);
  await sendIx(ctx, [
    createAssociatedTokenAccountIdempotentInstruction(
      ctx.payer.publicKey,
      ata,
      buyer,
      mint,
      TOKEN_PROGRAM_ID,
    ),
  ]);
  return ata;
}

export async function tryCompleteBuy(params: {
  ctx: Ctx;
  seed: number;
  mint: PublicKey;
}): Promise<{ ok: true; sig: string } | { ok: false; error: string; logs?: string[] }> {
  const ix = completeBuyIx({
    caller: params.ctx.payer.publicKey,
    creator: params.ctx.creator.publicKey,
    seed: params.seed,
    mint: params.mint,
    feeRecipient: DEVNET_FEE_RECIPIENT,
    buybackFeeRecipient: DEVNET_BUYBACK,
    minTokensOut: 1n,
  });
  try {
    const sig = await sendIx(params.ctx, [ix]);
    return { ok: true, sig };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const logs =
      e && typeof e === "object" && "logs" in e
        ? (e as { logs?: string[] }).logs
        : undefined;
    return { ok: false, error: msg, logs };
  }
}

export function deployBatchitIfNeeded(): void {
  // handled by deploy script
  void FIXTURES;
}
