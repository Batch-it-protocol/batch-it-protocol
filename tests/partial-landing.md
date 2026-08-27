# Partial-landing test matrix (phase 1)

## Local / unit (must pass before devnet)

| ID | Scenario | Expected |
|----|----------|----------|
| PL-1 | `complete_buy` without bonding curve | `CreateNotLanded`; SOL still in pool; status `Launching` |
| PL-2 | Create landed, buy not yet | status `Launching`; `bundleKind` = buy_only |
| PL-3 | `complete_buy` after create | → `Bought`; SOL left escrow |
| PL-4 | Grace expires in `Launching` without buy | `refund` returns full contribution; orphan mint not claimed |
| PL-5 | Buy without create | impossible — same as PL-1 |
| PL-6 | Idempotent `complete_buy` when already `Bought` | success no-op |
| PL-7 | Double claim | second fails |
| PL-8 | Claim before finalize | fails |
| PL-9 | Refund while `Open` before grace | fails |
| PL-10 | Orchestrator absent after grace | contributor refunds alone |

Math unit tests: `programs/batchit` `math::tests`, `packages/core` burn tests.

## Harness location

| Runner | Command | Pump |
|--------|---------|------|
| Local validator + real ELF dumps | `tests/localnet` → `npm test` | Real (fixtures) |
| Devnet sequential fallback | `tests/localnet` → `npm run test:pl:devnet` | Real (live) |
| Host notes | `tests/localnet/ENVIRONMENT.md` | — |

See also AS-1 artifact: `docs/test-results/anti-snipe/TEMPLATE.md`.

## Devnet acceptance (blocks phase 1 done)

| ID | Scenario | Expected |
|----|----------|----------|
| AS-1 | **Anti-snipe** — real Jito create+buy bundle; concurrent sniper between create and buy | Pool PDA buy is **first** trade on curve |
| AS-2 | Bundle failure / create-only then kill orch | After grace, full refund |
| AS-3 | Crash after `begin_launch`, resume | buy-only or create+buy per chain state → `Bought` |

Sequential RPC path (`BATCHIT_ALLOW_SEQUENTIAL_RPC=1`) **must fail** AS-1 by design (or be excluded from acceptance runs).
