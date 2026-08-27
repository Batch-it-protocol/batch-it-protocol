//! Batch It! on-chain escrow.
//!
//! Design invariants: one buy / one price, no human custody, simultaneous unlock,
//! permissionless refund, untrusted orchestrator.
//!
//! Partial landing: see docs/plans/phase-1-escrow.md §4.

use anchor_lang::prelude::*;

pub mod error;
pub mod events;
pub mod instructions;
pub mod math;
pub mod pump;
pub mod state;

use instructions::*;

declare_id!("4wnT3AC6ZM6hCUL95WdAR6i7aTsefmRqZ3cZGbvWnrMv");

#[program]
pub mod batchit {
    use super::*;

    pub fn create_pool(
        ctx: Context<CreatePool>,
        seed: u64,
        launch_at: i64,
        grace_secs: i64,
        min_raise_lamports: u64,
        max_pool_lamports: u64,
        min_contribution_lamports: u64,
    ) -> Result<()> {
        instructions::create_pool::handler(
            ctx,
            seed,
            launch_at,
            grace_secs,
            min_raise_lamports,
            max_pool_lamports,
            min_contribution_lamports,
        )
    }

    pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
        instructions::contribute::handler(ctx, amount)
    }

    /// Permissionless after launch_at when min_raise met. Commits mint → Launching.
    pub fn begin_launch(ctx: Context<BeginLaunch>, mint: Pubkey) -> Result<()> {
        instructions::begin_launch::handler(ctx, mint)
    }

    /// PDA pump buy. Fails CreateNotLanded if curve missing (create didn't land).
    pub fn complete_buy(ctx: Context<CompleteBuy>, min_tokens_out: u64) -> Result<()> {
        instructions::complete_buy::handler(ctx, min_tokens_out)
    }

    pub fn finalize(ctx: Context<Finalize>) -> Result<()> {
        instructions::finalize::handler(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handler(ctx)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handler(ctx)
    }

    pub fn mark_refundable(ctx: Context<MarkRefundable>) -> Result<()> {
        instructions::mark_refundable::handler(ctx)
    }

    pub fn close_pool(ctx: Context<ClosePool>) -> Result<()> {
        instructions::close_pool::handler(ctx)
    }
}
