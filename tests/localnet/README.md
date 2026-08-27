# Localnet PL matrix — real pump

Proves partial-landing (PL-1…PL-10) against:

1. **Real pump program** ELF dumped from devnet (`fixtures/pump.so`)
2. **Real fee program + Global + fee_config** (cloned accounts)
3. **batchit** deployed to local `solana-test-validator`

Not the orchestrator mock. LiteSVM is unavailable on Windows; we use the Agave test validator.

## Prerequisites

- Solana CLI (`solana-test-validator`, `solana program deploy`)
- Built batchit: `cargo build-sbf --manifest-path programs/batchit/Cargo.toml`
- Node 20+

Fixtures are pre-populated under `fixtures/` (re-dump from devnet if pump upgrades):

```powershell
solana program dump -u devnet 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P fixtures/pump.so
# fee, metaplex, mayhem, global, fee_config, gva — see repo history / setup script
```

## Run

### Preferred: local validator + real pump fixtures

```powershell
cd tests/localnet
npm install
npm test
# or step-by-step:
npm run validator:start
npm run deploy
npm run test:pl
npm run validator:stop
```

Keep validator: `$env:BATCHIT_KEEP_VALIDATOR=1; npm test`

### Windows host note

On some Windows setups `solana-test-validator` fails with:

`Error checking to unpack genesis archive: Access is denied (os error 5)`

If that happens, use the **devnet fallback** which still hits **real pump create/buy CPI** (sequential txs — intentional for partial-landing, not Jito):

```powershell
# Deploy batchit to devnet once (needs SOL)
solana program deploy ..\..\target\deploy\batchit.so `
  --program-id ..\..\keys\batchit-program.json -u devnet --keypair ..\..\keys\devnet-funder.json

$env:BATCHIT_KEYPAIR_PATH="..\..\keys\devnet-funder.json"
$env:BATCHIT_RPC_URL="https://api.devnet.solana.com"
npm run test:pl:devnet
```

Artifact: `docs/test-results/pl-matrix-latest.json`

This is **not** AS-1. Anti-snipe remains a separate gate with Jito + artifact template.

## Critical cases

| ID | What is real |
|----|----------------|
| PL-1 | Curve PDA empty / not pump-owned → `CreateNotLanded`; SOL recoverable |
| PL-2 | **pump create** lands; status stays `Launching` |
| PL-3 | **pump CPI buy** via `complete_buy` → `Bought` + tokens |
| PL-4 | Create-only then grace → full SOL refund; orphan mint remains |
| PL-5 | Same as PL-1 |
| PL-6 | Idempotent `complete_buy` |
| PL-9/10 | Refund gates + orchestrator-absent refund |

## AS-1 artifact (later / devnet)

When anti-snipe runs, write evidence to `docs/test-results/anti-snipe/`:

- Timestamp, cluster, bundle id
- Create sig, pool buy sig, sniper sig(s)
- Curve trade order proof (first non-zero fill = buyer PDA)
- Pass/fail against strict criterion

See `scripts/anti-snipe-acceptance.md` and `docs/test-results/anti-snipe/TEMPLATE.md`.
