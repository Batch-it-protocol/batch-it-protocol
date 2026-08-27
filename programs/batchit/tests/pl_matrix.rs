//! Partial-landing matrix tests using solana-program-test + real pump ELF when available.
//!
//! Run from repo root (Windows-friendly; no solana-test-validator):
//!   cargo test-sbf -p batchit -- --nocapture
//! or:
//!   cargo test -p batchit --test pl_matrix -- --nocapture
//!
//! SBF_OUT_DIR / fixtures: pump.so, batchit.so must be discoverable.

#![cfg(feature = "pl-integration")]

// Integration feature gate — enable with --features pl-integration
// Placeholder: full bank client tests require matching solana-program-test version.
// See tests/localnet for the primary PL harness (validator-based).
