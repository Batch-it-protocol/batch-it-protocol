# Localnet environment blockers (this host)

## What we built

| Layer | Path | Role |
|-------|------|------|
| Real pump ELF + Global dump | `fixtures/pump.so`, `global.json`, … | Source of truth for create/buy accounts |
| TS PL harness (validator) | `src/pl-matrix.test.ts`, `run-all.ts` | Full PL-1…PL-10 when validator works |
| TS PL harness (devnet fallback) | `src/run-devnet-pl.ts` | Real pump CPI, sequential (not Jito) |
| AS-1 artifact template | `docs/test-results/anti-snipe/TEMPLATE.md` | Strict “pool buy first” evidence |

## Blockers observed 2026-07-25

1. **`solana-test-validator` genesis unpack**  
   `Error checking to unpack genesis archive: IO error: Access is denied (os error 5)`  
   Reproduced under `%TEMP%`, `C:\tmp`, and repo paths. Likely Windows Defender / policy blocking `genesis.tar.bz2` extract.

2. **`solana-program-test` (Rust)**  
   Pulls `openssl-sys` vendor build → needs `perl` (not installed).

3. **LiteSVM**  
   No Windows native binary in npm package.

4. **Devnet deploy of batchit**  
   Needs ~2.8 SOL buffer for 294KB upgradeable program; funder has ~0.4 SOL.

## Unblock options (pick one)

| Option | Action |
|--------|--------|
| A | Exclude ledger path from Defender; re-run `npm test` in `tests/localnet` |
| B | Install Perl + OpenSSL for `cargo test` in `tests/pl-integration` |
| C | Fund `B41Gzyj376gikWF772HvuwYyPZ6xhM6CPX3f5fHFuctj` with **≥3 SOL** devnet → deploy batchit → `npm run test:pl:devnet` |
| D | Run harness on Linux/mac CI agent with same fixtures |

## Design still holds without a green run on this laptop

- PL cases are encoded against **real** pump account ownership and **real** batchit instructions.
- Critical path “create landed, buy didn’t” is implemented as: pump `create` → leave `Launching` → grace → refund; orphan curve remains.
- AS-1 remains separate; artifact template is ready before Jito work.
