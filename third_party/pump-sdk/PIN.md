# Pinned pump layout — spike-proven (authoritative for buys)

**This pin supersedes public-docs alone for buy remaining-accounts layout.**

The spike proved option A against **on-chain** pump on devnet using the remaining-accounts pattern from `@pump-fun/pump-sdk@1.36.0`, not from the public-docs IDL text (which omits `bonding_curve_v2` / buyback remaining accounts on `buy_exact_sol_in`).

| Field | Value |
|-------|--------|
| Source package | `@pump-fun/pump-sdk` |
| Version | **`1.36.0`** |
| Local IDL | `third_party/pump-sdk/pump.json` |
| IDL SHA-256 | `eb93ce13a3f709b3affc80220425f75664423e0e1f8da9996d8591411feeee01` |
| PDA helpers | `third_party/pump-sdk/pda.ts` (from same package version) |
| Spike proof | `spikes/pda-buyer/results/SPIKE_RESULT.md` (2026-07-25) |

## Buy remaining accounts (load-bearing)

For legacy `buy` / `buy_exact_sol_in` (SPL + SOL-paired), after the fixed IDL accounts, append **exactly**:

| Index | Account | Seeds / notes | Writable |
|------|---------|----------------|----------|
| 0 | `bonding_curve_v2` | PDA `["bonding-curve-v2", mint]` under pump program | no |
| 1 | `buyback_fee_recipient` | One of on-chain `Global.buyback_fee_recipients` | yes |

Reference: `PumpSdk.getBuyInstructionInternal` in `@pump-fun/pump-sdk@1.36.0`.

## Fee recipients

**Never hard-code mainnet lists for other clusters.** Decode `Global` on the target cluster:

- Protocol fee: `Global.fee_recipient` or any of `Global.fee_recipients`
- Buyback: any of `Global.buyback_fee_recipients`

Devnet (as of spike): `fee_recipient = 68yFSZxzLWJXkxxRGydZ63C6mHx1NLEDWmwN9Lb5yySg`.

## Program IDs

| Program | Address |
|---------|---------|
| Pump | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| Pump Fees | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` |

## Relationship to `third_party/pump-public-docs`

| Pin | Role |
|-----|------|
| `third_party/pump-sdk/` **(this file)** | **Authoritative** for buy account layout used by batchit CPI |
| `third_party/pump-public-docs/` @ `9c82f61…` | Background docs, program overview, fee-recipient *mainnet* tables |

If the two disagree on buy accounts, **trust this pin + on-chain spike results**.

## Refresh procedure

1. Bump `@pump-fun/pump-sdk` only after re-running the PDA buy spike on devnet.
2. Copy `src/idl/pump.json` and `src/pda.ts` here; update version + SHA-256.
3. Re-run anti-snipe bundle acceptance test before mainnet.
