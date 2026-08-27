# AS-1 Anti-snipe acceptance artifact

**Status:** PENDING / PASS / FAIL  
**Date (UTC):**  
**Cluster:**  
**batchit program:**  
**Orchestrator submission mode:** `jito` (required)  

## Criterion (strict)

Pool PDA buy is the **first** non-zero fill on the bonding curve. Concurrent sniper in the create→buy window does not fill first.

## Identifiers

| Item | Value |
|------|--------|
| Pool | |
| Mint | |
| Buyer PDA | |
| Jito bundle id | |
| Create tx | |
| complete_buy tx | |
| Sniper tx(s) | |

## Evidence

1. Slot / block ordering (explorer links or RPC `getTransaction` slot numbers):
2. First trade on curve (who, amount, signature):
3. Sniper result (failed / landed after pool / landed before → **FAIL**):

## Logs

```
(paste orchestrator + sniper logs)
```

## Sign-off

- [ ] Production path only (no `BATCHIT_ALLOW_SEQUENTIAL_RPC`)
- [ ] Artifact reviewed
- [ ] Phase 1 gate: AS-1 = PASS
