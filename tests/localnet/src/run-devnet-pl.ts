/**
 * PL matrix against REAL pump on devnet (sequential txs — intentional).
 *
 * Why: this Windows host cannot unpack solana-test-validator genesis (Access Denied).
 * Devnet gives real pump create/buy/curve ownership without Jito, so we isolate
 * "is the program state machine correct under real pump CPI" from "did the bundle land".
 *
 * NOT a substitute for AS-1 (anti-snipe / Jito). Artifact for AS-1 remains required later.
 *
 *   $env:BATCHIT_KEYPAIR_PATH=..\..\keys\devnet-funder.json
 *   npx tsx src/run-devnet-pl.ts
 */
import fs from "node:fs";
import path from "node:path";
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
import {
  beginLaunchIx,
  contributeIx,
  createPoolIx,
  markRefundableIx,
  poolPda,
  buyerPda,
  refundIx,
} from "./anchor-ix.js";
import { completeBuyIx } from "./complete-buy-ix.js";
import {
  bondingCurvePda,
  buildCreateIx,
  getAssociatedTokenAddressSync,
} from "./pump.js";
import { decodePool, PoolStatus } from "./pool-decode.js";
import {
  BATCHIT_PROGRAM_ID,
  DEVNET_BUYBACK,
  DEVNET_FEE_RECIPIENT,
  REPO_ROOT,
} from "./constants.js";

const RPC = process.env.BATCHIT_RPC_URL ?? "https://api.devnet.solana.com";

type Result = { id: string; pass: boolean; detail: string };

function loadKp(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[]),
  );
}

async function send(
  connection: Connection,
  payer: Keypair,
  ixs: TransactionInstruction[],
  signers: Keypair[] = [],
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  return sendAndConfirmTransaction(connection, tx, [payer, ...signers], {
    commitment: "confirmed",
  });
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitTs(ts: number) {
  const now = Math.floor(Date.now() / 1000);
  if (ts > now) await sleep((ts - now + 1) * 1000);
}

async function main(): Promise<void> {
  const results: Result[] = [];
  const connection = new Connection(RPC, "confirmed");
  const kpPath =
    process.env.BATCHIT_KEYPAIR_PATH ??
    path.join(REPO_ROOT, "keys/devnet-funder.json");
  const payer = loadKp(kpPath);
  const bal = await connection.getBalance(payer.publicKey);
  console.log("RPC", RPC);
  console.log("payer", payer.publicKey.toBase58(), bal / LAMPORTS_PER_SOL, "SOL");

  const batchit = await connection.getAccountInfo(BATCHIT_PROGRAM_ID);
  if (!batchit?.executable) {
    console.error(
      "batchit not deployed on this cluster at",
      BATCHIT_PROGRAM_ID.toBase58(),
      "\nDeploy first: solana program deploy target/deploy/batchit.so --program-id keys/batchit-program.json -u devnet",
    );
    process.exit(1);
  }

  const pump = await connection.getAccountInfo(
    new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
  );
  console.log("pump executable", !!pump?.executable);

  // Use payer as creator+contributor to save SOL
  const creator = payer;
  const contributor = payer;
  let seedBase = Math.floor(Date.now() / 1000) % 1_000_000;

  const nextSeed = () => ++seedBase;

  // --- PL-1: no create, complete_buy fails, funds recoverable ---
  try {
    const seed = nextSeed();
    const contribution = BigInt(Math.floor(0.05 * LAMPORTS_PER_SOL));
    const now = Math.floor(Date.now() / 1000);
    const launchAt = now + 3;
    const grace = 120;
    const mint = Keypair.generate();

    await send(connection, payer, [
      createPoolIx({
        creator: creator.publicKey,
        seed,
        launchAt,
        graceSecs: grace,
        minRaise: contribution,
        maxPool: contribution * 20n,
        minContribution: contribution,
      }),
    ], [creator]);
    await send(connection, payer, [
      contributeIx({
        contributor: contributor.publicKey,
        creator: creator.publicKey,
        seed,
        amount: contribution,
      }),
    ], [contributor]);
    await waitTs(launchAt);
    await send(connection, payer, [
      beginLaunchIx({
        caller: payer.publicKey,
        creator: creator.publicKey,
        seed,
        mint: mint.publicKey,
      }),
    ]);

    const [poolPk] = poolPda(creator.publicKey, seed);
    const [buyer] = buyerPda(poolPk);
    const ata = getAssociatedTokenAddressSync(
      mint.publicKey,
      buyer,
      true,
      TOKEN_PROGRAM_ID,
    );
    // mint doesn't exist — ATA create may fail. Skip ATA; complete_buy may fail earlier.
    let buyFailed = false;
    let errMsg = "";
    try {
      await send(connection, payer, [
        completeBuyIx({
          caller: payer.publicKey,
          creator: creator.publicKey,
          seed,
          mint: mint.publicKey,
          feeRecipient: DEVNET_FEE_RECIPIENT,
          buybackFeeRecipient: DEVNET_BUYBACK,
        }),
      ]);
    } catch (e) {
      buyFailed = true;
      errMsg = e instanceof Error ? e.message : String(e);
    }
    const info = await connection.getAccountInfo(poolPk);
    const pool = decodePool(Buffer.from(info!.data));
    const pass =
      buyFailed &&
      pool.status === PoolStatus.Launching &&
      pool.totalContributed === contribution;
    results.push({
      id: "PL-1",
      pass,
      detail: pass
        ? `CreateNotLanded path: still Launching, SOL=${contribution}`
        : `fail buyFailed=${buyFailed} status=${pool.statusName} err=${errMsg.slice(0, 200)}`,
    });
  } catch (e) {
    results.push({
      id: "PL-1",
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // --- PL-2 + PL-3: real pump create, then complete_buy CPI ---
  try {
    const seed = nextSeed();
    const contribution = BigInt(Math.floor(0.05 * LAMPORTS_PER_SOL));
    const now = Math.floor(Date.now() / 1000);
    const launchAt = now + 3;
    const grace = 300;
    const mint = Keypair.generate();

    await send(connection, payer, [
      createPoolIx({
        creator: creator.publicKey,
        seed,
        launchAt,
        graceSecs: grace,
        minRaise: contribution,
        maxPool: contribution * 20n,
        minContribution: contribution,
      }),
    ], [creator]);
    await send(connection, payer, [
      contributeIx({
        contributor: contributor.publicKey,
        creator: creator.publicKey,
        seed,
        amount: contribution,
      }),
    ], [contributor]);
    await waitTs(launchAt);
    await send(connection, payer, [
      beginLaunchIx({
        caller: payer.publicKey,
        creator: creator.publicKey,
        seed,
        mint: mint.publicKey,
      }),
    ]);

    const [poolPk] = poolPda(creator.publicKey, seed);
    const [buyer] = buyerPda(poolPk);

    // REAL pump create
    await send(
      connection,
      payer,
      [
        buildCreateIx({
          mint: mint.publicKey,
          user: payer.publicKey,
          creator: buyer,
          name: "PL Devnet",
          symbol: "PLD",
          uri: "https://batchit.fun/pl.json",
        }),
      ],
      [mint],
    );

    const bc = bondingCurvePda(mint.publicKey);
    const bcInfo = await connection.getAccountInfo(bc);
    const curveOk =
      !!bcInfo &&
      bcInfo.owner.equals(
        new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
      );
    let pool = decodePool(
      Buffer.from((await connection.getAccountInfo(poolPk))!.data),
    );
    results.push({
      id: "PL-2",
      pass: curveOk && pool.status === PoolStatus.Launching,
      detail: curveOk
        ? `real pump curve ${bc.toBase58()} owner=pump; status=${pool.statusName}`
        : "curve missing or wrong owner",
    });

    // ATA for buyer
    const ata = getAssociatedTokenAddressSync(
      mint.publicKey,
      buyer,
      true,
      TOKEN_PROGRAM_ID,
    );
    await send(connection, payer, [
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        ata,
        buyer,
        mint.publicKey,
        TOKEN_PROGRAM_ID,
      ),
    ]);

    // REAL complete_buy CPI into pump
    let buyOk = false;
    let buyErr = "";
    try {
      await send(connection, payer, [
        completeBuyIx({
          caller: payer.publicKey,
          creator: creator.publicKey,
          seed,
          mint: mint.publicKey,
          feeRecipient: DEVNET_FEE_RECIPIENT,
          buybackFeeRecipient: DEVNET_BUYBACK,
        }),
      ]);
      buyOk = true;
    } catch (e) {
      buyErr = e instanceof Error ? e.message : String(e);
    }
    pool = decodePool(
      Buffer.from((await connection.getAccountInfo(poolPk))!.data),
    );
    results.push({
      id: "PL-3",
      pass: buyOk && pool.status === PoolStatus.Bought && pool.tokensBought > 0n,
      detail: buyOk
        ? `Bought tokens=${pool.tokensBought}`
        : `buy failed: ${buyErr.slice(0, 300)}`,
    });

    // PL-6 idempotent
    if (buyOk) {
      let idemp = false;
      try {
        await send(connection, payer, [
          completeBuyIx({
            caller: payer.publicKey,
            creator: creator.publicKey,
            seed,
            mint: mint.publicKey,
            feeRecipient: DEVNET_FEE_RECIPIENT,
            buybackFeeRecipient: DEVNET_BUYBACK,
          }),
        ]);
        idemp = true;
      } catch {
        idemp = false;
      }
      const pool2 = decodePool(
        Buffer.from((await connection.getAccountInfo(poolPk))!.data),
      );
      results.push({
        id: "PL-6",
        pass: idemp && pool2.tokensBought === pool.tokensBought,
        detail: `idempotent=${idemp} tokens=${pool2.tokensBought}`,
      });
    }
  } catch (e) {
    results.push({
      id: "PL-2/3/6",
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // --- PL-4: create only, grace, refund (orphan mint) ---
  try {
    const seed = nextSeed();
    const contribution = BigInt(Math.floor(0.05 * LAMPORTS_PER_SOL));
    const now = Math.floor(Date.now() / 1000);
    const launchAt = now + 3;
    const grace = 8;
    const mint = Keypair.generate();

    await send(connection, payer, [
      createPoolIx({
        creator: creator.publicKey,
        seed,
        launchAt,
        graceSecs: grace,
        minRaise: contribution,
        maxPool: contribution * 20n,
        minContribution: contribution,
      }),
    ], [creator]);
    await send(connection, payer, [
      contributeIx({
        contributor: contributor.publicKey,
        creator: creator.publicKey,
        seed,
        amount: contribution,
      }),
    ], [contributor]);
    await waitTs(launchAt);
    await send(connection, payer, [
      beginLaunchIx({
        caller: payer.publicKey,
        creator: creator.publicKey,
        seed,
        mint: mint.publicKey,
      }),
    ]);
    const [poolPk] = poolPda(creator.publicKey, seed);
    const [buyer] = buyerPda(poolPk);
    await send(
      connection,
      payer,
      [
        buildCreateIx({
          mint: mint.publicKey,
          user: payer.publicKey,
          creator: buyer,
          name: "PL Orphan",
          symbol: "PLO",
          uri: "https://batchit.fun/pl.json",
        }),
      ],
      [mint],
    );
    // wait grace
    await waitTs(launchAt + grace + 1);
    const before = await connection.getBalance(contributor.publicKey);
    await send(connection, payer, [
      markRefundableIx({
        caller: payer.publicKey,
        creator: creator.publicKey,
        seed,
      }),
    ]);
    await send(
      connection,
      payer,
      [
        refundIx({
          contributor: contributor.publicKey,
          creator: creator.publicKey,
          seed,
        }),
      ],
      [contributor],
    );
    const after = await connection.getBalance(contributor.publicKey);
    const pool = decodePool(
      Buffer.from((await connection.getAccountInfo(poolPk))!.data),
    );
    const curveStill = !!(await connection.getAccountInfo(
      bondingCurvePda(mint.publicKey),
    ));
    results.push({
      id: "PL-4",
      pass:
        pool.totalContributed === 0n &&
        after > before + Number(contribution) - 20_000 &&
        curveStill,
      detail: `refunded; orphan curve still exists=${curveStill}`,
    });
  } catch (e) {
    results.push({
      id: "PL-4",
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // --- PL-9: refund too early ---
  try {
    const seed = nextSeed();
    const contribution = BigInt(Math.floor(0.05 * LAMPORTS_PER_SOL));
    const now = Math.floor(Date.now() / 1000);
    await send(connection, payer, [
      createPoolIx({
        creator: creator.publicKey,
        seed,
        launchAt: now + 3600,
        graceSecs: 3600,
        minRaise: contribution,
        maxPool: contribution * 20n,
        minContribution: contribution,
      }),
    ], [creator]);
    await send(connection, payer, [
      contributeIx({
        contributor: contributor.publicKey,
        creator: creator.publicKey,
        seed,
        amount: contribution,
      }),
    ], [contributor]);
    let failed = false;
    try {
      await send(
        connection,
        payer,
        [
          refundIx({
            contributor: contributor.publicKey,
            creator: creator.publicKey,
            seed,
          }),
        ],
        [contributor],
      );
    } catch {
      failed = true;
    }
    results.push({
      id: "PL-9",
      pass: failed,
      detail: failed ? "refund correctly rejected before grace" : "refund wrongly succeeded",
    });
  } catch (e) {
    results.push({
      id: "PL-9",
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // --- PL-10: no orch, grace, refund ---
  try {
    const seed = nextSeed();
    const contribution = BigInt(Math.floor(0.05 * LAMPORTS_PER_SOL));
    const now = Math.floor(Date.now() / 1000);
    const launchAt = now + 3;
    const grace = 6;
    await send(connection, payer, [
      createPoolIx({
        creator: creator.publicKey,
        seed,
        launchAt,
        graceSecs: grace,
        minRaise: contribution,
        maxPool: contribution * 20n,
        minContribution: contribution,
      }),
    ], [creator]);
    await send(connection, payer, [
      contributeIx({
        contributor: contributor.publicKey,
        creator: creator.publicKey,
        seed,
        amount: contribution,
      }),
    ], [contributor]);
    await waitTs(launchAt);
    // begin_launch so we're Launching (optional for Open past grace too)
    const mint = Keypair.generate();
    await send(connection, payer, [
      beginLaunchIx({
        caller: payer.publicKey,
        creator: creator.publicKey,
        seed,
        mint: mint.publicKey,
      }),
    ]);
    await waitTs(launchAt + grace + 1);
    const before = await connection.getBalance(contributor.publicKey);
    await send(
      connection,
      payer,
      [
        refundIx({
          contributor: contributor.publicKey,
          creator: creator.publicKey,
          seed,
        }),
      ],
      [contributor],
    );
    const after = await connection.getBalance(contributor.publicKey);
    results.push({
      id: "PL-10",
      pass: after > before + Number(contribution) - 20_000,
      detail: `refund without orchestrator delta=${after - before}`,
    });
  } catch (e) {
    results.push({
      id: "PL-10",
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // Summary
  console.log("\n========== PL RESULTS (real pump, sequential) ==========");
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`);
  }
  const all = results.every((r) => r.pass);
  const outDir = path.join(REPO_ROOT, "docs/test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const artifact = {
    timestamp: new Date().toISOString(),
    rpc: RPC,
    batchit: BATCHIT_PROGRAM_ID.toBase58(),
    mode: "sequential-real-pump-devnet-fallback",
    note: "Not AS-1. Localnet validator blocked on this host (genesis ACL). Real pump create/buy CPI exercised.",
    results,
    allPass: all,
  };
  fs.writeFileSync(
    path.join(outDir, "pl-matrix-latest.json"),
    JSON.stringify(artifact, null, 2),
  );
  console.log("Wrote docs/test-results/pl-matrix-latest.json");
  process.exit(all ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
