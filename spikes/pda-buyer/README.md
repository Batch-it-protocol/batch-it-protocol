# Spike: PDA buyer + pump.fun create (option A)

**Success criterion:** Does pump.fun accept a PDA as the `user` (buyer) on `buy_exact_sol_in` when signed via `invoke_signed` from our program?

| Result | Meaning |
|--------|---------|
| **A proven** | Production can use a PDA-owned buyer; threat model claims hold |
| **A failed** | **STOP.** Redesign notes for option B (ephemeral keypair). Do not build escrow on A. |

## Prerequisites

1. Built program: `cargo build-sbf --manifest-path programs/spike_pda_buyer/Cargo.toml`
2. Funded devnet keypair at `keys/devnet-funder.json` (generated for you)
3. Node 20+

## Config

RPC and Jito endpoints come from `config/default.json`, overridable via `config/local.json` or env (see `.env.example`). **Do not hard-code production endpoints.**

## Run

```bash
cd spikes/pda-buyer
npm install
npm run spike:status   # check balances / program deploy state
npm run spike          # full option-A proof
```

Results land in `results/SPIKE_RESULT.md` and `results/spike-result.json`.

## What it does

1. Deploys `spike_pda_buyer` (minimal program, not production escrow)
2. Creates a pump.fun token with `creator = buyer PDA`
3. Funds the buyer PDA, creates its ATA
4. CPI `buy_exact_sol_in` with PDA as `user` via `invoke_signed`
5. Probes Jito bundle API (wiring only; public engines are mainnet-oriented)

Same-transaction create+buy is atomic without Jito. Jito matters when create and buy must be separate transactions on mainnet for size/priority.

## Pump IDL pin

See `third_party/pump-public-docs/PIN.md` — commit `9c82f61cb711b044a17f770ab8ce9f9bdf78f333`.
