import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allocation, computeDistributable } from "./burn.js";

describe("burn math", () => {
  it("distributable <= bought and sums with burn", () => {
    const r = computeDistributable(
      1_000_000_000n,
      100_000_000n,
      1_000_000n,
      20_000_000_000n,
    );
    assert.ok(r.distributable <= r.tokensBought);
    assert.equal(r.distributable + r.burned, r.tokensBought);
  });

  it("property: value at final price <= total contributed", () => {
    const total = 5_000_000_000n;
    const vtok = 500_000_000_000n;
    const vquote = 40_000_000_000n;
    const bought = 200_000_000_000n;
    const r = computeDistributable(total, bought, vtok, vquote);
    const value = (r.distributable * vquote) / vtok;
    assert.ok(value <= total);
  });

  it("split dust favors burn (sum floors <= distributable)", () => {
    const dist = 100n;
    const total = 3n;
    const a = allocation(dist, 1n, total);
    assert.equal(a * 3n, 99n);
    assert.ok(a * 3n <= dist);
  });

  it("1 / 2 / 100 contributors extreme ratios", () => {
    const dist = 1_000_000n;
    assert.equal(allocation(dist, 10n, 10n), dist);

    const a1 = allocation(dist, 1n, 2n);
    const a2 = allocation(dist, 1n, 2n);
    assert.ok(a1 + a2 <= dist);

    let sum = 0n;
    for (let i = 0; i < 100; i++) {
      sum += allocation(dist, 1n, 100n);
    }
    assert.ok(sum <= dist);

    const tiny = allocation(dist, 1n, 1_000_000_000n);
    const huge = allocation(dist, 999_999_999n, 1_000_000_000n);
    assert.ok(tiny + huge <= dist);
    assert.ok(huge > tiny);
  });
});
