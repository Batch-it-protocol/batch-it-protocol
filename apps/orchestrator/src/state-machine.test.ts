import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bundleKind, nextStageFromChain } from "./state-machine.js";

describe("partial-landing orchestration", () => {
  it("create not landed → create_and_buy", () => {
    assert.equal(
      bundleKind({ poolStatus: "Launching", curveExists: false }),
      "create_and_buy",
    );
  });

  it("create landed buy not → buy_only", () => {
    assert.equal(
      bundleKind({ poolStatus: "Launching", curveExists: true }),
      "buy_only",
    );
  });

  it("grace expired → refund_window", () => {
    assert.equal(
      nextStageFromChain({
        poolStatus: "Launching",
        curveExists: true,
        now: 2000,
        graceEndsAt: 1000,
      }),
      "refund_window",
    );
  });

  it("bought → bought", () => {
    assert.equal(
      nextStageFromChain({
        poolStatus: "Bought",
        curveExists: true,
        now: 1,
        graceEndsAt: 9999,
      }),
      "bought",
    );
  });
});
