import { Connection, PublicKey } from "@solana/web3.js";
import { bondingCurvePda, PUMP_PROGRAM_ID } from "./pump.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const idl = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../third_party/pump-public-docs/pump.json",
    ),
    "utf8",
  ),
);

const errs = (idl.errors || []).filter(
  (e: { code: number }) => e.code >= 6060 && e.code <= 6085,
);
console.log("errors", JSON.stringify(errs, null, 2));
console.log(
  "idl has bonding_curve_v2",
  JSON.stringify(idl).includes("bonding_curve_v2"),
);

const mint = new PublicKey("77vtRiq8Tpye9SBYkTC8nv1c9KiGRLNzEF6mRtApAtNE");
const bc = bondingCurvePda(mint);
const c = new Connection("https://api.devnet.solana.com", "confirmed");
const info = await c.getAccountInfo(bc);
console.log("bc", bc.toBase58(), "len", info?.data.length);

const candidates = [
  "bonding-curve-v2",
  "bonding_curve_v2",
  "bonding-curve-v2\0",
  "curve-v2",
  "bc-v2",
];
for (const seed of candidates) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(seed.replace("\\0", "\0")), mint.toBuffer()],
    PUMP_PROGRAM_ID,
  );
  const i = await c.getAccountInfo(pda);
  console.log(seed, pda.toBase58(), i ? `len=${i.data.length}` : "missing");
}

// Also try seed only mint
const [onlyMint] = PublicKey.findProgramAddressSync(
  [Buffer.from("bonding-curve-v2"), mint.toBuffer()],
  PUMP_PROGRAM_ID,
);
console.log("recheck", onlyMint.toBase58());
