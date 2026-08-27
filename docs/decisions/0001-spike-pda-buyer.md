# ADR 0001 — Spike: PDA buyer before escrow

## Status

**Accepted — option A proven on devnet (2026-07-25).**  
See `spikes/pda-buyer/results/SPIKE_RESULT.md`.

## Context

Production design wants a **PDA-owned buyer** so the orchestrator can trigger launch but cannot redirect the buy. On Solana, only the owning program can make a PDA “sign” (`invoke_signed`). Therefore option A cannot be proven from a pure client transaction; a minimal program is required.

## Decision

1. Prefer **option A**: `spike_pda_buyer` CPI into pump `buy_exact_sol_in` with PDA as `user`.
2. Fall back to **option B** (ephemeral keypair) only if pump rejects A.
3. Token **creator** field = buyer PDA (neutral). Fee routing open for later.
4. Pin buy layout to `@pump-fun/pump-sdk@1.36.0` (`third_party/pump-sdk/PIN.md`); public-docs @ `9c82f61…` for background only.
5. Keep RPC/Jito in config/env.
6. Create+buy must split → Jito bundle is load-bearing; anti-snipe is an acceptance test.

## Consequences

- If A succeeds: threat model may claim program-signed pooled buy; escrow proceeds with PDA buyer.
- If A fails: **stop**, document redesign for B, do not build escrow on A.

## Proposed pool defaults (awaiting confirm)

| Param | Value |
|-------|-------|
| min_raise | 1 SOL |
| max_pool | 10 SOL |
| min_contribution | 0.05 SOL |
| contribution window | 24h before `launch_at` (or: open until `launch_at`) |
| grace after launch_at | 1h |

Hard schedule: contribute until `launch_at`; execute only in `[launch_at, launch_at+grace)`; after grace → permissionless refund only.
