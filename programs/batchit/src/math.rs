//! Burn / split math — dust always favors the burn.
//!
//! final_price ~ post_virtual_quote / post_virtual_token (lamports per raw token)
//!
//! distributable = floor(total_contributed * post_virtual_token / post_virtual_quote)
//!
//! burn = tokens_bought - distributable (after capping distributable)
//!
//! allocation(i) = floor(distributable * contribution(i) / total_contributed)
//!
//! Sum of floors <= distributable; remainder is un-allocatable dust (favor burn).

use crate::error::BatchitError;
use anchor_lang::prelude::*;

/// Compute distributable token amount from post-buy curve reserves and pool SOL.
/// Caps at `tokens_bought`. Dust favors burn.
pub fn compute_distributable(
    total_contributed: u64,
    tokens_bought: u64,
    post_virtual_token_reserves: u64,
    post_virtual_quote_reserves: u64,
) -> Result<(u64, u64)> {
    require!(tokens_bought > 0, BatchitError::ZeroTokensBought);
    require!(post_virtual_quote_reserves > 0, BatchitError::MathOverflow);
    require!(total_contributed > 0, BatchitError::ZeroAmount);

    // distributable = floor(total_contributed * virtual_token / virtual_quote)
    let num = (total_contributed as u128)
        .checked_mul(post_virtual_token_reserves as u128)
        .ok_or(BatchitError::MathOverflow)?;
    let mut distributable = num
        .checked_div(post_virtual_quote_reserves as u128)
        .ok_or(BatchitError::MathOverflow)? as u64;

    // Never distribute more than bought (dust / rounding favor burn)
    if distributable > tokens_bought {
        distributable = tokens_bought;
    }

    let burned = tokens_bought
        .checked_sub(distributable)
        .ok_or(BatchitError::MathOverflow)?;

    Ok((distributable, burned))
}

/// Pro-rata allocation; floor division so sum(allocations) ≤ distributable.
pub fn allocation(distributable: u64, contribution: u64, total_contributed: u64) -> Result<u64> {
    require!(total_contributed > 0, BatchitError::ZeroAmount);
    if contribution == 0 || distributable == 0 {
        return Ok(0);
    }
    let n = (distributable as u128)
        .checked_mul(contribution as u128)
        .ok_or(BatchitError::MathOverflow)?;
    Ok((n / (total_contributed as u128)) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn distributable_leq_bought() {
        // 1 SOL contributed, price after buy higher than average fill
        let total = 1_000_000_000u64;
        let bought = 100_000_000u64;
        // price = quote/token high → smaller distributable
        let (d, b) = compute_distributable(total, bought, 1_000_000, 20_000_000_000).unwrap();
        assert!(d <= bought);
        assert_eq!(d + b, bought);
    }

    #[test]
    fn property_cost_basis_near_price() {
        // distributable * quote / token ≈ total (within 1 unit of floor error scaled)
        let total = 5_000_000_000u64;
        let vtok = 500_000_000_000u64;
        let vquote = 40_000_000_000u64;
        let bought = 200_000_000_000u64;
        let (d, _) = compute_distributable(total, bought, vtok, vquote).unwrap();
        // value at final price: d * vquote / vtok ≤ total
        let value = (d as u128) * (vquote as u128) / (vtok as u128);
        assert!(value <= total as u128);
        // and close: total - value < vquote/vtok scale (one token's quote value)
        let one_token_quote = (vquote as u128) / (vtok as u128).max(1);
        assert!(total as u128 - value <= one_token_quote + 1);
    }

    #[test]
    fn split_dust_favors_burn() {
        let dist = 100u64;
        let total = 3u64;
        // 1,1,1 contributions
        let a = allocation(dist, 1, total).unwrap();
        assert_eq!(a * 3, 99); // 1 dust left undistributed
        assert!(a * 3 <= dist);
    }

    #[test]
    fn extreme_ratio() {
        let dist = 1_000_000u64;
        let total = 1_000_000_000u64;
        let tiny = 1u64;
        let huge = total - tiny;
        let a_tiny = allocation(dist, tiny, total).unwrap();
        let a_huge = allocation(dist, huge, total).unwrap();
        assert!(a_tiny + a_huge <= dist);
        assert!(a_huge > a_tiny);
    }
}
