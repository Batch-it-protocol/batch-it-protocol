import { createHash } from "node:crypto";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { BATCHIT_PROGRAM_ID } from "./constants.js";

export function disc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export function poolPda(creator: PublicKey, seed: bigint | number): [PublicKey, number] {
  const seedBuf = Buffer.alloc(8);
  seedBuf.writeBigUInt64LE(BigInt(seed));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), creator.toBuffer(), seedBuf],
    BATCHIT_PROGRAM_ID,
  );
}

export function buyerPda(pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("buyer"), pool.toBuffer()],
    BATCHIT_PROGRAM_ID,
  );
}

export function contributionPda(
  pool: PublicKey,
  contributor: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("contribution"), pool.toBuffer(), contributor.toBuffer()],
    BATCHIT_PROGRAM_ID,
  );
}

export function createPoolIx(params: {
  creator: PublicKey;
  seed: bigint | number;
  launchAt: bigint | number;
  graceSecs: bigint | number;
  minRaise: bigint | number;
  maxPool: bigint | number;
  minContribution: bigint | number;
}): TransactionInstruction {
  const [pool] = poolPda(params.creator, params.seed);
  const [buyer] = buyerPda(pool);
  const data = Buffer.alloc(8 + 8 + 8 + 8 + 8 + 8 + 8);
  disc("create_pool").copy(data, 0);
  data.writeBigUInt64LE(BigInt(params.seed), 8);
  data.writeBigInt64LE(BigInt(params.launchAt), 16);
  data.writeBigInt64LE(BigInt(params.graceSecs), 24);
  data.writeBigUInt64LE(BigInt(params.minRaise), 32);
  data.writeBigUInt64LE(BigInt(params.maxPool), 40);
  data.writeBigUInt64LE(BigInt(params.minContribution), 48);

  return new TransactionInstruction({
    programId: BATCHIT_PROGRAM_ID,
    keys: [
      { pubkey: params.creator, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function contributeIx(params: {
  contributor: PublicKey;
  creator: PublicKey;
  seed: bigint | number;
  amount: bigint | number;
}): TransactionInstruction {
  const [pool] = poolPda(params.creator, params.seed);
  const [contribution] = contributionPda(pool, params.contributor);
  const data = Buffer.alloc(8 + 8);
  disc("contribute").copy(data, 0);
  data.writeBigUInt64LE(BigInt(params.amount), 8);
  return new TransactionInstruction({
    programId: BATCHIT_PROGRAM_ID,
    keys: [
      { pubkey: params.contributor, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: contribution, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function beginLaunchIx(params: {
  caller: PublicKey;
  creator: PublicKey;
  seed: bigint | number;
  mint: PublicKey;
}): TransactionInstruction {
  const [pool] = poolPda(params.creator, params.seed);
  const data = Buffer.alloc(8 + 32);
  disc("begin_launch").copy(data, 0);
  params.mint.toBuffer().copy(data, 8);
  return new TransactionInstruction({
    programId: BATCHIT_PROGRAM_ID,
    keys: [
      { pubkey: params.caller, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function markRefundableIx(params: {
  caller: PublicKey;
  creator: PublicKey;
  seed: bigint | number;
}): TransactionInstruction {
  const [pool] = poolPda(params.creator, params.seed);
  return new TransactionInstruction({
    programId: BATCHIT_PROGRAM_ID,
    keys: [
      { pubkey: params.caller, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
    ],
    data: disc("mark_refundable"),
  });
}

export function refundIx(params: {
  contributor: PublicKey;
  creator: PublicKey;
  seed: bigint | number;
}): TransactionInstruction {
  const [pool] = poolPda(params.creator, params.seed);
  const [contribution] = contributionPda(pool, params.contributor);
  return new TransactionInstruction({
    programId: BATCHIT_PROGRAM_ID,
    keys: [
      { pubkey: params.contributor, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: contribution, isSigner: false, isWritable: true },
    ],
    data: disc("refund"),
  });
}
