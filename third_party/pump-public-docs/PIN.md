# Pinned pump-public-docs

**Do not track `main`.** Layouts have shifted (creator fees, buy_v2, etc.).

> **Buy remaining-accounts layout:** use **`third_party/pump-sdk/PIN.md`** (`@pump-fun/pump-sdk@1.36.0`) — that is what the option-A spike proved on-chain. Public-docs IDL here does **not** fully document `bonding_curve_v2` + buyback remaining accounts on `buy_exact_sol_in`.

| Field | Value |
|-------|-------|
| Repo | https://github.com/pump-fun/pump-public-docs |
| Commit | `9c82f61cb711b044a17f770ab8ce9f9bdf78f333` |
| Date | 2026-07-15 |
| Message | chore: README virtual quotes reserves |
| Local IDL | `third_party/pump-public-docs/pump.json` |
| IDL SHA-256 | `B90BC471327F671449271D5D1D42354D1FAE6F5A06502F5834459A3108138E49` |
| Role | Background docs / overview — **not** sole authority for buy CPI accounts |

## Program IDs (from IDL + docs at this commit)

| Program | Address |
|---------|---------|
| Pump (bonding curve) | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| Pump Fees | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` |
| Mayhem (create_v2) | `MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e` |
| Token-2022 | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` |
| SPL Token | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| Associated Token | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` |
| Metaplex Token Metadata | `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s` |
| Native SOL (WSOL mint) | `So11111111111111111111111111111111111111112` |

## Fee recipients (non-mayhem)

See `FEE_RECIPIENTS.md`. Spike picks the first normal recipient and first buyback recipient.

## Refresh procedure

1. Pick a commit hash; download `idl/pump.json`.
2. Update this file (commit, date, SHA-256).
3. Re-run spike tests before relying on layout.
