# Phase 1 — Escrow program plan

**Status:** Open for review → implement after plan lock  
**Depends on:** Spike option A proven (`spikes/pda-buyer/results/SPIKE_RESULT.md`)  
**IDL pin:** `third_party/pump-sdk/PIN.md` (`@pump-fun/pump-sdk@1.36.0`) — authoritative for buy remaining accounts  

---

## 1. Goal

Ship the on-chain **batchit** program that:

1. Escrows contributor SOL under program authority (no human custody).
2. At `launch_at`, allows a **Jito bundle** of create + single PDA buy.
3. Finalizes distributable supply + burn, then pro-rata claim / permissionless refund.

Phase 1 is **program + localnet tests + unit-testable state machine**. Full devnet anti-snipe acceptance is **in scope for the launch executor path** (orchestrator may be a thin script in phase 1; polish later).

---

## 2. Non-negotiables from spike (fold into design)

### 2.1 Bundle atomicity is load-bearing

Create + buy **cannot** fit one Solana transaction (size). Therefore:

| Guarantee | Mechanism |
|-----------|-----------|
| No snipe window between create and buy | **Jito bundle** (txs land contiguously / all-or-nothing at the engine) |
| Anti-snipe acceptance | **Live devnet test**: adversarial buy attempt between create and buy **must fail to extract edge** when launch uses the production bundle path |
| Config | Block engine URL, tip, RPC — all via `config/` + env (never hard-coded for mainnet) |

The anti-snipe test is **not optional** and is the **acceptance test** for the fair-launch thesis.

### 2.2 Partial landing must be designed, not patched

Jito is the primary atomicity layer. The on-chain state machine still needs **explicit answers** when reality diverges (dropped tips, engine outage, mis-submission as separate RPCs, devnet without real Jito).

See §4.

### 2.3 PDA buyer + creator (option A)

- Buyer = program PDA (`buyer` seeds tied to pool).
- Pump `creator` arg = same PDA (neutral; fee routing deferred).
- Buy CPI: `buy_exact_sol_in` + remaining `[bonding_curve_v2, buyback_fee_recipient]` per pin.

---

## 3. Scope

### In phase 1

| Deliverable | Notes |
|-------------|--------|
| `programs/batchit` Anchor program | instructions below |
| Pool / contribution accounts | PDA layout, checked math |
| State machine incl. partial launch | §4 |
| `execute` path: PDA buy CPI | reuse spike layout |
| `finalize` (distributable + burn) | may stub curve read; full burn math package can be phase 2 if shared TS/Rust |
| `claim` / `refund` / `close_pool` | |
| Localnet tests | happy path, refund w/o orchestrator, double-claim, claim-before-finalize, fund-grab |
| **Partial-landing unit/integration tests** | create-only recovery, buy-only impossible |
| Thin `apps/orchestrator` or `scripts/launch.ts` | build create+buy bundle, submit Jito, crash-resume |
| **Devnet anti-snipe acceptance test** | §7 — blocking for “phase 1 done” |
| Docs: trust assumptions for escrow | who can do what if malicious/absent |
| IDL pin recorded | already: `third_party/pump-sdk/PIN.md` |

### Out of phase 1 (phase 2+)

- Full `packages/core` burn property tests (can start in parallel after state machine locks)
- Production web UI
- Mainnet
- Creator-fee recirculation policy (open economic question — flag only)

### Proposed pool defaults (still confirm)

| Param | Default |
|-------|---------|
| `min_raise` | 1 SOL |
| `max_pool` | 10 SOL |
| `min_contribution` | 0.05 SOL |
| Contribution window | until `launch_at` |
| `grace` after `launch_at` | 1 hour |

---

## 4. State machine (including partial landing)

### 4.1 States

```
                    create_pool
                        │
                        ▼
                    ┌─────────┐
         contribute │  Open   │◄── contributions until launch_at
                    └────┬────┘
                         │ begin_launch (in [launch_at, launch_at+grace))
                         │ commits mint pubkey; locks further contribute
                         ▼
                    ┌─────────────┐
                    │  Launching  │  mint committed; SOL still in escrow
                    └──────┬──────┘
           ┌───────────────┼────────────────┐
           │               │                │
     complete_buy    (timeout grace)   (optional) retry
     buy CPI ok            │                │
           │               ▼                │
           │        ┌────────────┐          │
           │        │ Refundable │◄─────────┘  if never Bought
           │        └─────┬──────┘
           ▼              │ refund / close
    ┌────────────┐        ▼
    │   Bought   │     Closed
    └─────┬──────┘
          │ finalize (burn + distributable)
          ▼
    ┌────────────┐
    │ Finalized  │── claim ──► (per-user Claimed)
    └────────────┘
          │
          ▼ close when empty
       Closed
```

| State | Meaning | SOL | Tokens |
|-------|---------|-----|--------|
| `Open` | Accepting contributions | In pool escrow PDA | none |
| `Launching` | Mint **committed**; create±buy in progress or retryable | Still in escrow until buy | none of ours yet |
| `Bought` | PDA holds curve tokens from **one** pool buy | Spent on curve | In vault ATA |
| `Finalized` | Burn done; claimable | dust only | vault distributable |
| `Refundable` | Grace expired without `Bought` | Escrow intact | ignore orphan mint |
| `Closed` | Rent reclaimed | zero | zero |

### 4.2 Partial landing: create landed, buy did not

**This is possible** if someone submits create and buy as non-atomic txs, or a bundle is malformed, or a future engine bug. It is **the dangerous case**.

**Designed handling:**

1. **`begin_launch(mint)`** (on-chain, permissionless after `launch_at` or orchestrator-gated only by time) writes:
   - `pool.mint = mint`
   - `pool.status = Launching`
   - `pool.launch_started_slot` / timestamp  
   Does **not** move SOL to the curve yet.

2. **Create** (pump `create` / `create_v2`) is **off-program**, mint keypair held by orchestrator only for signing create. Mint pubkey was committed in `begin_launch` so create cannot retarget another mint.

3. **`complete_buy`** (on-chain):
   - Requires `Launching` and `pool.mint` match accounts.
   - Detects bonding curve existence for `pool.mint`.
   - If curve **missing**: fail with `CreateNotLanded` (caller must include create in next bundle).
   - If curve **exists**: CPI `buy_exact_sol_in` with full escrow (or capped `max_pool`) via buyer PDA; on success → `Bought`.
   - **Idempotent:** if already `Bought`, no-op success.

4. **Retry path:** While `Launching` and within grace:
   - Bundle may be **buy-only** if create already landed (curve exists).
   - Bundle may be **create+buy** if curve missing.
   - Orchestrator crash-resume: inspect chain (mint account / curve / pool status), rebuild appropriate bundle.

5. **After grace without `Bought`:** anyone calls `mark_refundable` (or refund checks grace inline) → contributors `refund`.  
   **Orphan mint:** if create landed but buy never did, the pump coin may exist and be sniped. Escrow SOL is still fully refundable. **We do not attempt to “rescue” an orphan mint** into the pool (would break one-price invariant). Document as non-goal.

6. **Code path that minimizes this window in production:** orchestrator **must** submit create+buy only via Jito `sendBundle`. Submitting via sequential RPC is a **dev/debug flag** that fails CI acceptance for anti-snipe.

### 4.3 Partial landing: buy landed, create did not

**Impossible by construction.**

- `complete_buy` CPI into pump requires an initialized bonding curve for `mint`.
- Pump `buy_exact_sol_in` fails if create never ran.
- Therefore no state transition to `Bought` without a prior successful create for that mint.
- **Test:** localnet — call `complete_buy` without create → expect failure; pool remains `Launching` or `Open` as appropriate; SOL unchanged.

### 4.4 Bundle all-or-nothing (happy path)

When Jito works correctly:

- Neither create nor buy lands alone under honest submission.
- On-chain may still see only `begin_launch` then later both external create + `complete_buy` in the same slot / contiguous slots.
- State goes `Open` → `Launching` → `Bought` without lingering create-only **if** the orchestrator only uses bundles.

`begin_launch` is **before** the bundle so mint is committed and pool stops taking contributions; it is not a third “fund movement” step.

Suggested bundle shape (2–3 txs):

| Tx | Contents |
|----|----------|
| 0 (optional) | `begin_launch` if not already sent |
| 1 | pump `create` (+ compute budget) |
| 2 | `complete_buy` (fund buyer PDA from escrow + ATA + buy CPI) + Jito tip |

Or: `begin_launch` landed earlier in the grace window (separate confirmed tx), then 2-tx bundle create|buy+tip.

### 4.5 Who can call what

| Actor | Can | Cannot |
|-------|-----|--------|
| Anyone | contribute, refund (when allowed), claim (when allowed), `mark_refundable`, `complete_buy` (if time ok), `begin_launch` (if time ok) | steal SOL, change allocations |
| Orchestrator | same as anyone + off-chain mint keygen, bundle submit | redirect funds; block refunds after grace |
| Creator / pool maker | set params at `create_pool` only | touch escrow after open |
| Upgrade authority | program upgrades until revoked | should not be required for refunds |

**Untrusted orchestrator:** absence → after grace, refunds work. Presence → can only help land create+buy in window.

---

## 5. Accounts (sketch)

### `Pool` (PDA: `["pool", creator, pool_id]` or `["pool", seed]`)

```
status: u8
creator: Pubkey          // fee-payer of create_pool; not fund custodian
buyer_bump: u8
mint: Pubkey             // default until begin_launch
launch_at: i64
grace_ends_at: i64       // launch_at + grace
min_raise: u64
max_pool: u64
min_contribution: u64
total_contributed: u64
contributor_count: u32
tokens_bought: u64       // set at Bought
distributable: u64       // set at Finalized
burned: u64
final_price_num/den or reserves snapshot for audit event
```

### `Contribution` (PDA: `["contribution", pool, contributor]`)

```
contributor: Pubkey
amount: u64
claimed: bool
refunded: bool
```

### PDAs

| PDA | Seeds | Role |
|-----|-------|------|
| Pool | `["pool", …]` | config + aggregates |
| Escrow / vault SOL | pool PDA itself or `["escrow", pool]` | hold SOL |
| Buyer | `["buyer", pool]` | signs pump buy |
| Token vault | ATA of buyer or `["vault", pool]` | hold tokens pre-claim |
| Contribution | `["contribution", pool, user]` | per-user |

---

## 6. Instructions

| Instruction | State in | State out | Notes |
|-------------|----------|-----------|--------|
| `create_pool` | — | `Open` | params: launch_at, grace, min/max, min_contribution |
| `contribute` | `Open` | `Open` | now < launch_at; amount ≥ min; total ≤ max |
| `begin_launch` | `Open` | `Launching` | now ∈ [launch_at, grace); commit mint; min_raise met |
| `complete_buy` | `Launching` | `Bought` | PDA buy CPI; remaining accounts per pin |
| `finalize` | `Bought` | `Finalized` | compute distributable from curve reserves; SPL burn |
| `claim` | `Finalized` | — | pro-rata; simultaneous unlock (no per-user vesting) |
| `refund` | `Open` (optional cancel?) / `Refundable` / grace-failed `Launching` | — | permissionless |
| `mark_refundable` | `Launching` after grace | `Refundable` | if not Bought |
| `close_pool` | terminal empty | `Closed` | reclaim rent |

**No** instruction lets orchestrator set allocations or withdraw SOL arbitrarily.

### `complete_buy` checklist (CPI)

1. Transfer SOL escrow → buyer PDA (exact spendable budget).
2. Ensure buyer ATA for mint.
3. CPI `buy_exact_sol_in` with remaining `[bonding_curve_v2, buyback]`.
4. Fee recipient from **on-chain Global**, not from untrusted arg (or arg must match Global allowlist).
5. Record `tokens_bought`; status `Bought`.
6. Emit event for audit.

---

## 7. Testing plan (phase 1 gate)

### 7.1 Localnet / unit

- Happy path: contribute → begin_launch → create (test harness) → complete_buy → finalize → claim.
- Refund with orchestrator absent after grace.
- Failure injection: buy fails, min unmet, double-claim, claim before finalize, non-contributor claim.
- Adversarial: creator/orchestrator fund-grab attempts.
- **Partial landing:**
  - Create without buy → still `Launching` → refund after grace recovers full SOL.
  - Create without buy → `complete_buy` retry succeeds (buy-only).
  - Buy without create → fails; SOL unchanged.
- Boundaries: exact cap, exact min, single contributor.

### 7.2 Devnet acceptance (blocking)

| Test | Pass criteria |
|------|----------------|
| **Anti-snipe (load-bearing)** | Launch via production bundle path; concurrent bot tries to buy between create and buy; **bot does not fill before pool buy** (or fills only in same atomic bundle slot with no advantage — prefer strict: pool buy is first trade on curve) |
| Full pipeline | real mint, real Jito (or documented devnet fallback + same-slot simulation), PDA buy |
| Crash-recovery | kill orchestrator after `begin_launch`, after create-only, resume → Bought or Refundable |
| Bundle failure → refund | force failed buy; grace → full refund |

Record results under `spikes/` or `docs/test-results/`.

---

## 8. Orchestrator (thin, phase 1)

Crash-safe stages (persisted locally):

```
idle → pool_open → waiting_launch_at → begin_launch_sent
  → building_bundle → bundle_submitted → confirming
  → bought → finalized → done
                 ↘ failed → retry_or_wait_refund
```

On resume: **read chain first** (pool status, mint account, curve account), then decide create+buy vs buy-only vs wait refund.

---

## 9. Implementation order

1. **IDL pin freeze** — `third_party/pump-sdk/PIN.md` (done with this plan).
2. Scaffold `programs/batchit` (from spike lite lessons: keep CPI surface lean).
3. Accounts + `create_pool` / `contribute` / `refund` (Open path) + tests.
4. `begin_launch` + `complete_buy` CPI + partial-landing tests.
5. `finalize` + `claim` (burn math: port spike-ready formulas; property tests if time).
6. Thin orchestrator + Jito submitter (config-backed).
7. **Devnet anti-snipe acceptance** — must pass to close phase 1.
8. Trust-assumption doc page draft.

---

## 10. Risks & open items

| Risk | Mitigation |
|------|------------|
| Devnet Jito not real | Acceptance test design: use multi-tx simulation / same-leader bundle tools; mainnet Jito required before production |
| Orphan mint after create-only | Documented; refunds protect SOL; don't auto-retry create with new mint after commit without explicit `abort` (not in v1 — grace → refund only) |
| Tx size / CU | Already known; tip + CU budget in orchestrator |
| Creator fees on PDA | Open economic question; collect path later |
| Program upgrade authority | Document immutability path in threat model (phase 6 docs) |

---

## 11. Success criteria for “Phase 1 done”

- [ ] All localnet tests green (including partial-landing matrix).
- [ ] Devnet anti-snipe acceptance recorded and passed.
- [ ] Crash-resume of orchestrator demonstrated for Launching → Bought.
- [ ] Refund after grace without orchestrator demonstrated.
- [ ] IDL pin + trust notes in repo.
- [ ] No mainnet keys or mainnet deploys.

---

## 12. Locked decisions (2026-07-25)

| # | Decision |
|---|----------|
| 1 | **`begin_launch` is permissionless** after `launch_at` (and before grace end), subject to `min_raise` met and mint commit rules. Liveness without orchestrator. |
| 2 | Defaults: **min_raise 1 SOL**, **max_pool 10 SOL**, **min_contribution 0.05 SOL**, **grace 1h**. |
| 3 | Phase 1 **includes full finalize + burn + claim** (not deferred). |

Implementation starts at §9 step 2.
