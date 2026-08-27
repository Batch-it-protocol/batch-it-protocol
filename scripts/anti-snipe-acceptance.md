# Anti-snipe acceptance test (blocking)

## Criterion (strict)

On the **production launch path** (Jito bundle only):

1. Pool has `begin_launch` committed mint.
2. Orchestrator submits **create + complete_buy** as a single Jito bundle (plus tip).
3. Concurrently, a sniper bot submits a buy for the same mint as soon as create is visible.
4. **Pass:** the first non-zero fill on the bonding curve is the pool buyer PDA (our `complete_buy`). Sniper cannot buy at a lower price than the pool fill.
5. **Fail:** sniper transaction lands with a fill before the pool buy.

## How to run (devnet)

```powershell
# Requires funded keypair + deployed batchit
$env:BATCHIT_RPC_URL="https://api.devnet.solana.com"
$env:BATCHIT_JITO_BLOCK_ENGINE_URL="..."  # mainnet engine may not apply on devnet
# Document actual engine used; if Jito unavailable on devnet, use same-slot multi-tx simulation
# and re-run AS-1 on mainnet-beta with tiny pool before production.

npm run --prefix apps/orchestrator launch
# + sniper script (to be wired in packages/adapters)
```

## Devnet caveat

Public Jito engines are mainnet-oriented. If AS-1 cannot run on public devnet Jito:

1. Record the limitation in results.
2. Still implement the harness.
3. Run AS-1 on a Jito-enabled environment before mainnet gate.
4. Local/partial simulation of race is **not** a substitute for the acceptance criterion above.

Results directory: `docs/test-results/anti-snipe/`
