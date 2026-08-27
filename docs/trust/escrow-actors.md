# Trust assumptions — escrow actors

Plain-language map of **who can do what**, and what happens if each actor is **malicious** or **absent**.

## Actors

| Actor | Role |
|-------|------|
| **Contributors** | Deposit SOL; later claim tokens or refund |
| **Pool creator** | Sets params at `create_pool` (timing, caps); not a custodian |
| **Orchestrator** | Off-chain agent: generates mint keypair, builds Jito bundle, submits create+buy |
| **Batchit program** | Sole custodian of pooled SOL and (after buy) vault tokens |
| **Pump.fun program** | Bonding curve; external dependency |
| **Jito block engine** | Bundle atomicity for create+buy (load-bearing) |
| **Upgrade authority** | Can upgrade batchit until revoked / made immutable |

## Guarantees (on-chain)

| Guarantee | Mechanism |
|-----------|-----------|
| One buy, one price | Single `complete_buy` CPI; all claims from same vault fill |
| No human custody of pool SOL | SOL only in pool PDA / curve / buyer PDA under program seeds |
| Simultaneous unlock | All claims available after `Finalized`; no ordering privilege in program |
| Permissionless refund | After grace without `Bought`, anyone can refund their contribution |
| Untrusted orchestrator | Cannot redirect SOL, change allocations, or block refunds after grace |
| Create-without-buy recovery | Stay `Launching`; retry buy-only or grace → full SOL refund |
| Buy-without-create | Impossible: `CreateNotLanded` / pump CPI fail |

## Non-guarantees

| Non-guarantee | Why |
|---------------|-----|
| Post-launch price for later market buyers | Open market; later buyers pay more — not a violation |
| Orphan mint recovery | If create lands and buy never does, mint may be sniped; **SOL still refundable**; we do not pull orphan supply into the pool |
| Jito always lands | Engine can drop bundles; on-chain recovery + refund prevent stuck funds |
| Orchestrator availability | Absence only delays launch; after grace, refunds work without them |
| Creator fee economics | PDA creator fees routing still open (do not silently leave unclaimed forever) |

## Malicious / absent matrix

| Actor | Malicious | Absent |
|-------|-----------|--------|
| **Orchestrator** | Can grief by not launching (until grace → refund). Cannot steal pool SOL. Can front-run only if they **break** production rules and use sequential RPC (anti-snipe test forbids this). | Grace → refund |
| **Pool creator** | Params fixed at create; cannot drain escrow | Irrelevant after open |
| **Contributor** | Can only affect own contribution; cannot claim others | — |
| **Upgrade authority** | Could deploy malicious upgrade if not revoked | Prefer immutability before large TVL |
| **Jito** | Censorship/drop → retry or refund path | Same |
| **Pump** | External risk; not under batchit control | Launch fails → refund |

## Bundle atomicity (load-bearing)

Production **must** submit create+buy as a **Jito bundle**. Sequential RPC is a **debug flag** only and **fails** the anti-snipe acceptance test.

Acceptance criterion: on the real launch path, a concurrent snipe attempt between create and buy must **not** get a fill before the pool’s PDA buy (pool buy is first on the curve).

## Upgrade-authority path to immutability

1. Devnet: upgradeable while iterating.
2. Pre-mainnet: external review + freeze decision.
3. Mainnet: either multisig with delay, or **relinquish upgrade authority** after first successful small pool.
4. Document the chosen model in the threat-model docs page before mainnet.
