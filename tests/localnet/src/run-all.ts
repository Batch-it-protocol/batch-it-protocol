/**
 * Start validator (if needed), deploy batchit, run PL matrix, print summary.
 */
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { LOCALNET_ROOT, RPC, REPO_ROOT } from "./constants.js";
import { Connection } from "@solana/web3.js";

async function rpcUp(): Promise<boolean> {
  try {
    const c = new Connection(RPC, "confirmed");
    await c.getLatestBlockhash();
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const startScript = path.join(LOCALNET_ROOT, "scripts/start-validator.ps1");
  const stopScript = path.join(LOCALNET_ROOT, "scripts/stop-validator.ps1");

  if (!(await rpcUp())) {
    console.log("Starting localnet validator with real pump fixtures...");
    execFileSync(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-File", startScript],
      { stdio: "inherit" },
    );
  } else {
    console.log("Validator already up at", RPC);
  }

  // Ensure batchit.so fresh
  const soSrc = path.join(REPO_ROOT, "target/deploy/batchit.so");
  const soDst = path.join(LOCALNET_ROOT, "fixtures/batchit.so");
  if (fs.existsSync(soSrc)) fs.copyFileSync(soSrc, soDst);

  console.log("Deploying batchit...");
  execFileSync("npx", ["tsx", "src/deploy-batchit.ts"], {
    cwd: LOCALNET_ROOT,
    stdio: "inherit",
    shell: true,
  });

  console.log("Running PL matrix...");
  try {
    execFileSync("npx", ["tsx", "--test", "src/pl-matrix.test.ts"], {
      cwd: LOCALNET_ROOT,
      stdio: "inherit",
      shell: true,
    });
    console.log("\n✓ PL matrix finished (see assertions above)");
  } catch {
    console.error("\n✗ PL matrix had failures");
    process.exitCode = 1;
  }

  if (process.env.BATCHIT_KEEP_VALIDATOR !== "1") {
    execFileSync(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-File", stopScript],
      { stdio: "inherit" },
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
