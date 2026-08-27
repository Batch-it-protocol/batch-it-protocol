/**
 * Burn / split math — mirrors programs/batchit/src/math.rs
 * Dust always favors the burn.
 */

export type BurnBreakdown = {
  distributable: bigint;
  burned: bigint;
  totalContributed: bigint;
  tokensBought: bigint;
  postVirtualTokenReserves: bigint;
  postVirtualQuoteReserves: bigint;
};

/** floor(total * virtual_token / virtual_quote), capped at tokensBought */
export function computeDistributable(
  totalContributed: bigint,
  tokensBought: bigint,
  postVirtualTokenReserves: bigint,
  postVirtualQuoteReserves: bigint,
): BurnBreakdown {
  if (tokensBought <= 0n) throw new Error("zero tokens bought");
  if (postVirtualQuoteReserves <= 0n) throw new Error("zero quote reserves");
  if (totalContributed <= 0n) throw new Error("zero contribution");

  let distributable =
    (totalContributed * postVirtualTokenReserves) / postVirtualQuoteReserves;
  if (distributable > tokensBought) distributable = tokensBought;
  const burned = tokensBought - distributable;

  return {
    distributable,
    burned,
    totalContributed,
    tokensBought,
    postVirtualTokenReserves,
    postVirtualQuoteReserves,
  };
}

/** floor(distributable * contribution / total) */
export function allocation(
  distributable: bigint,
  contribution: bigint,
  totalContributed: bigint,
): bigint {
  if (totalContributed <= 0n) throw new Error("zero total");
  if (contribution <= 0n || distributable <= 0n) return 0n;
  return (distributable * contribution) / totalContributed;
}

/** Projected burn ratio for UI before commit: burn/tokensBought ≈ 1 - avgFill/finalPrice */
export function projectedBurnRatio(
  totalContributed: bigint,
  estimatedTokensOut: bigint,
  postVirtualTokenReserves: bigint,
  postVirtualQuoteReserves: bigint,
): number {
  const { burned, tokensBought } = computeDistributable(
    totalContributed,
    estimatedTokensOut,
    postVirtualTokenReserves,
    postVirtualQuoteReserves,
  );
  if (tokensBought === 0n) return 0;
  return Number(burned) / Number(tokensBought);
}
