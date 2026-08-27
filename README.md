# Batch It! (Batchit.fun)

Open-source, fair-launch protocol that wraps [Pump.fun](https://pump.fun): pool SOL, execute **one** buy so everyone enters at the same price, burn the surplus so cost basis equals post-buy market price, then claim pro-rata.

**No associated token.** Public-good developer tool and credibility artifact.

```
┌──────────────┐   contribute SOL    ┌─────────────────┐
│ Contributors │ ──────────────────► │ On-chain escrow │
└──────────────┘                     │  (program PDA)  │
                                     └────────┬────────┘
                                              │ execute_launch (orchestrator trigger only)
                                              ▼
                               ┌──────────────────────────────┐
                               │ Jito bundle (atomic):        │
                               │  create token + single buy   │
                               │  signed by PDA buyer         │
                               └──────────────┬───────────────┘
                                              ▼
                               ┌──────────────────────────────┐
                               │ finalize: distributable +    │
                               │ SPL burn of surplus          │
                               │ claim pro-rata / refund      │
                               └──────────────────────────────┘
```

## Status

| Phase | State |
|-------|--------|
| **0 — Spike: PDA buy + create via pump** | **DONE — option A proven** — see `spikes/pda-buyer/results/SPIKE_RESULT.md` |
| 1 — Escrow program + tests | **in progress** — program + PL harness (real pump fixtures); see `tests/localnet/` |
| 2 — Curve / split / burn math | **started** — `packages/core` + on-chain `math.rs` |
| 3 — Adapters (pump, Jito) | pending (orchestrator uses spike layout + Jito stub) |
| 4 — Orchestrator | **thin stub** — crash-resume stages + Jito-only path |
| 5 — Web | pending |
| 6 — Docs (threat model, upgrade authority) | pending |
| Mainnet | **forbidden** until full test gate (see build prompt) |

## Design decisions (locked)

| Topic | Decision |
|-------|----------|
| Buyer | Prefer **A: PDA via invoke_signed**; B ephemeral only if A fails |
| Token creator | Program/PDA (neutral). Creator fee routing is an open economic question |
| Schedule | Hard: contribute until `launch_at`; execute in `[launch_at, launch_at+grace)`; then permissionless refund |
| Caps | `max_pool` (burn dial) + `min_contribution`; no max_contributors |
| Proposed defaults | min_raise **1 SOL**, max_pool **10 SOL**, min_contribution **0.05 SOL**, window **24h**, grace **1h** (confirm) |
| Pump IDL | Pinned: `third_party/pump-public-docs/PIN.md` |
| Config | RPC + Jito via `config/` + env — never hard-code production endpoints |

## Monorepo layout

```
programs/batchit/          # production escrow (after spike)
programs/spike_pda_buyer/  # spike-only CPI wrapper
packages/core/             # curve + split math
packages/adapters/         # pump + jito
apps/orchestrator/
apps/web/
apps/docs/
spikes/pda-buyer/          # option A proof harness
third_party/pump-public-docs/
config/
keys/                      # gitignored
```

## Spike (start here)

```bash
# 1. Fund the printed address (devnet)
cd spikes/pda-buyer && npm install && npm run spike:status

# 2. After funding:
npm run spike
```

**Funder address (fresh keypair):** check `npm run spike:status` or the key under `keys/devnet-funder.json`.

**Option A proven:** pump accepts PDA buyer via `invoke_signed` (lite program `HkwzdYe7nK4bvENKw2oZ1CgaFZTSqynowahT9vwLtNGb` on devnet). Create+buy must be split → Jito bundle for mainnet atomicity.

## License

MIT
