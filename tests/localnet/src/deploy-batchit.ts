/**
 * Deploy batchit program to local validator using solana CLI.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { FIXTURES, LOCALNET_ROOT, REPO_ROOT, RPC } from "./constants.js";

const solana =
  process.env.SOLANA_BIN ??
  path.join(
    process.env.USERPROFILE ?? "",
    ".local/share/solana/install/active_release/bin/solana.exe",
  );

const so = path.join(FIXTURES, "batchit.so");
const keypair = path.join(FIXTURES, "batchit-keypair.json");
const funder = path.join(REPO_ROOT, "keys/localnet-deployer.json");

function main(): void {
  if (!fs.existsSync(so)) {
    // copy from target
    const src = path.join(REPO_ROOT, "target/deploy/batchit.so");
    fs.copyFileSync(src, so);
  }
  if (!fs.existsSync(keypair)) {
    fs.copyFileSync(
      path.join(REPO_ROOT, "keys/batchit-program.json"),
      keypair,
    );
  }

  // Generate deployer if needed
  if (!fs.existsSync(funder)) {
    execFileSync(
      solana.replace("solana.exe", "solana-keygen.exe"),
      ["new", "--no-bip39-passphrase", "--force", "-o", funder],
      { stdio: "inherit" },
    );
  }

  // Airdrop
  try {
    execFileSync(solana, ["airdrop", "100", "-u", RPC, "--keypair", funder], {
      stdio: "inherit",
    });
  } catch {
    /* retry */
    execFileSync(solana, ["airdrop", "50", "-u", RPC, "--keypair", funder], {
      stdio: "inherit",
    });
  }

  execFileSync(
    solana,
    [
      "program",
      "deploy",
      so,
      "--program-id",
      keypair,
      "--url",
      RPC,
      "--keypair",
      funder,
      "--max-len",
      "400000",
    ],
    { stdio: "inherit", cwd: LOCALNET_ROOT },
  );
  console.log("batchit deployed");
}

main();
